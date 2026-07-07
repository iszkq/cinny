import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

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
