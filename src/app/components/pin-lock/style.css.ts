import { DefaultReset, color, config, toRem } from 'folds';
import { style } from '@vanilla-extract/css';

export const DialogViewport = style({
  width: '100%',
  paddingTop: `max(${config.space.S300}, env(safe-area-inset-top, 0px))`,
  paddingRight: `max(${config.space.S300}, env(safe-area-inset-right, 0px))`,
  paddingBottom: `max(${config.space.S300}, env(safe-area-inset-bottom, 0px))`,
  paddingLeft: `max(${config.space.S300}, env(safe-area-inset-left, 0px))`,
});

export const EmbeddedOverlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 2,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  paddingTop: `max(${config.space.S300}, env(safe-area-inset-top, 0px))`,
  paddingRight: `max(${config.space.S300}, env(safe-area-inset-right, 0px))`,
  paddingBottom: `max(${config.space.S300}, env(safe-area-inset-bottom, 0px))`,
  paddingLeft: `max(${config.space.S300}, env(safe-area-inset-left, 0px))`,
  background: 'rgba(18, 24, 20, 0.38)',
});

export const Card = style({
  width: `min(${toRem(560)}, calc(100vw - ${toRem(32)}))`,
  maxHeight: 'min(88vh, 44rem)',
  overflowY: 'auto',
  padding: config.space.S500,
  borderRadius: toRem(24),
  border: `1px solid rgba(105, 121, 111, 0.18)`,
  background: 'rgba(255, 255, 255, 0.97)',
  boxShadow: '0 28px 72px rgba(30, 39, 33, 0.18)',
  backdropFilter: 'blur(18px)',
  '@media': {
    'screen and (max-width: 750px)': {
      width: '100%',
      maxHeight: 'min(100vh - 24px, 44rem)',
      padding: config.space.S400,
      borderRadius: toRem(20),
    },
  },
});

export const Eyebrow = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: config.space.S100,
  padding: `${config.space.S100} ${config.space.S200}`,
  borderRadius: config.radii.R300,
  background: 'rgba(228, 236, 230, 0.92)',
  color: 'rgba(54, 69, 60, 0.92)',
  fontSize: toRem(13),
  fontWeight: 600,
  letterSpacing: '0.02em',
});

export const AccountLabel = style({
  display: 'inline-flex',
  maxWidth: '100%',
  padding: `${config.space.S100} ${config.space.S200}`,
  borderRadius: config.radii.R300,
  background: 'rgba(244, 247, 245, 0.98)',
  border: '1px solid rgba(117, 132, 123, 0.16)',
  overflowWrap: 'anywhere',
});

export const NoticeCard = style({
  padding: config.space.S300,
  borderRadius: config.radii.R400,
  background: 'linear-gradient(180deg, rgba(245, 248, 246, 1) 0%, rgba(239, 244, 240, 1) 100%)',
  border: '1px solid rgba(123, 138, 128, 0.14)',
});

export const ActionRow = style({
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: config.space.S200,
  flexWrap: 'wrap',
});

export const ScreenShell = style({
  minHeight: 'calc(var(--app-height, 100dvh) - 1px)',
  paddingTop: `max(${config.space.S500}, env(safe-area-inset-top, 0px))`,
  paddingRight: `max(${config.space.S300}, env(safe-area-inset-right, 0px))`,
  paddingBottom: `max(${config.space.S500}, env(safe-area-inset-bottom, 0px))`,
  paddingLeft: `max(${config.space.S300}, env(safe-area-inset-left, 0px))`,
});

export const ScreenCard = style({
  width: `min(${toRem(620)}, 100%)`,
  padding: config.space.S600,
  borderRadius: toRem(28),
  border: `1px solid rgba(111, 126, 117, 0.18)`,
  background:
    'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(247, 250, 247, 0.98) 100%)',
  boxShadow: '0 32px 84px rgba(29, 38, 32, 0.18)',
  '@media': {
    'screen and (max-width: 750px)': {
      padding: config.space.S400,
      borderRadius: toRem(24),
    },
  },
});

export const BrandLogo = style([
  DefaultReset,
  {
    width: toRem(48),
    height: toRem(48),
    borderRadius: config.radii.R400,
    boxShadow: '0 10px 20px rgba(38, 58, 44, 0.14)',
  },
]);
