/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
    const displayRotation = ((rotation % 360) + 360) % 360;
    const resolvedActiveItemId = activeItemId ?? src;
    const thumbnailRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const hasThumbnailRail = !!items && items.length > 1;

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

    useLayoutEffect(() => {
      setZoom(1);
      setRotation(0);
      setViewMode('fit');
    }, [setZoom, src]);

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
                className={css.ImageViewerImg}
                style={{
                  cursor,
                  maxWidth: viewMode === 'fit' ? '100%' : 'none',
                  maxHeight: viewMode === 'fit' ? '100%' : 'none',
                  transform: `translate(${pan.translateX}px, ${pan.translateY}px) rotate(${rotation}deg) scale(${zoom})`,
                }}
                src={src}
                alt={alt}
                onMouseDown={onMouseDown}
                onDoubleClick={toggleViewMode}
                draggable={false}
              />
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
                        <img className={css.ThumbnailImage} src={item.previewSrc} alt={item.alt} />
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
