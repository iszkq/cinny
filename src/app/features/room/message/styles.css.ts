import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

export const MessageBase = style({
  position: 'relative',
});
export const MessageBaseBubbleCollapsed = style({
  paddingTop: 0,
});

export const MessageOptionsBase = style([
  DefaultReset,
  {
    position: 'absolute',
    top: toRem(-30),
    right: 0,
    zIndex: 1,
  },
]);
export const MessageOptionsBar = style([
  DefaultReset,
  {
    padding: config.space.S100,
  },
]);

export const BubbleAvatarBase = style({
  paddingTop: 0,
});

export const MessageAvatar = style({
  cursor: 'pointer',
});

export const MessageQuickReaction = style({
  minWidth: toRem(32),
});

export const MessageMenuGroup = style({
  padding: config.space.S100,
});

export const MessageMenuItemText = style({
  flexGrow: 1,
});

export const ReactionsContainer = style({
  selectors: {
    '&:empty': {
      display: 'none',
    },
  },
});

export const ReactionsTooltipText = style({
  wordBreak: 'break-word',
});

export const MessageReadReceiptsRow = style({
  display: 'flex',
  justifyContent: 'flex-end',
  alignSelf: 'flex-end',
  maxWidth: '100%',
  paddingTop: config.space.S200,
});

export const MessageSendStatus = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  paddingTop: config.space.S200,
});

export const MessageReadReceiptsButton = style([
  DefaultReset,
  {
    display: 'inline-flex',
    alignItems: 'center',
    gap: config.space.S100,
    minHeight: toRem(28),
    padding: `0 ${config.space.S100}`,
    borderRadius: '999px',
    border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
    backgroundColor: color.SurfaceVariant.Container,
    color: color.Surface.OnContainer,
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
    transition:
      'background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease',
    selectors: {
      '&:hover, &:focus-visible': {
        backgroundColor: color.Surface.Container,
        borderColor: color.Surface.ContainerLine,
        boxShadow: '0 6px 16px rgba(15, 23, 42, 0.08)',
      },
      '&:active': {
        transform: 'translateY(1px)',
      },
    },
  },
]);

export const MessageReadReceiptsIcon = style({
  flexShrink: 0,
  opacity: config.opacity.P400,
});

export const MessageReadReceiptOverflow = style({
  fontWeight: 600,
  lineHeight: 1,
});

export const MessageReadReceiptStack = style({
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
  paddingLeft: config.space.S100,
});

export const MessageReadReceiptAvatar = style({
  marginLeft: toRem(-6),
  border: `2px solid ${color.Surface.Container}`,
  borderRadius: '999px',
  boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.04)',
  overflow: 'hidden',
  selectors: {
    '&:first-child': {
      marginLeft: 0,
    },
  },
});
