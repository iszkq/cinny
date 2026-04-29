import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { ModalWide } from '../../../styles/Modal.css';
import { validBlurHash } from '../../../utils/blurHash';
import { bytesToSize } from '../../../utils/common';
import { stopPropagation } from '../../../utils/keyboard';
import * as mediaUrlCache from '../../../utils/mediaUrlCache';
import { FALLBACK_MIMETYPE } from '../../../utils/mimeTypes';
import { decryptFile, downloadEncryptedMedia, mxcUrlToHttp } from '../../../utils/matrix';
import {
  getSessionMediaCacheKey,
  isSessionMediaObjectUrl,
  loadSessionMediaUrl,
} from '../../../utils/sessionMediaCache';
import {
  releaseObjectUrl,
  retainObjectUrl,
  revokeObjectUrlWhenPossible,
} from '../../../utils/objectUrlRetainer';
import { ScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import * as css from './style.css';

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

type ViewerMediaState =
  | {
      status: AsyncStatus.Idle | AsyncStatus.Loading;
      itemId?: string;
    }
  | {
      status: AsyncStatus.Success;
      itemId: string;
      src: string;
    }
  | {
      status: AsyncStatus.Error;
      itemId: string;
      error: unknown;
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

const VIEWER_THUMBNAIL_PRELOAD_LIMIT = 18;
const VIEWER_THUMBNAIL_PRELOAD_DELAY_MS = 80;

const revokeBlobUrl = (src?: string) => {
  if (!src?.startsWith('blob:')) return;
  if (mediaUrlCache.isCachedMediaObjectUrl?.(src) || isSessionMediaObjectUrl(src)) return;
  revokeObjectUrlWhenPossible(src);
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
      viewerItemId: initialViewerItemKey,
      renderViewer,
      renderImage,
      ...props
    },
    ref
  ) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const screenSize = useScreenSizeContext();
    const mobile = screenSize === ScreenSize.Mobile;
    const blurHash = validBlurHash(info?.[MATRIX_BLUR_HASH_PROPERTY_NAME]);

    const [load, setLoad] = useState(false);
    const [error, setError] = useState(false);
    const [viewer, setViewer] = useState(false);
    const [blurred, setBlurred] = useState(markedAsSpoiler ?? false);
    const [viewerLoadNonce, setViewerLoadNonce] = useState(0);
    const [viewerPreviewVersion, setViewerPreviewVersion] = useState(0);
    const [viewerMediaState, setViewerMediaState] = useState<ViewerMediaState>({
      status: AsyncStatus.Idle,
    });
    const [viewerDisplayedState, setViewerDisplayedState] = useState<
      | {
          itemId: string;
          src: string;
        }
      | undefined
    >();

    const viewerTrapRef = useRef<HTMLDivElement>(null);
    const viewerCacheRef = useRef<Map<string, string>>(new Map());
    const viewerPreloadRef = useRef<Set<string>>(new Set());

    const setViewerCachedSrc = useCallback((itemId: string, nextSrc: string) => {
      const currentSrc = viewerCacheRef.current.get(itemId);
      if (currentSrc === nextSrc) {
        return;
      }

      if (currentSrc) {
        revokeBlobUrl(currentSrc);
        releaseObjectUrl(currentSrc);
      }

      viewerCacheRef.current.set(itemId, nextSrc);
      retainObjectUrl(nextSrc);
    }, []);

    const clearViewerCache = useCallback(() => {
      viewerCacheRef.current.forEach((cachedSrc) => {
        revokeBlobUrl(cachedSrc);
        releaseObjectUrl(cachedSrc);
      });
      viewerCacheRef.current.clear();
    }, []);

    const baseViewerItem = useMemo<ViewerImageItem>(
      () => ({
        id: initialViewerItemKey ?? url,
        body,
        mimeType,
        url,
        encInfo,
      }),
      [body, encInfo, initialViewerItemKey, mimeType, url]
    );

    const galleryItems = useMemo(() => {
      const itemMap = new Map<string, ViewerImageItem>();
      [...(viewerItems ?? []), baseViewerItem].forEach((item) => {
        if (!itemMap.has(item.id)) {
          itemMap.set(item.id, item);
        }
      });
      return Array.from(itemMap.values());
    }, [baseViewerItem, viewerItems]);

    const initialViewerItemId = baseViewerItem.id;
    const [viewerItemId, setViewerItemId] = useState(initialViewerItemId);

    const loadMediaSrc = useCallback(
      async (
        targetUrl: string,
        targetMimeType?: string,
        targetEncInfo?: EncryptedAttachmentInfo
      ) => {
        const mediaUrl = mxcUrlToHttp(mx, targetUrl, useAuthentication);
        if (!mediaUrl) throw new Error('Invalid media URL');

        if (targetEncInfo) {
          return loadSessionMediaUrl(
            getSessionMediaCacheKey('image', mediaUrl, targetMimeType ?? FALLBACK_MIMETYPE),
            async () =>
              downloadEncryptedMedia(mediaUrl, (encBuf) =>
                decryptFile(encBuf, targetMimeType ?? FALLBACK_MIMETYPE, targetEncInfo)
              )
          );
        }

        void mediaUrlCache.primePersistentMediaUrl(mediaUrl);
        return (await mediaUrlCache.getPreparedMediaUrl(mediaUrl, 'visible')) ?? mediaUrl;
      },
      [mx, useAuthentication]
    );

    const [srcState, loadSrc] = useAsyncCallback(
      useCallback(
        async () => loadMediaSrc(url, mimeType, encInfo),
        [encInfo, loadMediaSrc, mimeType, url]
      )
    );

    const viewerIndex = Math.max(
      galleryItems.findIndex((item) => item.id === viewerItemId),
      0
    );
    const currentViewerItem = galleryItems[viewerIndex] ?? baseViewerItem;

    const preloadViewerItem = useCallback(
      (item?: ViewerImageItem) => {
        if (!item || item.id === currentViewerItem.id) return;
        if (viewerCacheRef.current.has(item.id) || viewerPreloadRef.current.has(item.id)) return;

        viewerPreloadRef.current.add(item.id);
        loadMediaSrc(item.url, item.mimeType, item.encInfo)
          .then((loadedSrc) => {
            if (viewerCacheRef.current.has(item.id)) {
              revokeBlobUrl(loadedSrc);
              return;
            }

            setViewerCachedSrc(item.id, loadedSrc);
            setViewerPreviewVersion((value) => value + 1);
          })
          .catch(() => {})
          .finally(() => {
            viewerPreloadRef.current.delete(item.id);
          });
      },
      [currentViewerItem.id, loadMediaSrc, setViewerCachedSrc]
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
      void loadSrc().catch(() => undefined);
    };

    useEffect(() => {
      setBlurred(markedAsSpoiler ?? false);
    }, [markedAsSpoiler]);

    useEffect(() => {
      setLoad(false);
      setError(false);
    }, [url]);

    useEffect(() => {
      if (!autoPlay) return;
      void loadSrc().catch(() => undefined);
    }, [autoPlay, loadSrc]);

    useEffect(() => {
      setViewerItemId(initialViewerItemId);
    }, [initialViewerItemId]);

    useEffect(() => {
      if (galleryItems.some((item) => item.id === viewerItemId)) return;
      setViewerItemId(initialViewerItemId);
    }, [galleryItems, initialViewerItemId, viewerItemId]);

    useEffect(() => {
      if (!viewer) {
        setViewerMediaState({ status: AsyncStatus.Idle });
        return;
      }

      if (currentViewerItem.id === baseViewerItem.id && srcState.status === AsyncStatus.Success) {
        setViewerMediaState({
          status: AsyncStatus.Success,
          itemId: currentViewerItem.id,
          src: srcState.data,
        });
        return;
      }

      const cachedViewerSrc = viewerCacheRef.current.get(currentViewerItem.id);
      if (cachedViewerSrc) {
        setViewerMediaState({
          status: AsyncStatus.Success,
          itemId: currentViewerItem.id,
          src: cachedViewerSrc,
        });
        return;
      }

      let disposed = false;
      setViewerMediaState({
        status: AsyncStatus.Loading,
        itemId: currentViewerItem.id,
      });

      loadMediaSrc(currentViewerItem.url, currentViewerItem.mimeType, currentViewerItem.encInfo)
        .then((loadedSrc) => {
          if (disposed) {
            revokeBlobUrl(loadedSrc);
            return;
          }

          setViewerCachedSrc(currentViewerItem.id, loadedSrc);
          setViewerPreviewVersion((value) => value + 1);
          setViewerMediaState({
            status: AsyncStatus.Success,
            itemId: currentViewerItem.id,
            src: loadedSrc,
          });
        })
        .catch((viewerError) => {
          if (disposed) return;
          setViewerMediaState({
            status: AsyncStatus.Error,
            itemId: currentViewerItem.id,
            error: viewerError,
          });
        });

      return () => {
        disposed = true;
      };
    }, [
      baseViewerItem.id,
      currentViewerItem,
      loadMediaSrc,
      setViewerCachedSrc,
      srcState,
      viewer,
      viewerLoadNonce,
    ]);

    useEffect(() => {
      if (!viewer) return;

      preloadViewerItem(galleryItems[viewerIndex - 1]);
      preloadViewerItem(galleryItems[viewerIndex + 1]);
    }, [galleryItems, preloadViewerItem, viewer, viewerIndex]);

    useEffect(() => {
      if (!viewer) {
        return undefined;
      }

      const preloadCandidates = galleryItems
        .map((item, index) => ({ item, index }))
        .filter(
          ({ item }) =>
            item.id !== currentViewerItem.id &&
            !!item.encInfo &&
            !viewerCacheRef.current.has(item.id) &&
            !viewerPreloadRef.current.has(item.id)
        )
        .sort(
          (itemA, itemB) =>
            Math.abs(itemA.index - viewerIndex) - Math.abs(itemB.index - viewerIndex)
        )
        .slice(0, VIEWER_THUMBNAIL_PRELOAD_LIMIT);

      const preloadTimers = preloadCandidates.map(({ item }, index) =>
        window.setTimeout(() => {
          preloadViewerItem(item);
        }, index * VIEWER_THUMBNAIL_PRELOAD_DELAY_MS)
      );

      return () => {
        preloadTimers.forEach((timer) => window.clearTimeout(timer));
      };
    }, [currentViewerItem.id, galleryItems, preloadViewerItem, viewer, viewerIndex]);

    useEffect(
      () => () => {
        clearViewerCache();
      },
      [clearViewerCache]
    );

    useEffect(() => {
      const retainedSrc = srcState.status === AsyncStatus.Success ? srcState.data : undefined;
      retainObjectUrl(retainedSrc);

      return () => {
        revokeBlobUrl(retainedSrc);
        releaseObjectUrl(retainedSrc);
      };
    }, [srcState.status, srcState.status === AsyncStatus.Success ? srcState.data : undefined]);

    const activeViewerSrc =
      currentViewerItem.id === baseViewerItem.id && srcState.status === AsyncStatus.Success
        ? srcState.data
        : viewerMediaState.status === AsyncStatus.Success &&
            viewerMediaState.itemId === currentViewerItem.id
          ? viewerMediaState.src
          : undefined;

    useEffect(() => {
      if (!viewer) return;

      if (activeViewerSrc) {
        setViewerDisplayedState({
          itemId: currentViewerItem.id,
          src: activeViewerSrc,
        });
      }
    }, [activeViewerSrc, currentViewerItem.id, viewer]);

    const getViewerPreviewSrc = useCallback(
      (item: ViewerImageItem): string | undefined => {
        if (item.id === baseViewerItem.id && srcState.status === AsyncStatus.Success) {
          return srcState.data;
        }

        if (item.id === currentViewerItem.id && activeViewerSrc) {
          return activeViewerSrc;
        }

        const cachedViewerSrc = viewerCacheRef.current.get(item.id);
        if (cachedViewerSrc) {
          return cachedViewerSrc;
        }

        if (item.encInfo) {
          return undefined;
        }

        return mxcUrlToHttp(mx, item.url, useAuthentication, 160, 160, 'scale') ?? undefined;
      },
      [
        activeViewerSrc,
        baseViewerItem.id,
        currentViewerItem.id,
        mx,
        srcState,
        useAuthentication,
        viewerPreviewVersion,
      ]
    );

    const viewerPreviewItems = useMemo(
      () =>
        galleryItems.map((item) => ({
          id: item.id,
          alt: item.body,
          previewSrc: getViewerPreviewSrc(item),
        })),
      [galleryItems, getViewerPreviewSrc]
    );

    const openViewer = () => {
      setViewerItemId(initialViewerItemId);
      if (srcState.status === AsyncStatus.Success) {
        setViewerDisplayedState({
          itemId: baseViewerItem.id,
          src: srcState.data,
        });
      } else {
        setViewerDisplayedState(undefined);
      }
      setViewer(true);
    };

    const closeViewer = () => {
      setViewer(false);
      setViewerItemId(initialViewerItemId);
      setViewerMediaState({ status: AsyncStatus.Idle });
      setViewerDisplayedState(undefined);
    };

    const canPrev = viewerIndex > 0;
    const canNext = viewerIndex < galleryItems.length - 1;

    const renderedViewerSrc = activeViewerSrc ?? viewerDisplayedState?.src;
    const safeRenderedViewerSrc = renderedViewerSrc ?? '';
    const shouldRenderViewer =
      safeRenderedViewerSrc.length > 0 && viewerMediaState.status !== AsyncStatus.Error;
    const viewerLoading =
      viewer &&
      (!activeViewerSrc || viewerDisplayedState?.itemId !== currentViewerItem.id) &&
      viewerMediaState.status !== AsyncStatus.Error;

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
                      width: mobile ? '100vw' : 'min(96vw, 1320px)',
                      minWidth: mobile ? '100vw' : 'min(96vw, 1320px)',
                      maxWidth: mobile ? '100vw' : 'min(96vw, 1320px)',
                      height: mobile ? '100dvh' : 'min(92dvh, 920px)',
                      minHeight: mobile ? '100dvh' : 'min(92dvh, 920px)',
                      maxHeight: mobile ? '100dvh' : 'min(92dvh, 920px)',
                      padding: 0,
                      background: 'transparent',
                      boxShadow: 'none',
                      border: 'none',
                      borderRadius: mobile ? 0 : undefined,
                      overflow: 'hidden',
                    }}
                    onContextMenu={(evt: React.MouseEvent) => evt.stopPropagation()}
                  >
                    {shouldRenderViewer ? (
                      renderViewer({
                        src: safeRenderedViewerSrc,
                        alt: currentViewerItem.body,
                        loading: viewerLoading,
                        requestClose: closeViewer,
                        canPrev,
                        canNext,
                        onPrev: canPrev
                          ? () => setViewerItemId(galleryItems[viewerIndex - 1].id)
                          : undefined,
                        onNext: canNext
                          ? () => setViewerItemId(galleryItems[viewerIndex + 1].id)
                          : undefined,
                        items: viewerPreviewItems,
                        activeItemId: currentViewerItem.id,
                        onSelectItem: setViewerItemId,
                      })
                    ) : (
                      <Box
                        alignItems="Center"
                        justifyContent="Center"
                        direction="Column"
                        gap="300"
                        style={{ minHeight: '70vh' }}
                      >
                        <Spinner variant="Secondary" />
                        {viewerMediaState.status === AsyncStatus.Error && (
                          <Button
                            size="300"
                            variant="Secondary"
                            fill="Soft"
                            radii="300"
                            onClick={() => setViewerLoadNonce((value) => value + 1)}
                          >
                            <Text size="B300">{'\u91cd\u65b0\u52a0\u8f7d'}</Text>
                          </Button>
                        )}
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
              onClick={() => void loadSrc().catch(() => undefined)}
              before={<Icon size="Inherit" src={Icons.Photo} filled />}
            >
              <Text size="B300">{'\u67e5\u770b'}</Text>
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
                      void loadSrc().catch(() => undefined);
                    }
                  }}
                >
                  <Text size="B300">{'\u663e\u793a\u5267\u900f'}</Text>
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
                  <Text>{'\u56fe\u7247\u52a0\u8f7d\u5931\u8d25'}</Text>
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
                  <Text size="B300">{'\u91cd\u8bd5'}</Text>
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
