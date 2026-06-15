import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

const dialogViewportHeight = 'var(--thread-dialog-viewport-height, 100vh)';
const mobileDialogInset = toRem(12);
const mobileBreakpoint = 'screen and (max-width: 600px)';

export const OverlayCenter = style({
  height: dialogViewportHeight,
  minHeight: 0,
  padding: config.space.S300,
  overflow: 'hidden',

  '@media': {
    [mobileBreakpoint]: {
      alignItems: 'Start',
      padding: mobileDialogInset,
      paddingTop: `calc(${mobileDialogInset} + env(safe-area-inset-top, 0px))`,
      paddingBottom: `calc(${mobileDialogInset} + env(safe-area-inset-bottom, 0px))`,
    },
  },
});

export const Dialog = style({
  width: 'calc(100vw - 32px)',
  maxWidth: toRem(760),
  maxHeight: `calc(${dialogViewportHeight} - 48px)`,
  overflow: 'hidden',

  '@media': {
    [mobileBreakpoint]: {
      width: `calc(100vw - (${mobileDialogInset} * 2))`,
      maxWidth: 'none',
      maxHeight: `calc(${dialogViewportHeight} - (${mobileDialogInset} * 2) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))`,
      borderRadius: config.radii.R400,
    },
  },
});

export const Shell = style({
  maxHeight: `calc(${dialogViewportHeight} - 48px)`,
  minHeight: 0,

  '@media': {
    [mobileBreakpoint]: {
      maxHeight: 'inherit',
    },
  },
});

export const Header = style({
  flexShrink: 0,
  padding: config.space.S400,
  paddingBottom: config.space.S300,

  '@media': {
    [mobileBreakpoint]: {
      padding: `${config.space.S300} ${config.space.S300} ${config.space.S200}`,
    },
  },
});

export const RootPanel = style({
  flexShrink: 0,
  padding: config.space.S400,
  backgroundColor: color.SurfaceVariant.Container,
  borderTop: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  borderBottom: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,

  '@media': {
    [mobileBreakpoint]: {
      maxHeight: toRem(220),
      padding: config.space.S300,
      overflowY: 'auto',
    },
  },
});

export const RootMessage = style({
  minWidth: 0,
  paddingLeft: config.space.S300,
  borderLeft: `${toRem(3)} solid ${color.Primary.Main}`,
});

export const Content = style({
  padding: config.space.S400,
  paddingRight: config.space.S300,

  '@media': {
    [mobileBreakpoint]: {
      padding: config.space.S300,
      paddingRight: config.space.S200,
    },
  },
});

export const ScrollArea = style({
  minHeight: 0,
  overflow: 'hidden',
});

export const MessageList = style({
  position: 'relative',
  minWidth: 0,
});

export const MessageCard = style({
  minWidth: 0,
  padding: config.space.S300,
  borderRadius: config.radii.R400,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  backgroundColor: color.Surface.Container,

  '@media': {
    [mobileBreakpoint]: {
      padding: config.space.S200,
    },
  },
});

export const MessageHeader = style({
  minWidth: 0,
});

export const MessageBody = style({
  minWidth: 0,
  marginTop: config.space.S100,
  overflowWrap: 'break-word',
});

export const LocateChip = style({
  flexShrink: 0,
});

export const StatusBox = style({
  padding: config.space.S400,
  borderRadius: config.radii.R400,
  backgroundColor: color.SurfaceVariant.Container,
});

export const EmptyState = style({
  padding: `${config.space.S700} ${config.space.S400}`,
  color: color.Surface.OnContainer,
});

export const Footer = style({
  padding: config.space.S300,
  borderTop: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
});

export const ComposerFooter = style({
  flexShrink: 0,
  padding: config.space.S300,
  backgroundColor: color.Surface.Container,

  '@media': {
    [mobileBreakpoint]: {
      padding: config.space.S200,
    },
  },
});

export const ComposerForm = style({
  minWidth: 0,
  alignItems: 'End',
});

export const ComposerTextArea = style({
  minWidth: 0,
  minHeight: toRem(52),
  maxHeight: toRem(132),
  flexGrow: 1,
  fontSize: toRem(16),
  lineHeight: 1.45,

  '@media': {
    [mobileBreakpoint]: {
      minHeight: toRem(44),
      maxHeight: toRem(96),
    },
  },
});

export const ComposerSendButton = style({
  width: toRem(44),
  minWidth: toRem(44),
  height: toRem(44),
  padding: 0,
  flexShrink: 0,
});

export const ComposerError = style({
  color: color.Critical.Main,
});

export const ComposerHint = style({
  '@media': {
    [mobileBreakpoint]: {
      display: 'none',
    },
  },
});

export const IconBadge = style([
  DefaultReset,
  {
    width: toRem(28),
    height: toRem(28),
    borderRadius: config.radii.Pill,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: color.Primary.Main,
    backgroundColor: color.Primary.Container,
  },
]);
