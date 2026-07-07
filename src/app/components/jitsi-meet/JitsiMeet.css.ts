import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

const mobileBreakpoint = 'screen and (max-width: 700px)';

export const OverlayCenter = style({
  width: '100vw',
  height: '100dvh',
  minHeight: 0,
  boxSizing: 'border-box',
  padding: 'clamp(12px, 2vw, 24px)',
  overflow: 'hidden',

  '@media': {
    [mobileBreakpoint]: {
      padding: 0,
    },
  },
});

export const Dialog = style({
  width: 'min(1180px, calc(100vw - 32px))',
  height: 'min(760px, calc(100dvh - 32px))',
  minWidth: toRem(360),
  minHeight: toRem(480),
  maxWidth: 'calc(100vw - 32px)',
  maxHeight: 'calc(100dvh - 32px)',
  position: 'relative',
  resize: 'both',
  overflow: 'hidden',
  borderRadius: config.radii.R500,
  boxShadow: '0 24px 80px rgba(0, 0, 0, 0.32)',

  selectors: {
    '&::after': {
      content: '""',
      position: 'absolute',
      right: toRem(9),
      bottom: toRem(9),
      width: toRem(14),
      height: toRem(14),
      borderRight: `${config.borderWidth.B400} solid ${color.SurfaceVariant.ContainerLine}`,
      borderBottom: `${config.borderWidth.B400} solid ${color.SurfaceVariant.ContainerLine}`,
      borderBottomRightRadius: toRem(2),
      opacity: 0.85,
      pointerEvents: 'none',
    },
  },

  '@media': {
    [mobileBreakpoint]: {
      width: '100vw',
      height: '100dvh',
      minWidth: '100vw',
      minHeight: '100dvh',
      maxWidth: '100vw',
      maxHeight: '100dvh',
      resize: 'none',
      borderRadius: 0,

      selectors: {
        '&::after': {
          display: 'none',
        },
      },
    },
  },
});

export const Shell = style({
  height: '100%',
  minWidth: 0,
  minHeight: 0,
});

export const Header = style({
  flexShrink: 0,
  padding: `${config.space.S300} ${config.space.S400}`,
  borderBottom: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  backgroundColor: color.Surface.Container,

  '@media': {
    [mobileBreakpoint]: {
      padding: `${config.space.S300} calc(${config.space.S300} + env(safe-area-inset-right, 0px)) ${config.space.S300} calc(${config.space.S300} + env(safe-area-inset-left, 0px))`,
    },
  },
});

export const HeaderIcon = style([
  DefaultReset,
  {
    width: toRem(40),
    height: toRem(40),
    borderRadius: config.radii.R400,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: color.Success.Main,
    backgroundColor: color.Success.Container,
    boxShadow: `inset 0 0 0 ${config.borderWidth.B300} ${color.Success.ContainerLine}`,
  },
]);

export const DomainPill = style({
  width: 'fit-content',
  maxWidth: '100%',
  padding: `${toRem(2)} ${config.space.S100}`,
  borderRadius: config.radii.Pill,
  color: color.SurfaceVariant.OnContainer,
  backgroundColor: color.SurfaceVariant.Container,
});

export const FrameWrap = style({
  position: 'relative',
  minWidth: 0,
  minHeight: 0,
  flexGrow: 1,
  overflow: 'hidden',
  backgroundColor: '#0b0f16',
});

export const Frame = style({
  display: 'block',
  width: '100%',
  height: '100%',
  border: 0,
  backgroundColor: '#0b0f16',
});

export const MeetingCard = style({
  width: `min(${toRem(372)}, 100%)`,
  maxWidth: '100%',
  overflow: 'hidden',
  borderRadius: config.radii.R400,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  boxShadow: '0 8px 22px rgba(0, 0, 0, 0.08)',
});

export const MeetingCardMain = style({
  padding: config.space.S300,
});

export const MeetingCardIcon = style([
  DefaultReset,
  {
    width: toRem(44),
    height: toRem(44),
    flexShrink: 0,
    borderRadius: config.radii.R400,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: color.Success.Main,
    backgroundColor: color.Success.Container,
  },
]);

export const MeetingCardFooter = style({
  padding: `${config.space.S200} ${config.space.S300} ${config.space.S300}`,
  backgroundColor: color.Surface.Container,
  borderTop: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
});

export const JoinButton = style({
  width: '100%',
  justifyContent: 'center',
});

export const CardExternalButton = style({
  flexShrink: 0,
});
