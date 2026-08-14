import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
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
import { useSetAtom } from 'jotai';
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
import { isHttpUrl, mxcUrlToHttp, shouldUseObjectUrlForMediaDisplay } from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { validBlurHash } from '../../../utils/blurHash';
import { primeCachedMediaObjectUrl } from '../../../utils/mediaUrlCache';
import { useStableMediaUrl } from '../../emoji-board/useStableMediaUrl';
import { prepareEncryptedMediaObjectUrl } from '../../../utils/encryptedMediaCache';
import { useClientConfig } from '../../../hooks/useClientConfig';
import type { AihubmixImageOcrConfig } from '../../../utils/ai';
import {
  imageViewerSessionAtom,
  type ImageViewerSourcePriority,
  type ViewerImageItem as GlobalViewerImageItem,
} from '../../../state/imageViewer';
import { primeDesktopMediaAssetUrl } from '../../../utils/desktopMediaAssetCache';
import { isAndroidApp } from '../../../utils/nativePlatform';
import { prepareAndroidMediaAssetUrl } from '../../../utils/androidMediaAssetCache';
import { isAnimatedEmojiBoardMedia } from '../../emoji-board/media';

const IMAGE_PREVIEW_WIDTH = 230;
const IMAGE_PREVIEW_HEIGHT = 460;

