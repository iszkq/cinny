import type { CSSProperties } from 'react';

type ImageViewerModalStyle = CSSProperties & {
  '--image-viewer-modal-width'?: string;
  '--image-viewer-modal-height'?: string;
};

type ImageOrientation = 'landscape' | 'portrait' | 'square';

const getPositiveDimension = (dimension?: number): number | undefined => {
  if (typeof dimension !== 'number' || !Number.isFinite(dimension) || dimension <= 0) {
    return undefined;
  }

  return dimension;
};

const getImageOrientation = (width?: number, height?: number): ImageOrientation | undefined => {
  const imageWidth = getPositiveDimension(width);
  const imageHeight = getPositiveDimension(height);

  if (!imageWidth || !imageHeight) {
    return undefined;
  }

  const aspectRatio = imageWidth / imageHeight;
  if (aspectRatio > 1.15) {
    return 'landscape';
  }
  if (aspectRatio < 0.85) {
    return 'portrait';
  }
  return 'square';
};

export const getImageViewerModalStyle = (
  width?: number,
  height?: number
): ImageViewerModalStyle => {
  const orientation = getImageOrientation(width, height);

  if (orientation === 'portrait') {
    return {
      '--image-viewer-modal-width': 'min(62vw, 820px)',
      '--image-viewer-modal-height': 'min(82vh, 840px)',
    };
  }

  if (orientation === 'square') {
    return {
      '--image-viewer-modal-width': 'min(70vw, 900px)',
      '--image-viewer-modal-height': 'min(80vh, 820px)',
    };
  }

  return {
    '--image-viewer-modal-width': 'min(76vw, 1120px)',
    '--image-viewer-modal-height': 'min(78vh, 780px)',
  };
};
