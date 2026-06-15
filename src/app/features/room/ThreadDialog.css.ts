import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

export const Dialog = style({
  width: 'calc(100vw - 32px)',
  maxWidth: toRem(760),
  maxHeight: 'calc(100vh - 48px)',
  overflow: 'hidden',
});

export const Shell = style({
  maxHeight: 'calc(100vh - 48px)',
  minHeight: 0,
});

export const Header = style({
  padding: config.space.S400,
  paddingBottom: config.space.S300,
});

export const RootPanel = style({
  padding: config.space.S400,
  backgroundColor: color.SurfaceVariant.Container,
  borderTop: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  borderBottom: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
});

export const RootMessage = style({
  minWidth: 0,
  paddingLeft: config.space.S300,
  borderLeft: `${toRem(3)} solid ${color.Primary.Main}`,
});

export const Content = style({
  padding: config.space.S400,
  paddingRight: config.space.S300,
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