type RenderViewerProps = {
  src: string;
  alt: string;
  loading?: boolean;
  requestClose: () => void;
  imageOcrConfig?: AihubmixImageOcrConfig;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  originalLoadFailed?: boolean;
  onRetryOriginal?: () => void;
};
export type ViewerImageItem = GlobalViewerImageItem;
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
  preferOriginalPreview?: boolean;
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
      preferOriginalPreview = false,
      renderViewer,
      renderImage,
      ...props
    },
    ref
  ) => {
    const mx = useMatrixClient();
    const androidApp = isAndroidApp();
    const setImageViewerSession = useSetAtom(imageViewerSessionAtom);
    const clientConfig = useClientConfig();
    const imageOcr = clientConfig.imageOcr;
    const useAuthentication = useMediaAuthentication();
    const blurHash = validBlurHash(info?.[MATRIX_BLUR_HASH_PROPERTY_NAME]);
    const imageOcrConfig = useMemo<AihubmixImageOcrConfig | undefined>(() => {
      const config = imageOcr;
      if (!config) return undefined;

      return {
        apiKey: config.defaultAihubmixApiKey,
        baseUrl: config.baseUrl,
        model: config.model,
      };
    }, [imageOcr]);

    const [load, setLoad] = useState(false);
    const [error, setError] = useState(false);
    const [stableRetryNonce, setStableRetryNonce] = useState(0);
    const [blurred, setBlurred] = useState(markedAsSpoiler ?? false);
    const stablePreviewEnabled = autoPlay && previewMediaStrategy === 'stable' && !encInfo;
    const stableOriginalUrl =
      typeof url === 'string' && !url.startsWith('mxc://')
        ? url
        : mxcUrlToHttp(mx, url, useAuthentication) ?? undefined;
    // Android WebViews are much more reliable when the first paint uses a
    // bounded thumbnail.  Stickers used to opt out of thumbnails entirely
    // (`preferOriginalPreview`), which made every incoming sticker wait for a
    // potentially large animated original and commonly left the spinner up
    // indefinitely. Keep the original as the fallback so animation/full
    // resolution is still available once it is ready.
    const stableThumbnailUrl =
      (androidApp || !preferOriginalPreview) && typeof info?.thumbnail_url === 'string'
        ? mxcUrlToHttp(mx, info.thumbnail_url, useAuthentication) ?? undefined
        : !encInfo && (androidApp || !preferOriginalPreview)
        ? mxcUrlToHttp(
            mx,
            url,
            useAuthentication,
            IMAGE_PREVIEW_WIDTH,
            IMAGE_PREVIEW_HEIGHT,
            'scale'
          ) ?? undefined
        : undefined;
    const preferAndroidThumbnail = androidApp && !preferOriginalPreview;
    const preferAndroidStickerThumbnail = androidApp && preferOriginalPreview;
    const useAndroidThumbnailFirst =
      preferAndroidStickerThumbnail || (preferAndroidThumbnail && !isAnimatedEmojiBoardMedia(info));
    const stablePrimaryUrl = useAndroidThumbnailFirst
      ? stableThumbnailUrl ?? stableOriginalUrl
      : stableOriginalUrl;
    const stableFallbackUrl =
      stablePrimaryUrl === stableThumbnailUrl ? stableOriginalUrl : stableThumbnailUrl;
    const {
      displayUrl: stablePreviewUrl,
      hasFailed: stablePreviewFailed,
      requestKey: stablePreviewRequestKey,
      handleLoad: handleStablePreviewLoad,
      handleError: handleStablePreviewError,
      retry: retryStablePreview,
    } = useStableMediaUrl(
      stablePreviewEnabled ? stablePrimaryUrl : undefined,
      stablePreviewEnabled ? stableFallbackUrl : undefined,
      {
        autoRetry: androidApp,
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
        resizeMethod?: string,
        retryFailed = false,
        priority: ImageViewerSourcePriority = 'visible'
      ) => {
        const mediaUrl = isHttpUrl(mediaMxcUrl)
          ? mediaMxcUrl
          : mxcUrlToHttp(mx, mediaMxcUrl, useAuthentication, width, height, resizeMethod);
        if (!mediaUrl) throw new Error('Invalid media URL');

        if (mediaEncInfo) {
          return prepareEncryptedMediaObjectUrl(mediaUrl, mediaMimeType, mediaEncInfo);
        }

        if (isHttpUrl(mediaMxcUrl) && !shouldUseObjectUrlForMediaDisplay(mediaUrl)) {
          return mediaUrl;
        }

        if (androidApp) {
          const nativeAssetUrl = await prepareAndroidMediaAssetUrl(
            mediaUrl,
            mediaMimeType,
            retryFailed
          );
          if (nativeAssetUrl) return nativeAssetUrl;
          throw new Error('Failed to prepare Android image media');
        }

        const desktopAssetUrl = await primeDesktopMediaAssetUrl(mediaUrl, priority, mediaMimeType);
        if (desktopAssetUrl) {
          return desktopAssetUrl;
        }

        const preparedMediaUrl = await primeCachedMediaObjectUrl(mediaUrl, priority, retryFailed);
        if (preparedMediaUrl) {
          return preparedMediaUrl;
        }

        if (shouldUseObjectUrlForMediaDisplay(mediaUrl)) {
          throw new Error('Failed to prepare image media');
        }

        return mediaUrl;
      },
      [androidApp, mx, useAuthentication]
    );

    const [srcState, loadSrc] = useAsyncCallback<
      TimelineImageSource,
      unknown,
      [retryFailed?: boolean]
    >(
      useCallback(
        async (retryFailed = false): Promise<TimelineImageSource> => {
          const thumbMxcUrl = info?.thumbnail_file?.url ?? info?.thumbnail_url;
          const thumbMimeType = info?.thumbnail_info?.mimetype ?? mimeType ?? FALLBACK_MIMETYPE;
          const thumbEncInfo = info?.thumbnail_file;
          // A sticker's original may be an animated WebP/GIF and can require a
          // relatively expensive encrypted-media/decode path. On Android show the
          // homeserver thumbnail first so the message is visible immediately.
          const allowAndroidStickerThumbnail = androidApp && preferOriginalPreview;

          if (
            (!preferOriginalPreview || allowAndroidStickerThumbnail) &&
            typeof thumbMxcUrl === 'string'
          ) {
            try {
              const thumbSrc = await prepareMediaSrc(
                thumbMxcUrl,
                thumbMimeType,
                thumbEncInfo,
                undefined,
                undefined,
                undefined,
                retryFailed
              );
              return {
                src: thumbSrc,
                kind: 'thumbnail',
              };
            } catch {
              // Fall back to the original image to preserve current behavior.
            }
          }

          if ((!preferOriginalPreview || allowAndroidStickerThumbnail) && !encInfo) {
            try {
              const thumbnailSrc = await prepareMediaSrc(
                url,
                mimeType ?? FALLBACK_MIMETYPE,
                undefined,
                IMAGE_PREVIEW_WIDTH,
                IMAGE_PREVIEW_HEIGHT,
                'scale',
                retryFailed
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
            encInfo,
            undefined,
            undefined,
            undefined,
            retryFailed
          );
          return {
            src: originalSrc,
            kind: 'original',
          };
        },
        [androidApp, encInfo, info, mimeType, preferOriginalPreview, prepareMediaSrc, url]
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
        retryStablePreview();
        setStableRetryNonce((current) => current + 1);
        return;
      }
      loadSrc(true).catch(() => undefined);
    };

    useEffect(() => {
      if (autoPlay && !stablePreviewEnabled) {
        loadSrc(false).catch(() => undefined);
      }
    }, [autoPlay, loadSrc, stablePreviewEnabled]);

    const previewSrc = stablePreviewEnabled
      ? stablePreviewUrl
      : srcState.status === AsyncStatus.Success
      ? srcState.data.src
      : undefined;
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

    const handleOpenViewer = useCallback(() => {
      const activeItemId = viewerItemId ?? url;
      const activeItem: ViewerImageItem = {
        id: activeItemId,
        body,
        mimeType,
        url,
        info,
        encInfo,
      };
      const items = viewerItems?.some((item) => item.id === activeItemId)
        ? viewerItems
        : [activeItem];

      setImageViewerSession({
        activeItemId,
        items,
        initialSrc: previewSrc,
        resolveSource: (item, priority = 'visible') =>
          prepareMediaSrc(
            item.url,
            item.mimeType ?? FALLBACK_MIMETYPE,
            item.encInfo,
            undefined,
            undefined,
            undefined,
            true,
            priority
          ),
        imageOcrConfig,
        renderViewer,
      });
    }, [
      body,
      encInfo,
      imageOcrConfig,
      info,
      mimeType,
      prepareMediaSrc,
      previewSrc,
      renderViewer,
      setImageViewerSession,
      url,
      viewerItemId,
      viewerItems,
    ]);

    return (
      <Box className={classNames(css.RelativeBase, className)} {...props} ref={ref}>
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
