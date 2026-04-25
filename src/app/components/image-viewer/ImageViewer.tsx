/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import FileSaver from 'file-saver';
import classNames from 'classnames';
import { Box, Chip, Header, Icon, IconButton, Icons, Text, as } from 'folds';
import * as css from './ImageViewer.css';
import { usePan } from '../../hooks/usePan';
import { useZoom } from '../../hooks/useZoom';

export type ImageViewerItem = {
  id: string;
  alt: string;
  previewSrc?: string;
};

export type ImageViewerProps = {
  alt: string;
  src: string;
  loading?: boolean;
  requestClose: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  items?: ImageViewerItem[];
  activeItemId?: string;
  onSelectItem?: (itemId: string) => void;
};

type ViewMode = 'fit' | 'actual';

const ZOOM_STEP = 0.2;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

export const ImageViewer = as<'div', ImageViewerProps>(
  (
    {
      className,
      alt,
      src,
      loading,
      requestClose,
      canPrev,
      canNext,
      onPrev,
      onNext,
      items,
      activeItemId,
      onSelectItem,
      ...props
    },
    ref
  ) => {
    const [rotation, setRotation] = useState(0);
    const [viewMode, setViewMode] = useState<ViewMode>('fit');
    const { zoom, zoomIn, zoomOut, setZoom } = useZoom(ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);
    const rotated = Math.abs(rotation % 180) === 90;
    const panEnabled = viewMode === 'actual' || zoom !== 1 || rotated;
    const { pan, cursor, onMouseDown } = usePan(panEnabled, `${src}-${rotation}-${viewMode}`);
    const [swiping, setSwiping] = useState(false);
    const [swipeOffsetX, setSwipeOffsetX] = useState(0);
    const displayRotation = ((rotation % 360) + 360) % 360;
    const resolvedActiveItemId = activeItemId ?? src;
    const thumbnailRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const swipeDeltaRef = useRef({ x: 0, y: 0 });
    const swipeCleanupRef = useRef<(() => void) | null>(null);
    const transitionTimerRef = useRef<number | null>(null);
    const hasThumbnailRail = !!items && items.length > 1;
    const swipeEnabled = !panEnabled && Boolean(onPrev || onNext);
    const [displaySrc, setDisplaySrc] = useState(src);
    const [transitionSrc, setTransitionSrc] = useState<string>();
    const [transitionVisible, setTransitionVisible] = useState(false);

    const handleDownload = async () => {
      const response = await fetch(src);
      const fileContent = await response.blob();
      FileSaver.saveAs(fileContent, alt);
    };

    const rotateLeft = () => setRotation((angle) => angle - 90);
    const rotateRight = () => setRotation((angle) => angle + 90);

    const toggleViewMode = () => {
      setViewMode((currentMode) => (currentMode === 'fit' ? 'actual' : 'fit'));
      setZoom(1);
    };

    const handleWheel: React.WheelEventHandler<HTMLDivElement> = (evt) => {
      evt.preventDefault();
      const direction = evt.deltaY < 0 ? 1 : -1;
      setZoom((currentZoom) => {
        const nextZoom = Number((currentZoom + direction * ZOOM_STEP).toFixed(2));
        if (nextZoom < MIN_ZOOM) return MIN_ZOOM;
        if (nextZoom > MAX_ZOOM) return MAX_ZOOM;
        return nextZoom;
      });
    };

    const clearSwipeListeners = useCallback(() => {
      swipeCleanupRef.current?.();
      swipeCleanupRef.current = null;
    }, []);

    const finishSwipe = useCallback(() => {
      clearSwipeListeners();

      const { x, y } = swipeDeltaRef.current;
      setSwiping(false);
      setSwipeOffsetX(0);
      swipeDeltaRef.current = { x: 0, y: 0 };

      if (Math.abs(x) < 120 || Math.abs(x) <= Math.abs(y) * 1.15) {
        return;
      }

      if (x > 0 && canPrev && onPrev) {
        onPrev();
      } else if (x < 0 && canNext && onNext) {
        onNext();
      }
    }, [canNext, canPrev, clearSwipeListeners, onNext, onPrev]);

    const handleSwipeMouseDown = useCallback<React.MouseEventHandler<HTMLImageElement>>(
      (evt) => {
        if (!swipeEnabled) return;

        evt.preventDefault();
        const startX = evt.clientX;
        const startY = evt.clientY;

        swipeDeltaRef.current = { x: 0, y: 0 };
        setSwiping(true);
        setSwipeOffsetX(0);

        const handleMouseMove = (moveEvt: MouseEvent) => {
          const deltaX = moveEvt.clientX - startX;
          const deltaY = moveEvt.clientY - startY;

          swipeDeltaRef.current = { x: deltaX, y: deltaY };
          setSwipeOffsetX(deltaX);
        };

        const handleMouseUp = () => {
          finishSwipe();
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp, { once: true });
        swipeCleanupRef.current = () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };
      },
      [finishSwipe, swipeEnabled]
    );

    useEffect(() => {
      const handleKeyDown = (evt: KeyboardEvent) => {
        if (evt.key === 'ArrowLeft' && canPrev && onPrev) {
          evt.preventDefault();
          onPrev();
        }

        if (evt.key === 'ArrowRight' && canNext && onNext) {
          evt.preventDefault();
          onNext();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [canNext, canPrev, onNext, onPrev]);

    useEffect(() => {
      if (!hasThumbnailRail || !resolvedActiveItemId) return;
      thumbnailRefs.current[resolvedActiveItemId]?.scrollIntoView({
        block: 'nearest',
        inline: 'center',
      });
    }, [hasThumbnailRail, resolvedActiveItemId]);

    useEffect(
      () => () => {
        clearSwipeListeners();
        if (transitionTimerRef.current) {
          window.clearTimeout(transitionTimerRef.current);
        }
      },
      [clearSwipeListeners]
    );

    useEffect(() => {
      if (src === displaySrc) return;

      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }

      setTransitionSrc(src);
      setTransitionVisible(false);
    }, [displaySrc, src]);

    useLayoutEffect(() => {
      clearSwipeListeners();
      setSwiping(false);
      setSwipeOffsetX(0);
      swipeDeltaRef.current = { x: 0, y: 0 };
      setZoom(1);
      setRotation(0);
      setViewMode('fit');
    }, [clearSwipeListeners, setZoom, src]);

    const handleTransitionImageLoad = () => {
      if (!transitionSrc) return;

      setTransitionVisible(true);
      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current);
      }
      transitionTimerRef.current = window.setTimeout(() => {
        setDisplaySrc(transitionSrc);
        setTransitionSrc(undefined);
        setTransitionVisible(false);
        transitionTimerRef.current = null;
      }, 180);
    };

    const imageCursor = panEnabled ? cursor : swipeEnabled ? (swiping ? 'grabbing' : 'grab') : 'default';
    const handleImageMouseDown = (
      panEnabled ? onMouseDown : swipeEnabled ? handleSwipeMouseDown : undefined
    ) as React.MouseEventHandler<HTMLImageElement> | undefined;

    return (
      <Box
        className={classNames(css.ImageViewer, className)}
        direction="Column"
        {...props}
        ref={ref}
      >
        <Header className={css.ImageViewerHeader} size="400">
          <Box grow="Yes" alignItems="Center" gap="200">
            <IconButton
              size="300"
              radii="300"
              onClick={requestClose}
              aria-label={'\u5173\u95ed\u9884\u89c8'}
            >
              <Icon size="50" src={Icons.ArrowLeft} />
            </IconButton>
            <Text size="T300" truncate title={alt}>
              {alt}
            </Text>
          </Box>

          <Box shrink="No" alignItems="Center" gap="200" style={{ flexWrap: 'wrap' }}>
            <IconButton
              variant={zoom < 1 ? 'Success' : 'SurfaceVariant'}
              outlined={zoom < 1}
              size="300"
              radii="Pill"
              onClick={zoomOut}
              aria-label={'\u7f29\u5c0f'}
            >
              <Icon size="50" src={Icons.Minus} />
            </IconButton>

            <Chip variant="SurfaceVariant" radii="Pill" onClick={() => setZoom(1)}>
              <Text size="B300">{Math.round(zoom * 100)}%</Text>
            </Chip>

            <IconButton
              variant={zoom > 1 ? 'Success' : 'SurfaceVariant'}
              outlined={zoom > 1}
              size="300"
              radii="Pill"
              onClick={zoomIn}
              aria-label={'\u653e\u5927'}
            >
              <Icon size="50" src={Icons.Plus} />
            </IconButton>

            <Chip
              variant={viewMode === 'actual' ? 'Success' : 'SurfaceVariant'}
              radii="Pill"
              onClick={toggleViewMode}
            >
              <Text size="B300">
                {viewMode === 'fit' ? '\u9002\u5e94\u7a97\u53e3' : '\u539f\u59cb\u5927\u5c0f'}
              </Text>
            </Chip>

            <Chip variant="SurfaceVariant" radii="Pill" onClick={rotateLeft}>
              <Text size="B300">{'\u5de6\u8f6c'}</Text>
            </Chip>

            <Chip
              variant={displayRotation !== 0 ? 'Success' : 'SurfaceVariant'}
              radii="Pill"
              onClick={() => setRotation(0)}
            >
              <Text size="B300">{`${displayRotation}\u00b0`}</Text>
            </Chip>

            <Chip variant="SurfaceVariant" radii="Pill" onClick={rotateRight}>
              <Text size="B300">{'\u53f3\u8f6c'}</Text>
            </Chip>

            <Chip
              variant="Primary"
              onClick={handleDownload}
              radii="300"
              before={<Icon size="50" src={Icons.Download} />}
            >
              <Text size="B300">{'\u4e0b\u8f7d'}</Text>
            </Chip>
          </Box>
        </Header>

        <Box grow="Yes" className={css.ImageViewerContent} direction="Column" gap="200">
          <Box
            grow="Yes"
            className={css.ImageViewerStage}
            justifyContent="Center"
            alignItems="Center"
          >
            {onPrev && (
              <IconButton
                className={classNames(css.NavButton, css.NavButtonLeft)}
                variant="SurfaceVariant"
                size="400"
                radii="Pill"
                onClick={onPrev}
                disabled={!canPrev}
                aria-label={'\u4e0a\u4e00\u5f20'}
              >
                <Icon size="100" src={Icons.ArrowLeft} />
              </IconButton>
            )}

            <Box
              className={css.ImageViewerViewport}
              alignItems="Center"
              justifyContent="Center"
              onWheel={handleWheel}
            >
              <img
                className={classNames(
                  css.ImageViewerImg,
                  transitionSrc && transitionVisible && css.ImageViewerImgFading
                )}
                style={{
                  cursor: imageCursor,
                  width: viewMode === 'fit' ? '100%' : 'auto',
                  height: viewMode === 'fit' ? '100%' : 'auto',
                  maxWidth: viewMode === 'fit' ? '100%' : 'none',
                  maxHeight: viewMode === 'fit' ? '100%' : 'none',
                  transform: `translate(${pan.translateX + swipeOffsetX}px, ${pan.translateY}px) rotate(${rotation}deg) scale(${zoom})`,
                  transition: swiping || cursor === 'grabbing' ? 'none' : undefined,
                }}
                src={displaySrc}
                alt={alt}
                onMouseDown={handleImageMouseDown}
                onDoubleClick={toggleViewMode}
                draggable={false}
              />

              {transitionSrc && (
                <img
                  className={classNames(
                    css.ImageViewerImg,
                    css.ImageViewerImgOverlay,
                    transitionVisible && css.ImageViewerImgOverlayVisible
                  )}
                  style={{
                    cursor: imageCursor,
                    width: viewMode === 'fit' ? '100%' : 'auto',
                    height: viewMode === 'fit' ? '100%' : 'auto',
                    maxWidth: viewMode === 'fit' ? '100%' : 'none',
                    maxHeight: viewMode === 'fit' ? '100%' : 'none',
                    transform: `translate(${pan.translateX + swipeOffsetX}px, ${pan.translateY}px) rotate(${rotation}deg) scale(${zoom})`,
                    transition: swiping || cursor === 'grabbing' ? 'none' : undefined,
                  }}
                  src={transitionSrc}
                  alt={alt}
                  onLoad={handleTransitionImageLoad}
                  onMouseDown={handleImageMouseDown}
                  onDoubleClick={toggleViewMode}
                  draggable={false}
                />
              )}

              {loading && (
                <Box
                  className={css.ImageViewerLoading}
                  alignItems="Center"
                  justifyContent="Center"
                  direction="Column"
                  gap="200"
                >
                  <Text size="T200" priority="300">
                    {'正在切换图片...'}
                  </Text>
                </Box>
              )}
            </Box>

            {onNext && (
              <IconButton
                className={classNames(css.NavButton, css.NavButtonRight)}
                variant="SurfaceVariant"
                size="400"
                radii="Pill"
                onClick={onNext}
                disabled={!canNext}
                aria-label={'\u4e0b\u4e00\u5f20'}
              >
                <Icon size="100" src={Icons.ArrowRight} />
              </IconButton>
            )}
          </Box>

          {hasThumbnailRail && items && (
            <Box className={css.ThumbnailRail} direction="Column" gap="100">
              <Box className={css.ThumbnailHeader} alignItems="Center" justifyContent="SpaceBetween">
                <Text size="T200" priority="300">
                  {'\u53cc\u51fb\u56fe\u7247\u53ef\u5207\u6362\u9002\u5e94\u7a97\u53e3/\u539f\u59cb\u5927\u5c0f'}
                </Text>
                <Text size="T200" priority="300">
                  {`${items.findIndex((item) => item.id === resolvedActiveItemId) + 1} / ${items.length}`}
                </Text>
              </Box>

              <div className={css.ThumbnailList}>
                {items.map((item) => {
                  const active = item.id === resolvedActiveItemId;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      ref={(element) => {
                        thumbnailRefs.current[item.id] = element;
                      }}
                      className={classNames(
                        css.ThumbnailButton,
                        active && css.ThumbnailButtonActive
                      )}
                      onClick={() => onSelectItem?.(item.id)}
                      aria-pressed={active}
                      title={item.alt}
                    >
                      {item.previewSrc ? (
                        <img
                          className={css.ThumbnailImage}
                          src={item.previewSrc}
                          alt={item.alt}
                          loading="eager"
                          decoding="async"
                        />
                      ) : (
                        <Box
                          className={css.ThumbnailPlaceholder}
                          direction="Column"
                          gap="50"
                          alignItems="Center"
                          justifyContent="Center"
                        >
                          <Icon size="100" src={Icons.Photo} />
                          <Text size="T100" align="Center">
                            {'\u5f85\u8f7d\u5165'}
                          </Text>
                        </Box>
                      )}
                    </button>
                  );
                })}
              </div>
            </Box>
          )}
        </Box>
      </Box>
    );
  }
);
