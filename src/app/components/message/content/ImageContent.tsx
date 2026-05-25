import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  Icon,
  Icons,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  Tooltip,
  TooltipProvider,
  as,
} from 'folds';
import classNames from 'classnames';
import { BlurhashCanvas } from 'react-blurhash';
import FocusTrap from 'focus-trap-react';
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
import { stopPropagation } from '../../../utils/keyboard';
import {
  decryptFile,
  downloadEncryptedMedia,
  mxcUrlToHttp,
  shouldUseObjectUrlForMediaDisplay,
} from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { ImageViewerModal } from '../../../styles/Modal.css';
import { validBlurHash } from '../../../utils/blurHash';
import { primeCachedMediaObjectUrl } from '../../../utils/mediaUrlCache';

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
  items?: Array<{
    id: string;
    alt: string;
    previewSrc?: string;
  }>;
  activeItemId?: string;
  onSelectItem?: (itemId: string) => void;
};
export type ViewerImageItem = {
  id: string;
  body: string;
  mimeType?: string;
  url: string;
  info?: IImageInfo;
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
    const [blurred, setBlurred] = useState(markedAsSpoiler ?? false);

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
          const fileContent = await downloadEncryptedMedia(mediaUrl, (encBuf) =>
            decryptFile(encBuf, mediaMimeType, mediaEncInfo)
          );
          return URL.createObjectURL(fileContent);
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

    const handleLoad = () => {
      setLoad(true);
    };
    const handleError = () => {
      setLoad(false);
      setError(true);
    };

    const handleRetry = () => {
      setError(false);
      loadSrc().catch(() => undefined);
    };

    const handleOpenViewer = () => {
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

    useEffect(() => {
      if (autoPlay) {
        loadSrc().catch(() => undefined);
      }
    }, [autoPlay, loadSrc]);

    const viewerAlt = viewerItems?.find((item) => item.id === viewerItemId)?.body ?? body;
    const previewSrc = srcState.status === AsyncStatus.Success ? srcState.data.src : undefined;
    const viewerSrc =
      viewerSrcState.status === AsyncStatus.Success ? viewerSrcState.data : previewSrc;
    const viewerLoading =
      viewer &&
      srcState.status === AsyncStatus.Success &&
      srcState.data.kind === 'thumbnail' &&
      viewerSrcState.status !== AsyncStatus.Success;

    return (
      <Box className={classNames(css.RelativeBase, className)} {...props} ref={ref}>
        {viewer && viewerSrc && (
          <Overlay open={viewer} backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  onDeactivate: () => setViewer(false),
                  clickOutsideDeactivates: true,
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Modal
                  className={ImageViewerModal}
                  size="500"
                  onContextMenu={(evt: any) => evt.stopPropagation()}
                >
                  {renderViewer({
                    src: viewerSrc,
                    alt: viewerAlt,
                    loading: viewerLoading,
                    requestClose: () => setViewer(false),
                  })}
                </Modal>
              </FocusTrap>
            </OverlayCenter>
          </Overlay>
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
        {srcState.status === AsyncStatus.Success && (
          <Box className={classNames(css.AbsoluteContainer, blurred && css.Blur)}>
            {renderImage({
              alt: body,
              title: body,
              src: srcState.data.src,
              onLoad: handleLoad,
              onError: handleError,
              onClick: handleOpenViewer,
              tabIndex: 0,
            })}
          </Box>
        )}
        {blurred && !error && srcState.status !== AsyncStatus.Error && (
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
        {(srcState.status === AsyncStatus.Loading || srcState.status === AsyncStatus.Success) &&
          !load &&
          !blurred && (
            <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
              <Spinner variant="Secondary" />
            </Box>
          )}
        {(error || srcState.status === AsyncStatus.Error) && (
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
