import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
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
import { IImageInfo, MATRIX_BLUR_HASH_PROPERTY_NAME } from '../../../../types/matrix/common';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import * as css from './style.css';
import { bytesToSize } from '../../../utils/common';
import { FALLBACK_MIMETYPE } from '../../../utils/mimeTypes';
import { stopPropagation } from '../../../utils/keyboard';
import { decryptFile, downloadEncryptedMedia, mxcUrlToHttp } from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { ModalWide } from '../../../styles/Modal.css';
import { validBlurHash } from '../../../utils/blurHash';

type RenderViewerProps = {
  src: string;
  alt: string;
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
export type ImageContentProps = {
  body: string;
  mimeType?: string;
  url: string;
  info?: IImageInfo;
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
    const viewerTrapRef = useRef<HTMLDivElement>(null);
    const baseViewerItem = {
      id: viewerItemId ?? url,
      body,
      mimeType,
      url,
      encInfo,
    };
    const galleryItems =
      viewerItems && viewerItems.length > 0
        ? viewerItems
        : [baseViewerItem];
    const initialViewerIndex = Math.max(
      galleryItems.findIndex((item) => item.id === baseViewerItem.id),
      0
    );
    const [viewerIndex, setViewerIndex] = useState(initialViewerIndex);

    const loadMediaSrc = useCallback(
      async (targetUrl: string, targetMimeType?: string, targetEncInfo?: EncryptedAttachmentInfo) => {
        const mediaUrl = mxcUrlToHttp(mx, targetUrl, useAuthentication);
        if (!mediaUrl) throw new Error('Invalid media URL');
        if (targetEncInfo) {
          const fileContent = await downloadEncryptedMedia(mediaUrl, (encBuf) =>
            decryptFile(encBuf, targetMimeType ?? FALLBACK_MIMETYPE, targetEncInfo)
          );
          return URL.createObjectURL(fileContent);
        }
        return mediaUrl;
      },
      [mx, useAuthentication]
    );

    const [srcState, loadSrc] = useAsyncCallback(
      useCallback(async () => {
        return loadMediaSrc(url, mimeType, encInfo);
      }, [encInfo, loadMediaSrc, mimeType, url])
    );

    const currentViewerItem = galleryItems[viewerIndex] ?? baseViewerItem;
    const [viewerSrcState, loadViewerSrc] = useAsyncCallback(
      useCallback(
        async () =>
          loadMediaSrc(
            currentViewerItem.url,
            currentViewerItem.mimeType,
            currentViewerItem.encInfo
          ),
        [currentViewerItem.encInfo, currentViewerItem.mimeType, currentViewerItem.url, loadMediaSrc]
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
      loadSrc();
    };

    useEffect(() => {
      if (autoPlay) loadSrc();
    }, [autoPlay, loadSrc]);

    useEffect(() => {
      setViewerIndex(initialViewerIndex);
    }, [initialViewerIndex]);

    useEffect(() => {
      if (!viewer) return;
      if (currentViewerItem.id === baseViewerItem.id && srcState.status === AsyncStatus.Success) {
        return;
      }
      loadViewerSrc();
    }, [
      baseViewerItem.id,
      currentViewerItem.id,
      loadViewerSrc,
      srcState.status,
      viewer,
    ]);

    const activeViewerSrc =
      currentViewerItem.id === baseViewerItem.id && srcState.status === AsyncStatus.Success
        ? srcState.data
        : viewerSrcState.status === AsyncStatus.Success
          ? viewerSrcState.data
          : undefined;

    const openViewer = () => {
      setViewerIndex(initialViewerIndex);
      setViewer(true);
    };

    const closeViewer = () => {
      setViewer(false);
      setViewerIndex(initialViewerIndex);
    };

    const canPrev = viewerIndex > 0;
    const canNext = viewerIndex < galleryItems.length - 1;

    return (
      <Box className={classNames(css.RelativeBase, className)} {...props} ref={ref}>
        {srcState.status === AsyncStatus.Success && (
          <Overlay open={viewer} backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  fallbackFocus: () => viewerTrapRef.current as HTMLDivElement,
                  onDeactivate: closeViewer,
                  clickOutsideDeactivates: true,
                  escapeDeactivates: stopPropagation,
                }}
              >
                <div ref={viewerTrapRef} tabIndex={-1} style={{ outline: 'none' }}>
                  <Modal
                    className={ModalWide}
                    size="500"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: '92vh',
                      maxHeight: '92vh',
                    }}
                    onContextMenu={(evt: any) => evt.stopPropagation()}
                  >
                    {activeViewerSrc ? (
                      renderViewer({
                        src: activeViewerSrc,
                        alt: currentViewerItem.body,
                        requestClose: closeViewer,
                        canPrev,
                        canNext,
                        onPrev: canPrev ? () => setViewerIndex((index) => index - 1) : undefined,
                        onNext: canNext ? () => setViewerIndex((index) => index + 1) : undefined,
                      })
                    ) : (
                      <Box
                        alignItems="Center"
                        justifyContent="Center"
                        style={{ minHeight: '70vh' }}
                      >
                        <Spinner variant="Secondary" />
                      </Box>
                    )}
                  </Modal>
                </div>
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
              onClick={loadSrc}
              before={<Icon size="Inherit" src={Icons.Photo} filled />}
            >
              <Text size="B300">查看</Text>
            </Button>
          </Box>
        )}
        {srcState.status === AsyncStatus.Success && (
          <Box className={classNames(css.AbsoluteContainer, blurred && css.Blur)}>
            {renderImage({
              alt: body,
              title: body,
              src: srcState.data,
              onLoad: handleLoad,
              onError: handleError,
              onClick: openViewer,
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
                      loadSrc();
                    }
                  }}
                >
                  <Text size="B300">剧透</Text>
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
                  <Text>图片加载失败</Text>
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
                  <Text size="B300">重试</Text>
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
