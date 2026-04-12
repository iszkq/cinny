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
  paddingTop: config.space.S100,
});

export const MessageReadReceiptsButton = style([
  DefaultReset,
  {
    display: 'inline-flex',
    alignItems: 'center',
    gap: config.space.S100,
    padding: `${toRem(2)} ${config.space.S100}`,
    borderRadius: '999px',
    color: color.Surface.OnContainer,
    opacity: config.opacity.P400,
    transition: 'opacity 140ms ease, background-color 140ms ease, transform 140ms ease',
    selectors: {
      '&:hover, &:focus-visible': {
        opacity: 1,
        backgroundColor: color.SurfaceVariant.Container,
      },
      '&:active': {
        transform: 'translateY(1px)',
      },
    },
  },
]);

export const MessageReadReceiptOverflow = style({
  fontWeight: 600,
});

export const MessageReadReceiptStack = style({
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
});

export const MessageReadReceiptAvatar = style({
  marginLeft: toRem(-5),
  border: `1.5px solid ${color.Surface.Container}`,
  borderRadius: '999px',
  overflow: 'hidden',
  selectors: {
    '&:first-child': {
      marginLeft: 0,
    },
  },
});
