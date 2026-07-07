import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const Dialog = style({
  width: 'min(380px, calc(100vw - 32px))',
  maxWidth: 'calc(100vw - 32px)',
  overflow: 'hidden',
});

export const DialogBody = style({
  boxSizing: 'border-box',
  padding: `${config.space.S500} ${config.space.S500} ${config.space.S450}`,
  width: '100%',
  minWidth: 0,
});

export const IncomingHero = style({
  textAlign: 'center',
  minWidth: 0,
});

export const CallBadge = style({
  width: toRem(76),
  height: toRem(76),
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '999px',
  color: color.Success.Main,
  background: `color-mix(in srgb, ${color.Success.Container} 78%, ${color.Surface.Container})`,
  border: `${config.borderWidth.B300} solid color-mix(in srgb, ${color.Success.Main} 18%, transparent)`,
  boxShadow: `inset 0 1px 0 color-mix(in srgb, ${color.Surface.OnContainer} 16%, transparent)`,
});

export const IncomingActions = style({
  width: '100%',
  minWidth: 0,
});

export const Action = style({
  minWidth: toRem(92),
});

export const RoundAction = style({
  width: toRem(58),
  height: toRem(58),
});

export const FloatingCall = style({
  position: 'fixed',
  left: '50%',
  bottom: toRem(24),
  zIndex: config.zIndex.Max,
  width: 'min(430px, calc(100vw - 24px))',
  transform: 'translateX(-50%)',
  boxSizing: 'border-box',
  padding: `${config.space.S250} ${config.space.S300}`,
  borderRadius: config.radii.R500,
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  boxShadow: `0 ${toRem(18)} ${toRem(48)} color-mix(in srgb, ${color.Other.Shadow} 24%, transparent)`,
});

export const FloatingBadge = style({
  width: toRem(42),
  height: toRem(42),
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '999px',
  color: color.Success.Main,
  backgroundColor: color.Success.Container,
});

export const TimerPill = style({
  width: toRem(64),
  display: 'inline-flex',
  justifyContent: 'center',
  padding: `${toRem(2)} ${config.space.S100}`,
  borderRadius: config.radii.Pill,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
});

export const Toast = style({
  position: 'fixed',
  left: '50%',
  bottom: toRem(24),
  zIndex: config.zIndex.Max,
  maxWidth: 'min(460px, calc(100vw - 32px))',
  transform: 'translateX(-50%)',
  padding: `${config.space.S200} ${config.space.S300}`,
  borderRadius: config.radii.R300,
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  boxShadow: `0 ${toRem(14)} ${toRem(40)} color-mix(in srgb, ${color.Other.Shadow} 22%, transparent)`,
  pointerEvents: 'none',
});
