import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

export const card = style([
  DefaultReset,
  {
    width: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
    background: color.Surface.Container,
  },
]);

export const fileSummary = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S300,
    minWidth: 0,
    minHeight: toRem(78),
    padding: `${config.space.S300} ${config.space.S400}`,
    background: color.Surface.Container,
    color: color.Surface.OnContainer,
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
    columnGap: toRem(3),
    padding: `${toRem(5)} ${toRem(6)}`,
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
    minHeight: toRem(40),
    padding: toRem(2),
    border: 0,
    background: 'transparent',
    color: color.Primary.Main,
    font: 'inherit',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'color 120ms ease',
    selectors: {
      '&:not(:first-child)::before': {
        content: '',
        position: 'absolute',
        left: toRem(-2),
        top: '22%',
        width: config.borderWidth.B300,
        height: '56%',
        background: color.SurfaceVariant.ContainerLine,
      },
      '&:focus-visible': {
        outline: 'none',
      },
      '&:disabled': {
        color: color.SurfaceVariant.OnContainer,
        cursor: 'not-allowed',
        opacity: 0.46,
      },
    },
  },
]);

export const actionLabel = style([
  DefaultReset,
  {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
    minHeight: toRem(32),
    paddingBlock: 0,
    paddingInline: config.space.S200,
    borderRadius: toRem(999),
    transition: 'background-color 120ms ease, box-shadow 120ms ease',
    selectors: {
      [`${actionButton}:hover:not(:disabled) &`]: {
        background: color.SurfaceVariant.Container,
      },
      [`${actionButton}:focus-visible &`]: {
        boxShadow: '0 0 0 2px currentColor',
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
    overflow: 'hidden',
    pointerEvents: 'none',
    '@media': {
      'screen and (max-width: 750px)': {
        padding: 0,
        alignItems: 'stretch',
        justifyContent: 'stretch',
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
        width: '100%',
        height: 'var(--app-height, 100dvh)',
        minHeight: 0,
        maxWidth: '100vw',
        maxHeight: 'var(--app-height, 100dvh)',
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
    '@media': {
      'screen and (max-width: 750px)': {
        minHeight: toRem(56),
        paddingTop: `max(${config.space.S200}, var(--safe-area-top, env(safe-area-inset-top, 0px)))`,
        paddingRight: `max(${config.space.S200}, var(--safe-area-right, env(safe-area-inset-right, 0px)))`,
        paddingBottom: config.space.S200,
        paddingLeft: `max(${config.space.S200}, var(--safe-area-left, env(safe-area-inset-left, 0px)))`,
      },
      'screen and (max-width: 410px)': {
        gap: config.space.S100,
      },
      'screen and (max-height: 520px) and (orientation: landscape)': {
        minHeight: toRem(48),
        paddingTop: `max(${config.space.S100}, var(--safe-area-top, env(safe-area-inset-top, 0px)))`,
        paddingBottom: config.space.S100,
      },
    },
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
    '@media': {
      'screen and (max-width: 410px)': {
        width: toRem(28),
        height: toRem(32),
        fontSize: toRem(13),
      },
    },
  },
]);

export const editorBody = style([
  DefaultReset,
  {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
    background: '#eef1f5',
    '@media': {
      'screen and (max-width: 750px)': {
        paddingRight: 'var(--safe-area-right, env(safe-area-inset-right, 0px))',
        paddingBottom: 'var(--safe-area-bottom, env(safe-area-inset-bottom, 0px))',
        paddingLeft: 'var(--safe-area-left, env(safe-area-inset-left, 0px))',
      },
    },
  },
]);

export const editorFrame = style([
  DefaultReset,
  {
    display: 'block',
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    border: 0,
    background: '#fff',
    touchAction: 'manipulation',
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
    zIndex: 3,
    padding: config.space.S500,
    color: color.Critical.Main,
  },
]);

export const saveStatus = style([
  DefaultReset,
  {
    position: 'absolute',
    zIndex: 4,
    left: '50%',
    bottom: config.space.S300,
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S300,
    width: `min(${toRem(520)}, calc(100% - ${toRem(32)}))`,
    minWidth: 0,
    padding: `${config.space.S200} ${config.space.S300}`,
    border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
    borderRadius: config.radii.R500,
    background: color.Surface.Container,
    color: color.Surface.OnContainer,
    boxShadow: '0 12px 36px rgba(15, 23, 42, 0.22)',
    '@media': {
      'screen and (max-width: 520px)': {
        alignItems: 'stretch',
        flexDirection: 'column',
        bottom: `calc(${config.space.S200} + var(--safe-area-bottom, env(safe-area-inset-bottom, 0px)))`,
      },
    },
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
    maxHeight:
      'calc(var(--app-height, 100dvh) - var(--safe-area-top, env(safe-area-inset-top, 0px)) - var(--safe-area-bottom, env(safe-area-inset-bottom, 0px)) - 32px)',
    padding: config.space.S500,
    overflowY: 'auto',
    borderRadius: config.radii.R500,
    background: color.Surface.Container,
    color: color.Surface.OnContainer,
    boxShadow: '0 18px 54px rgba(15, 23, 42, 0.28)',
  },
]);

export const nativeEditorWindow = style([
  DefaultReset,
  {
    display: 'flex',
    flexDirection: 'column',
    width: '100vw',
    height: '100vh',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    background: color.Surface.Container,
    color: color.Surface.OnContainer,
  },
]);

export const nativeWindowFallback = style([
  DefaultReset,
  {
    width: '100vw',
    height: '100vh',
    background: color.Surface.Container,
    color: color.Surface.OnContainer,
  },
]);

export const nativeWindowControls = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S100,
    paddingLeft: config.space.S100,
    borderLeft: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  },
]);

export const nativeWindowMaximizeGlyph = style([
  DefaultReset,
  {
    display: 'inline-block',
    width: toRem(13),
    height: toRem(13),
    border: '1.7px solid currentColor',
    borderRadius: toRem(2),
  },
]);

export const nativeWindowRestoreGlyph = style([
  DefaultReset,
  {
    position: 'relative',
    display: 'inline-block',
    width: toRem(14),
    height: toRem(14),
    selectors: {
      '&::before': {
        content: '',
        position: 'absolute',
        top: 0,
        right: 0,
        width: toRem(10),
        height: toRem(10),
        border: '1.5px solid currentColor',
        borderRadius: toRem(2),
      },
      '&::after': {
        content: '',
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: toRem(10),
        height: toRem(10),
        borderLeft: '1.5px solid currentColor',
        borderBottom: '1.5px solid currentColor',
        borderRadius: toRem(2),
      },
    },
  },
]);
