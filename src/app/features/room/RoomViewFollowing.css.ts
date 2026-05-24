import { style } from '@vanilla-extract/css';
import { recipe } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';

export const RoomViewFollowingPlaceholder = style([
  DefaultReset,
  {
    height: toRem(28),
  },
]);

export const RoomViewFollowing = recipe({
  base: [
    DefaultReset,
    {
      minHeight: toRem(28),
      padding: `0 ${config.space.S400}`,
      width: '100%',
      backgroundColor: 'transparent',
      color: color.Surface.OnContainer,
      outline: 'none',
    },
  ],
  variants: {
    clickable: {
      true: {
        cursor: 'pointer',
        selectors: {
          '&:hover, &:focus-visible': {
            color: color.Primary.Main,
          },
          '&:active': {
            color: color.Primary.Main,
          },
        },
      },
    },
  },
});

export const ReadersSummary = style([
  DefaultReset,
  {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
  },
]);

export const ReaderOverflow = style([
  DefaultReset,
  {
    fontWeight: 600,
    opacity: config.opacity.P400,
  },
]);

export const ReaderAvatarStack = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'center',
    paddingLeft: config.space.S100,
  },
]);

export const ReaderAvatar = style([
  DefaultReset,
  {
    marginLeft: toRem(-6),
    border: '2px solid rgba(255, 255, 255, 0.7)',
    borderRadius: '999px',
    boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.04)',
    overflow: 'hidden',
    selectors: {
      '&:first-child': {
        marginLeft: 0,
      },
    },
  },
]);
