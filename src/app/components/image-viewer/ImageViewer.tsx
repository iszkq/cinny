/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { Box, Chip, Header, Icon, IconButton, Icons, Text, as } from 'folds';
import * as css from './ImageViewer.css';
import { usePan } from '../../hooks/usePan';
import { useZoom } from '../../hooks/useZoom';
import { fetchMediaWithAuth } from '../../utils/matrix';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { saveDownloadedFile } from '../../utils/saveDownloadedFile';

export type ImageViewerProps = {
  alt: string;
  src: string;
  loading?: boolean;
  requestClose: () => void;
  onMinimize?: () => void;
  maximized?: boolean;
  onToggleMaximized?: () => void;
  onWindowDragStart?: React.PointerEventHandler<HTMLElement>;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
};

type ViewMode = 'fit' | 'actual';
type ImageOrientation = 'landscape' | 'portrait' | 'square';
type TouchPoint = {
  x: number;
  y: number;
};
type TouchGesture =
  | {
      mode: 'pan';
      startPoint: TouchPoint;
      basePan: {
        translateX: number;
        translateY: number;
      };
    }
  | {
      mode: 'pinch';
      startDistance: number;
      baseZoom: number;
    }
  | {
      mode: 'swipe';
      startPoint: TouchPoint;
    };

const ZOOM_STEP = 0.2;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const SWIPE_TRIGGER_PX = 120;
const DOUBLE_TAP_INTERVAL_MS = 280;
const MAX_TAP_MOVEMENT_PX = 24;
const INITIAL_TOUCH_PAN = {
  translateX: 0,
  translateY: 0,
};

const getImageOrientation = (img: HTMLImageElement): ImageOrientation => {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) return 'landscape';

  const aspectRatio = width / height;
  if (aspectRatio > 1.15) return 'landscape';
  if (aspectRatio < 0.85) return 'portrait';
  return 'square';
};

const getDisplayOrientation = (
  orientation: ImageOrientation,
  rotated: boolean
): ImageOrientation => {
  if (!rotated) return orientation;
  if (orientation === 'landscape') return 'portrait';
  if (orientation === 'portrait') return 'landscape';
  return orientation;
};

const clampZoom = (value: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));

const getTouchPoint = (touch: Touch): TouchPoint => ({
  x: touch.clientX,
  y: touch.clientY,
});

const getTouchDistance = (touches: TouchList): number => {
  if (touches.length < 2) return 0;

  const first = touches[0];
  const second = touches[1];
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
};

const isEditableEventTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(target.closest('input, textarea, [contenteditable="true"]'));
};

