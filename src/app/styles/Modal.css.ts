import { style } from '@vanilla-extract/css';
import { DefaultReset, config } from 'folds';

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

export const ImageViewerWindowLayer = style([
  DefaultReset,
  {
    position: 'fixed',
    inset: 0,
    zIndex: config.zIndex.Max,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '28px',
    pointerEvents: 'none',
    '@media': {
      'screen and (max-width: 750px)': {
        display: 'none',
      },
    },
  },
]);

export const ImageViewerWindowModal = style({
  pointerEvents: 'all',
});

export const ImageViewerWindowMaximized = style({
  width: 'calc(100vw - 32px)',
  height: 'calc(var(--app-height, 100dvh) - 32px)',
  minWidth: 'calc(100vw - 32px)',
  minHeight: 'calc(var(--app-height, 100dvh) - 32px)',
  maxWidth: 'calc(100vw - 32px)',
  maxHeight: 'calc(var(--app-height, 100dvh) - 32px)',
});

export const ImageViewerMinimizedLayer = style([
  DefaultReset,
  {
    position: 'fixed',
    right: '24px',
    bottom: '24px',
    zIndex: config.zIndex.Max,
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S100,
    padding: config.space.S100,
    borderRadius: config.radii.R400,
    background: 'rgba(248, 250, 252, 0.9)',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    boxShadow: '0 18px 48px rgba(15, 23, 42, 0.18)',
    backdropFilter: 'blur(18px) saturate(150%)',
    WebkitBackdropFilter: 'blur(18px) saturate(150%)',
    pointerEvents: 'all',
  },
]);

export const ImageViewerMinimizedButton = style([
  DefaultReset,
  {
    maxWidth: 'min(360px, calc(100vw - 120px))',
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S100,
    padding: `${config.space.S100} ${config.space.S250}`,
    border: 0,
    borderRadius: config.radii.R300,
    background: 'rgba(255, 255, 255, 0.66)',
    color: '#111827',
    cursor: 'pointer',
  },
]);
