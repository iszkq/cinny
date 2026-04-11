/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
import React, { useEffect, useLayoutEffect, useState } from 'react';
import FileSaver from 'file-saver';
import classNames from 'classnames';
import { Box, Chip, Header, Icon, IconButton, Icons, Text, as, config } from 'folds';
import * as css from './ImageViewer.css';
import { useZoom } from '../../hooks/useZoom';
import { usePan } from '../../hooks/usePan';
import { downloadMedia } from '../../utils/matrix';

export type ImageViewerProps = {
  alt: string;
  src: string;
  requestClose: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
};

const ZOOM_STEP = 0.2;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

export const ImageViewer = as<'div', ImageViewerProps>(
  ({ className, alt, src, requestClose, canPrev, canNext, onPrev, onNext, ...props }, ref) => {
    const [rotation, setRotation] = useState(0);
    const { zoom, zoomIn, zoomOut, setZoom } = useZoom(ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);
    const rotated = Math.abs(rotation % 180) === 90;
    const { pan, cursor, onMouseDown } = usePan(zoom !== 1 || rotated, `${src}-${rotation}`);
    const displayRotation = ((rotation % 360) + 360) % 360;

    const handleDownload = async () => {
      const fileContent = await downloadMedia(src);
      FileSaver.saveAs(fileContent, alt);
    };

    const rotateLeft = () => setRotation((angle) => angle - 90);
    const rotateRight = () => setRotation((angle) => angle + 90);
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

    useLayoutEffect(() => {
      setZoom(1);
      setRotation(0);
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
            <IconButton size="300" radii="300" onClick={requestClose} aria-label="Close viewer">
              <Icon size="50" src={Icons.ArrowLeft} />
            </IconButton>
            <Text size="T300" truncate>
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
              aria-label="Zoom out"
            >
              <Icon size="50" src={Icons.Minus} />
            </IconButton>
            <Chip
              variant="SurfaceVariant"
              radii="Pill"
              onClick={() => setZoom(zoom === 1 ? 2 : 1)}
            >
              <Text size="B300">{Math.round(zoom * 100)}%</Text>
            </Chip>
            <IconButton
              variant={zoom > 1 ? 'Success' : 'SurfaceVariant'}
              outlined={zoom > 1}
              size="300"
              radii="Pill"
              onClick={zoomIn}
              aria-label="Zoom in"
            >
              <Icon size="50" src={Icons.Plus} />
            </IconButton>
            <Chip variant="SurfaceVariant" radii="Pill" onClick={rotateLeft}>
              <Text size="B300">左转</Text>
            </Chip>
            <Chip
              variant={displayRotation !== 0 ? 'Success' : 'SurfaceVariant'}
              radii="Pill"
              onClick={() => setRotation(0)}
            >
              <Text size="B300">{displayRotation}°</Text>
            </Chip>
            <Chip variant="SurfaceVariant" radii="Pill" onClick={rotateRight}>
              <Text size="B300">右转</Text>
            </Chip>
            <Chip
              variant="Primary"
              onClick={handleDownload}
              radii="300"
              before={<Icon size="50" src={Icons.Download} />}
            >
              <Text size="B300">下载</Text>
            </Chip>
          </Box>
        </Header>
        <Box
          grow="Yes"
          className={css.ImageViewerContent}
          justifyContent="Center"
          alignItems="Center"
          style={{ position: 'relative' }}
        >
          {onPrev && (
            <IconButton
              style={{
                position: 'absolute',
                left: config.space.S300,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 2,
                background: 'rgba(15, 23, 42, 0.72)',
                color: '#fff',
                boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
              }}
              variant="SurfaceVariant"
              size="400"
              radii="Pill"
              onClick={onPrev}
              disabled={!canPrev}
              aria-label="Previous image"
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
                transform: `translate(${pan.translateX}px, ${pan.translateY}px) rotate(${rotation}deg) scale(${zoom})`,
              }}
              src={src}
              alt={alt}
              onMouseDown={onMouseDown}
              draggable={false}
            />
          </Box>

          {onNext && (
            <IconButton
              style={{
                position: 'absolute',
                right: config.space.S300,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 2,
                background: 'rgba(15, 23, 42, 0.72)',
                color: '#fff',
                boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
              }}
              variant="SurfaceVariant"
              size="400"
              radii="Pill"
              onClick={onNext}
              disabled={!canNext}
              aria-label="Next image"
            >
              <Icon size="100" src={Icons.ArrowRight} />
            </IconButton>
          )}
        </Box>
      </Box>
    );
  }
);
