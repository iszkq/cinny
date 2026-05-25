import { style } from '@vanilla-extract/css';

export const ModalWide = style({
  minWidth: '85vw',
  minHeight: '90vh',
});

export const ImageViewerBackdrop = style({
  background: 'rgba(248, 250, 252, 0.36)',
  backdropFilter: 'none !important',
  WebkitBackdropFilter: 'none !important',
  filter: 'none !important',
});

export const ImageViewerModal = style({
  width: 'var(--image-viewer-modal-width, min(76vw, 1120px))',
  height: 'var(--image-viewer-modal-height, min(78vh, 780px))',
  minWidth: 'var(--image-viewer-modal-width, min(76vw, 1120px))',
  minHeight: 'var(--image-viewer-modal-height, min(78vh, 780px))',
  maxWidth: 'calc(100vw - 40px)',
  maxHeight: 'calc(var(--app-height, 100dvh) - 40px)',
  padding: 0,
  border: 0,
  background: 'transparent',
  boxShadow: 'none',
  overflow: 'hidden',
  '@media': {
    'screen and (max-width: 750px)': {
      width: '100vw',
      height: 'var(--app-height, 100dvh)',
      minWidth: '100vw',
      minHeight: 'var(--app-height, 100dvh)',
      maxWidth: '100vw',
      maxHeight: 'var(--app-height, 100dvh)',
    },
  },
});
