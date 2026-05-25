import type { CSSProperties } from 'react';

type ImageViewerModalStyle = CSSProperties & {
  '--image-viewer-modal-width'?: string;
  '--image-viewer-modal-height'?: string;
};

type ImageOrientation = 'landscape' | 'portrait' | 'square';

const LANDSCAPE_MODAL_STYLE: ImageViewerModalStyle = {
  '--image-viewer-modal-width': 'min(76vw, 1120px)',
  '--image-viewer-modal-height': 'min(78vh, 780px)',
};

const PORTRAIT_MODAL_STYLE: ImageViewerModalStyle = {
  '--image-viewer-modal-width': 'min(48vw, 720px)',
  '--image-viewer-modal-height': 'min(90vh, 920px)',
};

const SQUARE_MODAL_STYLE: ImageViewerModalStyle = {
  '--image-viewer-modal-width': 'min(70vw, 900px)',
  '--image-viewer-modal-height': 'min(80vh, 820px)',
};

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
    return PORTRAIT_MODAL_STYLE;
  }
  if (orientation === 'square') {
    return SQUARE_MODAL_STYLE;
  }

  return LANDSCAPE_MODAL_STYLE;
};
