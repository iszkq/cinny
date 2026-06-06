import React, { ReactNode } from 'react';
import { ImageViewerDialog, type ImageViewerProps } from './image-viewer';

export type RenderViewerProps = {
  src: string;
  alt: string;
  requestClose: () => void;
};

type ImageOverlayProps = RenderViewerProps & {
  viewer: boolean;
  renderViewer: (props: ImageViewerProps) => ReactNode;
};

export function ImageOverlay({ src, alt, viewer, requestClose, renderViewer }: ImageOverlayProps) {
  return (
    <ImageViewerDialog
      open={viewer}
      src={src}
      alt={alt}
      requestClose={requestClose}
      renderViewer={renderViewer}
    />
  );
}
