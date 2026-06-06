import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  Icon,
  Icons,
  Spinner,
  Text,
  Tooltip,
  TooltipProvider,
  as,
} from 'folds';
import classNames from 'classnames';
import { BlurhashCanvas } from 'react-blurhash';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import {
  IImageInfo,
  IThumbnailContent,
  MATRIX_BLUR_HASH_PROPERTY_NAME,
} from '../../../../types/matrix/common';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import * as css from './style.css';
import { bytesToSize } from '../../../utils/common';
import { FALLBACK_MIMETYPE } from '../../../utils/mimeTypes';
import {
  mxcUrlToHttp,
  shouldUseObjectUrlForMediaDisplay,
} from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { validBlurHash } from '../../../utils/blurHash';
import { primeCachedMediaObjectUrl } from '../../../utils/mediaUrlCache';
import { useStableMediaUrl } from '../../emoji-board/useStableMediaUrl';
import { prepareEncryptedMediaObjectUrl } from '../../../utils/encryptedMediaCache';
import { ImageViewerDialog } from '../../image-viewer';

const IMAGE_PREVIEW_WIDTH = 230;
const IMAGE_PREVIEW_HEIGHT = 460;

type RenderViewerProps = {
  src: string;
  alt: string;
  loading?: boolean;
  requestClose: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
};
export type ViewerImageItem = {
  id: string;
  body: string;
  mimeType?: string;
  url: string;
  info?: IImageInfo & IThumbnailContent;
  encInfo?: EncryptedAttachmentInfo;
};
type RenderImageProps = {
  alt: string;
  title: string;
  src: string;
  onLoad: () => void;
  onError: () => void;
  onClick: () => void;
  tabIndex: number;
};
type TimelineImageSource = {
  src: string;
  kind: 'thumbnail' | 'original';
};
export type ImageContentProps = {
  body: string;
  mimeType?: string;
  url: string;
  info?: IImageInfo & IThumbnailContent;
  encInfo?: EncryptedAttachmentInfo;
  autoPlay?: boolean;
  previewMediaStrategy?: 'prepared' | 'stable';
  markedAsSpoiler?: boolean;
  spoilerReason?: string;
  viewerItems?: ViewerImageItem[];
  viewerItemId?: string;
  renderViewer: (props: RenderViewerProps) => ReactNode;
  renderImage: (props: RenderImageProps) => ReactNode;
};
export const ImageContent = as<'div', ImageContentProps>(
  (
    {
      className,
      body,
      mimeType,
      url,
      info,
      encInfo,
      autoPlay,
      previewMediaStrategy = 'prepared',
      markedAsSpoiler,
      spoilerReason,
      viewerItems,
      viewerItemId,
      renderViewer,
      renderImage,
      ...props
    },
    ref
  ) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const blurHash = validBlurHash(info?.[MATRIX_BLUR_HASH_PROPERTY_NAME]);

    const [load, setLoad] = useState(false);
    const [error, setError] = useState(false);
    const [viewer, setViewer] = useState(false);
    const [activeViewerItemId, setActiveViewerItemId] = useState<string>();
    const [viewerSourceCache, setViewerSourceCache] = useState<Record<string, string>>({});
    const [loadingViewerItemId, setLoadingViewerItemId] = useState<string>();
    const [stableRetryNonce, setStableRetryNonce] = useState(0);
    const [blurred, setBlurred] = useState(markedAsSpoiler ?? false);
    const stablePreviewEnabled = autoPlay && previewMediaStrategy === 'stable' && !encInfo;
    const stableOriginalUrl =
      typeof url === 'string' && !url.startsWith('mxc://')
        ? url
        : (mxcUrlToHttp(mx, url, useAuthentication) ?? undefined);
    const stableThumbnailUrl =
      typeof info?.thumbnail_url === 'string'
        ? mxcUrlToHttp(mx, info.thumbnail_url, useAuthentication) ?? undefined
        : !encInfo
          ? (mxcUrlToHttp(
              mx,
              url,
              useAuthentication,
              IMAGE_PREVIEW_WIDTH,
              IMAGE_PREVIEW_HEIGHT,
              'scale'
            ) ?? undefined)
          : undefined;
    const {
      displayUrl: stablePreviewUrl,
      hasFailed: stablePreviewFailed,
      requestKey: stablePreviewRequestKey,
      handleLoad: handleStablePreviewLoad,
      handleError: handleStablePreviewError,
    } = useStableMediaUrl(
      stablePreviewEnabled ? stableOriginalUrl : undefined,
      stablePreviewEnabled ? stableThumbnailUrl : undefined,
      {
        mimeType,
        fallbackMimeType: mimeType,
      }
    );

    const prepareMediaSrc = useCallback(
      async (
        mediaMxcUrl: string,
        mediaMimeType: string,
        mediaEncInfo?: EncryptedAttachmentInfo,
        width?: number,
        height?: number,
        resizeMethod?: string
      ) => {
        const mediaUrl = mxcUrlToHttp(
          mx,
          mediaMxcUrl,
          useAuthentication,
          width,
          height,
          resizeMethod
        );
        if (!mediaUrl) throw new Error('Invalid media URL');

        if (mediaEncInfo) {
          return prepareEncryptedMediaObjectUrl(mediaUrl, mediaMimeType, mediaEncInfo);
        }

        const preparedMediaUrl = await primeCachedMediaObjectUrl(mediaUrl, 'visible');
        if (preparedMediaUrl) {
          return preparedMediaUrl;
        }

        if (shouldUseObjectUrlForMediaDisplay(mediaUrl)) {
          throw new Error('Failed to prepare image media');
        }

        return mediaUrl;
      },
      [mx, useAuthentication]
    );

    const [srcState, loadSrc] = useAsyncCallback(
      useCallback(async (): Promise<TimelineImageSource> => {
        const thumbMxcUrl = info?.thumbnail_file?.url ?? info?.thumbnail_url;
        const thumbMimeType = info?.thumbnail_info?.mimetype ?? mimeType ?? FALLBACK_MIMETYPE;
        const thumbEncInfo = info?.thumbnail_file;

        if (typeof thumbMxcUrl === 'string') {
          try {
            const thumbSrc = await prepareMediaSrc(thumbMxcUrl, thumbMimeType, thumbEncInfo);
            return {
              src: thumbSrc,
              kind: 'thumbnail',
            };
          } catch {
            // Fall back to the original image to preserve current behavior.
          }
        }

        if (!encInfo) {
          try {
            const thumbnailSrc = await prepareMediaSrc(
              url,
              mimeType ?? FALLBACK_MIMETYPE,
              undefined,
              IMAGE_PREVIEW_WIDTH,
              IMAGE_PREVIEW_HEIGHT,
              'scale'
            );
            return {
              src: thumbnailSrc,
              kind: 'thumbnail',
            };
          } catch {
            // Fall back to the original image when homeserver thumbnails are unavailable.
          }
        }

        const originalSrc = await prepareMediaSrc(
          url,
          mimeType ?? FALLBACK_MIMETYPE,
          encInfo
        );
        return {
          src: originalSrc,
          kind: 'original',
        };
      }, [encInfo, info, mimeType, prepareMediaSrc, url])
    );

    const [viewerSrcState, loadViewerSrc] = useAsyncCallback(
      useCallback(
        async () => prepareMediaSrc(url, mimeType ?? FALLBACK_MIMETYPE, encInfo),
        [encInfo, mimeType, prepareMediaSrc, url]
      )
    );
    const [viewerItemSrcState, loadViewerItemSrc] = useAsyncCallback<
      { itemId: string; src: string },
      Error,
      [ViewerImageItem]
    >(
      useCallback(
        async (item) => ({
          itemId: item.id,
          src: await prepareMediaSrc(item.url, item.mimeType ?? FALLBACK_MIMETYPE, item.encInfo),
        }),
        [prepareMediaSrc]
      )
    );

    const handleLoad = () => {
      setLoad(true);
      setError(false);
      if (stablePreviewEnabled) {
        handleStablePreviewLoad();
      }
    };
    const handleError = () => {
      setLoad(false);
      if (stablePreviewEnabled) {
        handleStablePreviewError();
        return;
      }
      setError(true);
    };

    const handleRetry = () => {
      setError(false);
      setLoad(false);
      if (stablePreviewEnabled) {
        setStableRetryNonce((current) => current + 1);
        return;
      }
      loadSrc().catch(() => undefined);
    };

    const handleOpenViewer = () => {
      setActiveViewerItemId(viewerItemId);
      setViewer(true);
      if (srcState.status === AsyncStatus.Success && srcState.data.kind === 'original') {
        return;
      }
      if (
        viewerSrcState.status === AsyncStatus.Idle ||
        viewerSrcState.status === AsyncStatus.Error
      ) {
        loadViewerSrc().catch(() => undefined);
      }
    };

    const handleCloseViewer = useCallback(() => {
      setViewer(false);
      setActiveViewerItemId(undefined);
    }, []);

    useEffect(() => {
      if (autoPlay && !stablePreviewEnabled) {
        loadSrc().catch(() => undefined);
      }
    }, [autoPlay, loadSrc, stablePreviewEnabled]);

    const previewSrc = stablePreviewEnabled
      ? stablePreviewUrl
      : srcState.status === AsyncStatus.Success
        ? srcState.data.src
        : undefined;
    const viewerSrc =
      viewerSrcState.status === AsyncStatus.Success ? viewerSrcState.data : previewSrc;
    const previewRenderKey = stablePreviewEnabled
      ? `${stablePreviewRequestKey}-${stableRetryNonce}`
      : previewSrc;
    const previewError = stablePreviewEnabled
      ? stablePreviewFailed
      : error || srcState.status === AsyncStatus.Error;
    const previewLoading = stablePreviewEnabled
      ? !stablePreviewFailed && (!previewSrc || !load)
      : (srcState.status === AsyncStatus.Loading || srcState.status === AsyncStatus.Success) &&
        !load;

    const currentViewerLoading =
      viewer &&
      srcState.status === AsyncStatus.Success &&
      srcState.data.kind === 'thumbnail' &&
      viewerSrcState.status !== AsyncStatus.Success;

    useEffect(() => {
      if (!viewerItemId || !viewerSrc) return;

      setViewerSourceCache((cache) => {
        if (cache[viewerItemId] === viewerSrc) return cache;
        return {
          ...cache,
          [viewerItemId]: viewerSrc,
        };
      });
    }, [viewerItemId, viewerSrc]);

    useEffect(() => {
      if (viewerItemSrcState.status !== AsyncStatus.Success) return;

      setViewerSourceCache((cache) => {
        if (cache[viewerItemSrcState.data.itemId] === viewerItemSrcState.data.src) return cache;
        return {
          ...cache,
          [viewerItemSrcState.data.itemId]: viewerItemSrcState.data.src,
        };
      });
    }, [viewerItemSrcState]);

    const activeViewerId = activeViewerItemId ?? viewerItemId;
    const activeViewerItem =
      viewerItems?.find((item) => item.id === activeViewerId) ??
      viewerItems?.find((item) => item.id === viewerItemId);
    const activeViewerIndex =
      activeViewerItem && viewerItems
        ? viewerItems.findIndex((item) => item.id === activeViewerItem.id)
        : -1;
    const cachedActiveViewerSrc = activeViewerItem
      ? viewerSourceCache[activeViewerItem.id]
      : undefined;
    const activeViewerSrc =
      cachedActiveViewerSrc ??
      (activeViewerItem?.id === viewerItemId ? viewerSrc : undefined) ??
      viewerSrc;
    const activeViewerLoading =
      !activeViewerItem || activeViewerItem.id === viewerItemId
        ? currentViewerLoading
        : !cachedActiveViewerSrc || loadingViewerItemId === activeViewerItem?.id;
    const viewerItemsCount = viewerItems?.length ?? 0;
    const viewerNavigationEnabled =
      !!viewerItems && viewerItemsCount > 1 && activeViewerIndex >= 0;

    const ensureViewerItemSource = useCallback(
      (item: ViewerImageItem) => {
        if (viewerSourceCache[item.id]) return;

        setLoadingViewerItemId(item.id);
        loadViewerItemSrc(item)
          .catch(() => undefined)
          .finally(() => {
            setLoadingViewerItemId((currentItemId) =>
              currentItemId === item.id ? undefined : currentItemId
            );
          });
      },
      [loadViewerItemSrc, viewerSourceCache]
    );

    const handleSelectViewerItem = useCallback(
      (itemId: string) => {
        const item = viewerItems?.find((entry) => entry.id === itemId);
        if (!item) return;

        setActiveViewerItemId(item.id);
        ensureViewerItemSource(item);
      },
      [ensureViewerItemSource, viewerItems]
    );

    const handlePrevViewerItem = useCallback(() => {
      if (!viewerItems || activeViewerIndex <= 0) return;
      handleSelectViewerItem(viewerItems[activeViewerIndex - 1].id);
    }, [activeViewerIndex, handleSelectViewerItem, viewerItems]);

    const handleNextViewerItem = useCallback(() => {
      if (!viewerItems || activeViewerIndex < 0 || activeViewerIndex >= viewerItems.length - 1) {
        return;
      }
      handleSelectViewerItem(viewerItems[activeViewerIndex + 1].id);
    }, [activeViewerIndex, handleSelectViewerItem, viewerItems]);

    return (
      <Box className={classNames(css.RelativeBase, className)} {...props} ref={ref}>
        {viewer && activeViewerSrc && (
          <ImageViewerDialog
            open={viewer}
            src={activeViewerSrc}
            alt={activeViewerItem?.body ?? body}
            loading={activeViewerLoading}
            canPrev={viewerNavigationEnabled && activeViewerIndex > 0}
            canNext={viewerNavigationEnabled && activeViewerIndex < viewerItemsCount - 1}
            onPrev={viewerNavigationEnabled ? handlePrevViewerItem : undefined}
            onNext={viewerNavigationEnabled ? handleNextViewerItem : undefined}
            requestClose={handleCloseViewer}
            renderViewer={renderViewer}
          />
        )}
        {typeof blurHash === 'string' && !load && (
          <BlurhashCanvas
            style={{ width: '100%', height: '100%' }}
            width={32}
            height={32}
            hash={blurHash}
            punch={1}
          />
        )}
        {!autoPlay && !markedAsSpoiler && srcState.status === AsyncStatus.Idle && (
          <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
            <Button
              variant="Secondary"
              fill="Solid"
              radii="300"
              size="300"
              onClick={() => {
                loadSrc().catch(() => undefined);
              }}
              before={<Icon size="Inherit" src={Icons.Photo} filled />}
            >
              <Text size="B300">View</Text>
            </Button>
          </Box>
        )}
        {previewSrc && (
          <Box className={classNames(css.AbsoluteContainer, blurred && css.Blur)}>
            <React.Fragment key={previewRenderKey}>
              {renderImage({
                alt: body,
                title: body,
                src: previewSrc,
                onLoad: handleLoad,
                onError: handleError,
                onClick: handleOpenViewer,
                tabIndex: 0,
              })}
            </React.Fragment>
          </Box>
        )}
        {blurred && !previewError && srcState.status !== AsyncStatus.Error && (
          <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
            <TooltipProvider
              tooltip={
                typeof spoilerReason === 'string' && (
                  <Tooltip variant="Secondary">
                    <Text>{spoilerReason}</Text>
                  </Tooltip>
                )
              }
              position="Top"
              align="Center"
            >
              {(triggerRef) => (
                <Chip
                  ref={triggerRef}
                  variant="Secondary"
                  radii="Pill"
                  size="500"
                  outlined
                  onClick={() => {
                    setBlurred(false);
                    if (srcState.status === AsyncStatus.Idle) {
                      loadSrc().catch(() => undefined);
                    }
                  }}
                >
                  <Text size="B300">Spoiler</Text>
                </Chip>
              )}
            </TooltipProvider>
          </Box>
        )}
        {previewLoading && !blurred && (
          <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
            <Spinner variant="Secondary" />
          </Box>
        )}
        {previewError && (
          <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
            <TooltipProvider
              tooltip={
                <Tooltip variant="Critical">
                  <Text>Failed to load image!</Text>
                </Tooltip>
              }
              position="Top"
              align="Center"
            >
              {(triggerRef) => (
                <Button
                  ref={triggerRef}
                  size="300"
                  variant="Critical"
                  fill="Soft"
                  outlined
                  radii="300"
                  onClick={handleRetry}
                  before={<Icon size="Inherit" src={Icons.Warning} filled />}
                >
                  <Text size="B300">Retry</Text>
                </Button>
              )}
            </TooltipProvider>
          </Box>
        )}
        {!load && typeof info?.size === 'number' && (
          <Box className={css.AbsoluteFooter} justifyContent="End" alignContent="Center" gap="200">
            <Badge variant="Secondary" fill="Soft">
              <Text size="L400">{bytesToSize(info.size)}</Text>
            </Badge>
          </Box>
        )}
      </Box>
    );
  }
);
