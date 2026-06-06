import { style } from '@vanilla-extract/css';
import { DefaultReset, config } from 'folds';

export const ImageViewer = style([
  DefaultReset,
  {
    width: '100%',
    height: '100%',
    minHeight: 0,
    borderRadius: config.radii.R500,
    overflow: 'hidden',
    backgroundColor: 'rgba(248, 250, 252, 0.78)',
    color: '#111827',
    border: '1px solid rgba(255, 255, 255, 0.74)',
    boxShadow: '0 28px 80px rgba(15, 23, 42, 0.22)',
    backdropFilter: 'blur(22px) saturate(150%)',
    WebkitBackdropFilter: 'blur(22px) saturate(150%)',
    '@media': {
      'screen and (max-width: 750px)': {
        borderRadius: 0,
      },
    },
  },
]);

export const ImageViewerHeader = style([
  DefaultReset,
  {
    paddingLeft: config.space.S300,
    paddingRight: config.space.S300,
    borderBottom: '1px solid rgba(148, 163, 184, 0.18)',
    background: 'rgba(255, 255, 255, 0.56)',
    backdropFilter: 'blur(18px) saturate(150%)',
    WebkitBackdropFilter: 'blur(18px) saturate(150%)',
    flexShrink: 0,
    position: 'relative',
    zIndex: 4,
    gap: config.space.S200,
    '@media': {
      'screen and (max-width: 1124px)': {
        paddingTop: `max(${config.space.S200}, env(safe-area-inset-top, 0px))`,
        paddingLeft: `max(${config.space.S200}, env(safe-area-inset-left, 0px))`,
        paddingRight: `max(${config.space.S200}, env(safe-area-inset-right, 0px))`,
      },
      'screen and (max-width: 750px)': {
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)',
        paddingLeft: `max(${config.space.S200}, env(safe-area-inset-left, 0px))`,
        paddingRight: `max(${config.space.S200}, env(safe-area-inset-right, 0px))`,
        paddingBottom: config.space.S200,
      },
    },
  },
]);

export const ImageViewerHeaderDraggable = style({
  cursor: 'grab',
  touchAction: 'none',
  userSelect: 'none',
  selectors: {
    '&:active': {
      cursor: 'grabbing',
    },
  },
});

export const ImageViewerContent = style([
  DefaultReset,
  {
    width: '100%',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
    padding: config.space.S300,
    background:
      'linear-gradient(180deg, rgba(255, 255, 255, 0.42), rgba(241, 245, 249, 0.38))',
    '@media': {
      'screen and (max-width: 750px)': {
        padding: config.space.S100,
        paddingBottom: 0,
      },
    },
  },
]);

export const ImageViewerStage = style([
  DefaultReset,
  {
    width: '100%',
    flex: 1,
    display: 'flex',
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
    overflow: 'hidden',
    borderRadius: config.radii.R400,
    background: 'rgba(255, 255, 255, 0.36)',
    border: '1px solid rgba(255, 255, 255, 0.48)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.54)',
    '@media': {
      'screen and (max-width: 750px)': {
        borderRadius: config.radii.R200,
      },
    },
  },
]);

export const ImageViewerImg = style([
  DefaultReset,
  {
    position: 'relative',
    zIndex: 1,
    display: 'block',
    width: '100%',
    height: '100%',
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
      'linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(226, 232, 240, 0.42))',
  },
]);

export const ImageViewerWindowControls = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S100,
    marginLeft: config.space.S100,
    paddingLeft: config.space.S100,
    borderLeft: '1px solid rgba(148, 163, 184, 0.22)',
  },
]);

export const WindowControlGlyph = style([
  DefaultReset,
  {
    position: 'relative',
    width: '14px',
    height: '14px',
    display: 'inline-block',
    color: 'currentColor',
    boxSizing: 'border-box',
  },
]);

export const WindowMaximizeGlyph = style({
  border: '1.8px solid currentColor',
  borderRadius: '3px',
});

export const WindowRestoreGlyph = style({
  selectors: {
    '&::before': {
      content: '""',
      position: 'absolute',
      top: '1px',
      right: '1px',
      width: '9px',
      height: '9px',
      border: '1.6px solid currentColor',
      borderRadius: '3px',
    },
    '&::after': {
      content: '""',
      position: 'absolute',
      left: '1px',
      bottom: '1px',
      width: '9px',
      height: '9px',
      border: '1.6px solid currentColor',
      borderRadius: '3px',
      background: 'currentColor',
      clipPath:
        'polygon(0 0, 100% 0, 100% 1.6px, 1.6px 1.6px, 1.6px 100%, 0 100%)',
    },
  },
});

export const NavButton = style([
  DefaultReset,
  {
    position: 'absolute',
    top: '50%',
    zIndex: 2,
    transform: 'translateY(-50%)',
    background: 'rgba(255, 255, 255, 0.72)',
    color: '#111827',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.14)',
    backdropFilter: 'blur(14px) saturate(145%)',
    WebkitBackdropFilter: 'blur(14px) saturate(145%)',
  },
]);

export const NavButtonLeft = style({
  left: config.space.S300,
  '@media': {
    'screen and (max-width: 750px)': {
      left: config.space.S100,
    },
  },
});

export const NavButtonRight = style({
  right: config.space.S300,
  '@media': {
    'screen and (max-width: 750px)': {
      right: config.space.S100,
    },
  },
});
