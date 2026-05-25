import { style } from '@vanilla-extract/css';

export const ModalWide = style({
  minWidth: '85vw',
  minHeight: '90vh',
});

export const ImageViewerModal = style({
  width: 'min(68vw, 1040px)',
  height: 'min(70vh, 720px)',
  minWidth: 'min(68vw, 1040px)',
  minHeight: 'min(70vh, 720px)',
  maxWidth: 'calc(100vw - 48px)',
  maxHeight: 'calc(var(--app-height, 100dvh) - 48px)',
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
