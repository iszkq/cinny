import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

export const card = style([
  DefaultReset,
  {
    width: '100%',
    overflow: 'hidden',
  },
]);

export const fileSummary = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S300,
    minWidth: 0,
    padding: `${config.space.S300} ${config.space.S400}`,
    background: color.SurfaceVariant.Container,
  },
]);

export const fileIcon = style([
  DefaultReset,
  {
    position: 'relative',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: toRem(44),
    height: toRem(52),
    borderRadius: toRem(5),
    color: '#fff',
    fontSize: toRem(20),
    fontWeight: 700,
    lineHeight: 1,
    boxShadow: '0 5px 14px rgba(15, 23, 42, 0.14)',
    selectors: {
      '&::after': {
        content: '',
        position: 'absolute',
        top: 0,
        right: 0,
        width: toRem(12),
        height: toRem(12),
        background: 'rgba(255, 255, 255, 0.82)',
        clipPath: 'polygon(0 0, 100% 100%, 100% 0)',
      },
    },
  },
]);

export const fileMeta = style([
  DefaultReset,
  {
    display: 'flex',
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    gap: toRem(4),
  },
]);

export const fileName = style({
  width: '100%',
});

export const actions = style([
  DefaultReset,
  {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    borderTop: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
    background: color.Surface.Container,
  },
]);

export const actionButton = style([
  DefaultReset,
  {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    minHeight: toRem(48),
    padding: `${config.space.S200} ${config.space.S100}`,
    border: 0,
    background: 'transparent',
    color: color.Primary.Main,
    font: 'inherit',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 120ms ease, color 120ms ease',
    selectors: {
      '&:not(:first-child)::before': {
        content: '',
        position: 'absolute',
        left: 0,
        top: '25%',
        width: config.borderWidth.B300,
        height: '50%',
        background: color.SurfaceVariant.ContainerLine,
      },
      '&:hover:not(:disabled)': {
        background: color.Primary.Container,
      },
      '&:focus-visible': {
        outline: `2px solid ${color.Primary.Main}`,
        outlineOffset: '-2px',
      },
      '&:disabled': {
        color: color.SurfaceVariant.OnContainer,
        cursor: 'not-allowed',
        opacity: 0.46,
      },
    },
  },
]);

export const overlayCenter = style([
  DefaultReset,
  {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: toRem(20),
    pointerEvents: 'none',
    '@media': {
      'screen and (max-width: 750px)': {
        padding: 0,
      },
    },
  },
]);

export const editorModal = style([
  DefaultReset,
  {
    display: 'flex',
    flexDirection: 'column',
    width: 'min(96vw, 1500px)',
    height: 'min(94vh, 960px)',
    minWidth: 0,
    minHeight: toRem(420),
    maxWidth: 'none',
    maxHeight: 'none',
    padding: 0,
    overflow: 'hidden',
    borderRadius: config.radii.R500,
    pointerEvents: 'all',
    boxShadow: '0 26px 80px rgba(15, 23, 42, 0.32)',
    '@media': {
      'screen and (max-width: 750px)': {
        width: '100vw',
        height: 'var(--app-height, 100dvh)',
        minHeight: 'var(--app-height, 100dvh)',
        paddingTop: 'var(--safe-area-top, env(safe-area-inset-top, 0px))',
        borderRadius: 0,
      },
    },
  },
]);

export const editorHeader = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S300,
    flexShrink: 0,
    minHeight: toRem(64),
    padding: `${config.space.S200} ${config.space.S300}`,
    borderBottom: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
    background: color.Surface.Container,
  },
]);

export const headerIcon = style([
  DefaultReset,
  {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: toRem(34),
    height: toRem(38),
    borderRadius: toRem(5),
    color: '#fff',
    fontWeight: 700,
  },
]);

export const editorBody = style([
  DefaultReset,
  {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    background: '#eef1f5',
  },
]);

export const editorFrame = style([
  DefaultReset,
  {
    display: 'block',
    width: '100%',
    height: '100%',
    border: 0,
    background: '#fff',
  },
]);

export const loadingLayer = style([
  DefaultReset,
  {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: config.space.S300,
    background: color.Surface.Container,
    color: color.Surface.OnContainer,
  },
]);

export const errorLayer = style([
  loadingLayer,
  {
    color: color.Critical.Main,
  },
]);

export const promptBackdrop = style([
  DefaultReset,
  {
    position: 'absolute',
    inset: 0,
    zIndex: 5,
    display: 'grid',
    placeItems: 'center',
    padding: config.space.S400,
    background: 'rgba(15, 23, 42, 0.48)',
  },
]);

export const promptCard = style([
  DefaultReset,
  {
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S400,
    width: `min(${toRem(460)}, calc(100vw - ${toRem(40)}))`,
    padding: config.space.S500,
    borderRadius: config.radii.R500,
    background: color.Surface.Container,
    color: color.Surface.OnContainer,
    boxShadow: '0 18px 54px rgba(15, 23, 42, 0.28)',
  },
]);
