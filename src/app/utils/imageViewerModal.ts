import type { CSSProperties } from 'react';

type ImageViewerModalStyle = CSSProperties & {
  '--image-viewer-modal-width'?: string;
  '--image-viewer-modal-height'?: string;
};

type ImageOrientation = 'landscape' | 'portrait' | 'square';

const LANDSCAPE_MODAL_STYLE: ImageViewerModalStyle = {
  '--image-viewer-modal-width': 'min(88vw, 1240px)',
  '--image-viewer-modal-height': 'min(86vh, 860px)',
};

const PORTRAIT_MODAL_STYLE: ImageViewerModalStyle = {
  '--image-viewer-modal-width': 'min(86vw, 1040px)',
  '--image-viewer-modal-height': 'min(92vh, 920px)',
};

const SQUARE_MODAL_STYLE: ImageViewerModalStyle = {
  '--image-viewer-modal-width': 'min(82vw, 980px)',
  '--image-viewer-modal-height': 'min(86vh, 860px)',
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
