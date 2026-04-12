import { style } from '@vanilla-extract/css';
import { DefaultReset, config } from 'folds';

export const ImageViewer = style([
  DefaultReset,
  {
    height: '100%',
    minHeight: 0,
    borderRadius: config.radii.R500,
    overflow: 'hidden',
    backgroundColor: 'rgba(7, 10, 16, 0.96)',
    color: '#fff',
    boxShadow: '0 28px 80px rgba(7, 10, 16, 0.4)',
  },
]);

export const ImageViewerHeader = style([
  DefaultReset,
  {
    paddingLeft: config.space.S300,
    paddingRight: config.space.S300,
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(255, 255, 255, 0.03)',
    flexShrink: 0,
    gap: config.space.S200,
  },
]);

export const ImageViewerContent = style([
  DefaultReset,
  {
    minHeight: 0,
    overflow: 'hidden',
    padding: config.space.S300,
    background:
      'radial-gradient(circle at top, rgba(59, 130, 246, 0.08), transparent 32%), rgba(7, 10, 16, 0.98)',
  },
]);

export const ImageViewerStage = style([
  DefaultReset,
  {
    position: 'relative',
    minHeight: 0,
    overflow: 'hidden',
  },
]);

export const ImageViewerViewport = style([
  DefaultReset,
  {
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: 0,
    overflow: 'hidden',
    borderRadius: config.radii.R400,
    background: 'rgba(255, 255, 255, 0.02)',
  },
]);

export const ImageViewerImg = style([
  DefaultReset,
  {
    position: 'relative',
    zIndex: 1,
    display: 'block',
    width: 'auto',
    height: 'auto',
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    backgroundColor: 'transparent',
    transformOrigin: 'center center',
    transition: 'transform 140ms ease',
    userSelect: 'none',
    WebkitUserDrag: 'none',
  },
]);

export const ImageViewerImgFading = style({
  opacity: 0.22,
});

export const ImageViewerImgOverlay = style({
  position: 'absolute',
  inset: 0,
  margin: 'auto',
  opacity: 0,
  zIndex: 2,
  transition: 'opacity 180ms ease',
  pointerEvents: 'none',
});

export const ImageViewerImgOverlayVisible = style({
  opacity: 1,
});

export const ImageViewerLoading = style([
  DefaultReset,
  {
    position: 'absolute',
    inset: 0,
    zIndex: 3,
    pointerEvents: 'none',
    background:
      'linear-gradient(180deg, rgba(7, 10, 16, 0.04), rgba(7, 10, 16, 0.18))',
  },
]);

export const NavButton = style([
  DefaultReset,
  {
    position: 'absolute',
    top: '50%',
    zIndex: 2,
    transform: 'translateY(-50%)',
    background: 'rgba(15, 23, 42, 0.72)',
    color: '#fff',
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
  },
]);

export const NavButtonLeft = style({
  left: config.space.S300,
});

export const NavButtonRight = style({
  right: config.space.S300,
});

export const ThumbnailRail = style([
  DefaultReset,
  {
    flexShrink: 0,
    paddingTop: config.space.S200,
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  },
]);

export const ThumbnailHeader = style([
  DefaultReset,
  {
    padding: `0 ${config.space.S100}`,
  },
]);

export const ThumbnailList = style([
  DefaultReset,
  {
    display: 'flex',
    gap: config.space.S200,
    overflowX: 'auto',
    padding: `${config.space.S100} ${config.space.S100} ${config.space.S200}`,
    scrollbarWidth: 'thin',
  },
]);

export const ThumbnailButton = style([
  DefaultReset,
  {
    width: '84px',
    height: '64px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: config.space.S100,
    borderRadius: config.radii.R300,
    border: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(255, 255, 255, 0.04)',
    cursor: 'pointer',
    overflow: 'hidden',
    transition: 'transform 140ms ease, border-color 140ms ease, background 140ms ease',
    selectors: {
      '&:hover': {
        transform: 'translateY(-1px)',
        borderColor: 'rgba(255, 255, 255, 0.18)',
        background: 'rgba(255, 255, 255, 0.07)',
      },
    },
  },
]);

export const ThumbnailButtonActive = style([
  DefaultReset,
  {
    borderColor: 'rgba(96, 165, 250, 0.86)',
    background: 'rgba(96, 165, 250, 0.18)',
    boxShadow: '0 0 0 1px rgba(96, 165, 250, 0.14) inset',
  },
]);

export const ThumbnailImage = style([
  DefaultReset,
  {
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'cover',
    borderRadius: config.radii.R200,
    background: 'rgba(255, 255, 255, 0.04)',
  },
]);

export const ThumbnailPlaceholder = style([
  DefaultReset,
  {
    width: '100%',
    height: '100%',
    borderRadius: config.radii.R200,
    background: 'rgba(255, 255, 255, 0.05)',
  },
]);