export const ImageViewer = as<'div', ImageViewerProps>(
  (
    {
      className,
      alt,
      src,
      loading,
      requestClose,
      onMinimize,
      maximized,
      onToggleMaximized,
      onWindowDragStart,
      canPrev,
      canNext,
      onPrev,
      onNext,
      ...props
    },
    ref
  ) => {
    const screenSize = useScreenSizeContext();
    const mobile = screenSize === ScreenSize.Mobile;
    const [rotation, setRotation] = useState(0);
    const [viewMode, setViewMode] = useState<ViewMode>('fit');
    const { zoom, zoomIn, zoomOut, setZoom } = useZoom(ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);
    const rotated = Math.abs(rotation % 180) === 90;
    const panEnabled = viewMode === 'actual' || zoom !== 1 || rotated;
    const { pan, cursor, onMouseDown } = usePan(panEnabled, `${src}-${rotation}-${viewMode}`);
    const [touchPan, setTouchPan] = useState(INITIAL_TOUCH_PAN);
    const [touchInteractionActive, setTouchInteractionActive] = useState(false);
    const [swiping, setSwiping] = useState(false);
    const [swipeOffsetX, setSwipeOffsetX] = useState(0);
    const [swipeOffsetY, setSwipeOffsetY] = useState(0);
    const displayRotation = ((rotation % 360) + 360) % 360;
    const swipeDeltaRef = useRef({ x: 0, y: 0 });
    const touchGestureRef = useRef<TouchGesture>();
    const swipeCleanupRef = useRef<(() => void) | null>(null);
    const transitionTimerRef = useRef<number | null>(null);
    const lastTapRef = useRef<
      | {
          time: number;
          x: number;
          y: number;
        }
      | undefined
    >();
    const mouseSwipeEnabled = !panEnabled && Boolean(onPrev || onNext);
    const touchSwipeEnabled = !panEnabled;
    const [displaySrc, setDisplaySrc] = useState(src);
    const [transitionSrc, setTransitionSrc] = useState<string>();
    const [transitionVisible, setTransitionVisible] = useState(false);
    const [displayImageOrientation, setDisplayImageOrientation] =
      useState<ImageOrientation>('landscape');
    const [transitionImageOrientation, setTransitionImageOrientation] =
      useState<ImageOrientation>('landscape');

    const handleDownload = async () => {
      const response = await fetchMediaWithAuth(src);
      const fileContent = await response.blob();
      await saveDownloadedFile(fileContent, alt);
    };

    const rotateLeft = () => setRotation((angle) => angle - 90);
    const rotateRight = () => setRotation((angle) => angle + 90);

    const toggleViewMode = () => {
      setViewMode((currentMode) => (currentMode === 'fit' ? 'actual' : 'fit'));
      setZoom(1);
      setTouchPan(INITIAL_TOUCH_PAN);
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

    const resetViewport = useCallback(() => {
      clearSwipeListeners();
      touchGestureRef.current = undefined;
      setTouchInteractionActive(false);
      setSwiping(false);
      setSwipeOffsetX(0);
      setSwipeOffsetY(0);
      swipeDeltaRef.current = { x: 0, y: 0 };
      setTouchPan(INITIAL_TOUCH_PAN);
      setZoom(1);
      setRotation(0);
      setViewMode('fit');
      lastTapRef.current = undefined;
    }, [clearSwipeListeners, setZoom]);

    const finishSwipe = useCallback(() => {
      clearSwipeListeners();

      const { x, y } = swipeDeltaRef.current;
      setSwiping(false);
      setSwipeOffsetX(0);
      setSwipeOffsetY(0);
      setTouchInteractionActive(false);
      swipeDeltaRef.current = { x: 0, y: 0 };

      if (y < -SWIPE_TRIGGER_PX && Math.abs(y) > Math.abs(x) * 1.15) {
        requestClose();
        return;
      }

      if (Math.abs(x) < SWIPE_TRIGGER_PX || Math.abs(x) <= Math.abs(y) * 1.15) {
        return;
      }

      if (x > 0 && canPrev && onPrev) {
        onPrev();
      } else if (x < 0 && canNext && onNext) {
        onNext();
      }
    }, [canNext, canPrev, clearSwipeListeners, onNext, onPrev, requestClose]);

    const handleSwipeMouseDown = useCallback<React.MouseEventHandler<HTMLImageElement>>(
      (evt) => {
        if (!mouseSwipeEnabled) return;

        evt.preventDefault();
        const startX = evt.clientX;
        const startY = evt.clientY;

        swipeDeltaRef.current = { x: 0, y: 0 };
        setSwiping(true);
        setSwipeOffsetX(0);
        setSwipeOffsetY(0);

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
      [finishSwipe, mouseSwipeEnabled]
    );

    const resetTouchGesture = useCallback(() => {
      touchGestureRef.current = undefined;
      setTouchInteractionActive(false);
      setSwiping(false);
      setSwipeOffsetX(0);
      setSwipeOffsetY(0);
      swipeDeltaRef.current = { x: 0, y: 0 };
    }, []);

    const handleImageTouchStart = useCallback<React.TouchEventHandler<HTMLImageElement>>(
      (evt) => {
        if (evt.touches.length >= 2) {
          const distance = getTouchDistance(evt.touches);
          if (!distance) return;

          setTouchInteractionActive(true);
          touchGestureRef.current = {
            mode: 'pinch',
            startDistance: distance,
            baseZoom: zoom,
          };
          setViewMode('actual');
          setSwiping(false);
          setSwipeOffsetX(0);
          setSwipeOffsetY(0);
          swipeDeltaRef.current = { x: 0, y: 0 };
          return;
        }

        const touch = evt.touches[0];
        if (!touch) return;

        const startPoint = getTouchPoint(touch);
        if (panEnabled) {
          setTouchInteractionActive(true);
          touchGestureRef.current = {
            mode: 'pan',
            startPoint,
            basePan: touchPan,
          };
          return;
        }

        if (touchSwipeEnabled) {
          setTouchInteractionActive(true);
          touchGestureRef.current = {
            mode: 'swipe',
            startPoint,
          };
          setSwiping(true);
          setSwipeOffsetX(0);
          setSwipeOffsetY(0);
          swipeDeltaRef.current = { x: 0, y: 0 };
        }
      },
      [panEnabled, touchPan, touchSwipeEnabled, zoom]
    );

    const handleImageTouchMove = useCallback<React.TouchEventHandler<HTMLImageElement>>(
      (evt) => {
        const gesture = touchGestureRef.current;
        if (!gesture) return;

        if (gesture.mode === 'pinch') {
          const distance = getTouchDistance(evt.touches);
          if (!distance) return;

          evt.preventDefault();
          setZoom(clampZoom((distance / gesture.startDistance) * gesture.baseZoom));
          return;
        }

        const touch = evt.touches[0];
        if (!touch) return;

        const currentPoint = getTouchPoint(touch);
        const deltaX = currentPoint.x - gesture.startPoint.x;
        const deltaY = currentPoint.y - gesture.startPoint.y;

        if (gesture.mode === 'pan') {
          evt.preventDefault();
          setTouchPan({
            translateX: gesture.basePan.translateX + deltaX,
            translateY: gesture.basePan.translateY + deltaY,
          });
          return;
        }

        evt.preventDefault();
        swipeDeltaRef.current = { x: deltaX, y: deltaY };
        setSwipeOffsetX(deltaX);
        setSwipeOffsetY(deltaY);
      },
      [setZoom]
    );

    const handleImageTouchEnd = useCallback<React.TouchEventHandler<HTMLImageElement>>(
      (evt) => {
        const gesture = touchGestureRef.current;
        const { x, y } = swipeDeltaRef.current;
        const couldBeTap =
          !!gesture &&
          gesture.mode !== 'pinch' &&
          Math.abs(x) < MAX_TAP_MOVEMENT_PX &&
          Math.abs(y) < MAX_TAP_MOVEMENT_PX;
        touchGestureRef.current = undefined;

        if (gesture?.mode === 'swipe') {
          finishSwipe();
        } else {
          setTouchInteractionActive(false);
          setSwiping(false);
          setSwipeOffsetX(0);
          setSwipeOffsetY(0);
          swipeDeltaRef.current = { x: 0, y: 0 };
        }

        if (!couldBeTap) {
          lastTapRef.current = undefined;
          return;
        }

        const touch = evt.changedTouches[0];
        if (!touch) return;

        const now = Date.now();
        const point = getTouchPoint(touch);
        const lastTap = lastTapRef.current;
        if (
          lastTap &&
          now - lastTap.time <= DOUBLE_TAP_INTERVAL_MS &&
          Math.abs(point.x - lastTap.x) < MAX_TAP_MOVEMENT_PX &&
          Math.abs(point.y - lastTap.y) < MAX_TAP_MOVEMENT_PX
        ) {
          resetViewport();
          return;
        }

        lastTapRef.current = { time: now, x: point.x, y: point.y };
      },
      [finishSwipe, resetViewport]
    );

    useEffect(() => {
      const handleKeyDown = (evt: KeyboardEvent) => {
        if (isEditableEventTarget(evt.target)) return;

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

    useEffect(
      () => () => {
        clearSwipeListeners();
        resetTouchGesture();
        lastTapRef.current = undefined;
        if (transitionTimerRef.current) {
          window.clearTimeout(transitionTimerRef.current);
        }
      },
      [clearSwipeListeners, resetTouchGesture]
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
      resetViewport();
    }, [resetViewport, src]);

    useEffect(() => {
      if (!panEnabled) {
        setTouchPan(INITIAL_TOUCH_PAN);
      }
    }, [panEnabled]);

    const getFitImageSizeStyle = (orientation: ImageOrientation) => {
      if (viewMode !== 'fit') {
        return {
          width: 'auto',
          height: 'auto',
          maxWidth: 'none',
          maxHeight: 'none',
        };
      }

      if (orientation === 'portrait') {
        return {
          width: 'auto',
          height: '100%',
          maxWidth: '100%',
          maxHeight: '100%',
        };
      }

      if (orientation === 'landscape') {
        return {
          width: '100%',
          height: 'auto',
          maxWidth: '100%',
          maxHeight: '100%',
        };
      }

      return {
        width: '100%',
        height: '100%',
        maxWidth: '100%',
        maxHeight: '100%',
      };
    };

    const handleDisplayImageLoad: React.ReactEventHandler<HTMLImageElement> = (evt) => {
      setDisplayImageOrientation(getImageOrientation(evt.currentTarget));
    };

    const handleTransitionImageLoad: React.ReactEventHandler<HTMLImageElement> = (evt) => {
      if (!transitionSrc) return;

      const nextOrientation = getImageOrientation(evt.currentTarget);
      setTransitionImageOrientation(nextOrientation);
      setTransitionVisible(true);
      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current);
      }
      transitionTimerRef.current = window.setTimeout(() => {
        setDisplaySrc(transitionSrc);
        setDisplayImageOrientation(nextOrientation);
        setTransitionSrc(undefined);
        setTransitionVisible(false);
        transitionTimerRef.current = null;
      }, 180);
    };

    const imageCursor = panEnabled
      ? cursor
      : mouseSwipeEnabled
        ? swiping
          ? 'grabbing'
          : 'grab'
        : 'default';
    const handleImageMouseDown = (
      panEnabled ? onMouseDown : mouseSwipeEnabled ? handleSwipeMouseDown : undefined
    ) as React.MouseEventHandler<HTMLImageElement> | undefined;
    const translateX = pan.translateX + touchPan.translateX + swipeOffsetX;
    const translateY = pan.translateY + touchPan.translateY + swipeOffsetY;
    const displayImageSizeStyle = getFitImageSizeStyle(
      getDisplayOrientation(displayImageOrientation, rotated)
    );
    const transitionImageSizeStyle = getFitImageSizeStyle(
      getDisplayOrientation(transitionImageOrientation, rotated)
    );

    return (
      <Box
        className={classNames(css.ImageViewer, className)}
        direction="Column"
        {...props}
        ref={ref}
      >
        <Header
          className={classNames(
            css.ImageViewerHeader,
            !mobile && onWindowDragStart && css.ImageViewerHeaderDraggable
          )}
          size="400"
          onPointerDown={!mobile ? onWindowDragStart : undefined}
        >
          {mobile ? (
            <Box direction="Column" gap="200" style={{ width: '100%', minWidth: 0 }}>
              <Box alignItems="Center" gap="200" style={{ width: '100%', minWidth: 0 }}>
                <IconButton
                  size="300"
                  radii="300"
                  onClick={requestClose}
                  aria-label={'\u5173\u95ed\u9884\u89c8'}
                >
                  <Icon size="50" src={Icons.Cross} />
                </IconButton>
                <Text size="T300" truncate title={alt}>
                  {alt}
                </Text>
              </Box>

              <Box
                alignItems="Center"
                gap="200"
                justifyContent="SpaceBetween"
                style={{ width: '100%', minWidth: 0, flexWrap: 'wrap' }}
              >
                <Box alignItems="Center" gap="200" style={{ minWidth: 0 }}>
                  <Chip
                    variant={displayRotation !== 0 ? 'Success' : 'SurfaceVariant'}
                    radii="Pill"
                    onClick={() => setRotation(0)}
                  >
                    <Text size="B300">{`${displayRotation}\u00b0`}</Text>
                  </Chip>
                </Box>

                <Box
                  alignItems="Center"
                  gap="200"
                  style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}
                >
                  <Chip variant="SurfaceVariant" radii="Pill" onClick={rotateLeft}>
                    <Text size="B300">{'\u5de6\u8f6c'}</Text>
                  </Chip>
                  <Chip variant="SurfaceVariant" radii="Pill" onClick={rotateRight}>
                    <Text size="B300">{'\u53f3\u8f6c'}</Text>
                  </Chip>
                </Box>
              </Box>
            </Box>
          ) : (
            <>
              <Box grow="Yes" alignItems="Center" gap="200" style={{ minWidth: 0 }}>
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

              <Box
                shrink="No"
                alignItems="Center"
                gap="200"
                style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}
              >
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

                {!loading && (
                  <Chip
                    variant="Primary"
                    onClick={handleDownload}
                    radii="300"
                    before={<Icon size="50" src={Icons.Download} />}
                  >
                    <Text size="B300">{'\u4e0b\u8f7d'}</Text>
                  </Chip>
                )}

                {(onMinimize || onToggleMaximized) && (
                  <Box className={css.ImageViewerWindowControls} shrink="No" alignItems="Center">
                    {onMinimize && (
                      <IconButton
                        variant="SurfaceVariant"
                        size="300"
                        radii="300"
                        onClick={onMinimize}
                        aria-label={'\u6700\u5c0f\u5316\u9884\u89c8'}
                        title={'\u6700\u5c0f\u5316\u9884\u89c8'}
                      >
                        <Icon size="50" src={Icons.Minus} />
                      </IconButton>
                    )}

                    {onToggleMaximized && (
                      <IconButton
                        variant={maximized ? 'Success' : 'SurfaceVariant'}
                        size="300"
                        radii="300"
                        onClick={onToggleMaximized}
                        aria-label={
                          maximized ? '\u8fd8\u539f\u7a97\u53e3' : '\u6700\u5927\u5316\u9884\u89c8'
                        }
                        title={
                          maximized ? '\u8fd8\u539f\u7a97\u53e3' : '\u6700\u5927\u5316\u9884\u89c8'
                        }
                      >
                        <span
                          className={classNames(
                            css.WindowControlGlyph,
                            maximized ? css.WindowRestoreGlyph : css.WindowMaximizeGlyph
                          )}
                        />
                      </IconButton>
                    )}

                    <IconButton
                      variant="SurfaceVariant"
                      size="300"
                      radii="300"
                      onClick={requestClose}
                      aria-label={'\u5173\u95ed\u9884\u89c8'}
                      title={'\u5173\u95ed\u9884\u89c8'}
                    >
                      <Icon size="50" src={Icons.Cross} />
                    </IconButton>
                  </Box>
                )}
              </Box>
            </>
          )}
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
                size={mobile ? '300' : '400'}
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
                  ...displayImageSizeStyle,
                  transform: `translate(${translateX}px, ${translateY}px) rotate(${rotation}deg) scale(${zoom})`,
                  transition:
                    swiping || cursor === 'grabbing' || touchInteractionActive
                      ? 'none'
                      : undefined,
                  touchAction: 'none',
                  WebkitTouchCallout: 'default',
                }}
                src={displaySrc}
                alt={alt}
                onLoad={handleDisplayImageLoad}
                onMouseDown={handleImageMouseDown}
                onTouchStart={handleImageTouchStart}
                onTouchMove={handleImageTouchMove}
                onTouchEnd={handleImageTouchEnd}
                onTouchCancel={resetTouchGesture}
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
                    ...transitionImageSizeStyle,
                    transform: `translate(${translateX}px, ${translateY}px) rotate(${rotation}deg) scale(${zoom})`,
                    transition:
                      swiping || cursor === 'grabbing' || touchInteractionActive
                        ? 'none'
                        : undefined,
                    touchAction: 'none',
                    WebkitTouchCallout: 'default',
                  }}
                  src={transitionSrc}
                  alt={alt}
                  onLoad={handleTransitionImageLoad}
                  onMouseDown={handleImageMouseDown}
                  onTouchStart={handleImageTouchStart}
                  onTouchMove={handleImageTouchMove}
                  onTouchEnd={handleImageTouchEnd}
                  onTouchCancel={resetTouchGesture}
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
                    {'原图正在加载...'}
                  </Text>
                </Box>
              )}
            </Box>

            {onNext && (
              <IconButton
                className={classNames(css.NavButton, css.NavButtonRight)}
                variant="SurfaceVariant"
                size={mobile ? '300' : '400'}
                radii="Pill"
                onClick={onNext}
                disabled={!canNext}
                aria-label={'\u4e0b\u4e00\u5f20'}
              >
                <Icon size="100" src={Icons.ArrowRight} />
              </IconButton>
            )}
          </Box>
        </Box>
      </Box>
    );
  }
);
