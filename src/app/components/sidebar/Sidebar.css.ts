import { createVar, style } from '@vanilla-extract/css';
import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { color, config, DefaultReset, Disabled, FocusOutline, toRem } from 'folds';
import { ContainerColor } from '../../styles/ContainerColor.css';
import { NAV_RAIL_BG_VAR, NAV_RAIL_BORDER_VAR } from '../../theme/appearance';

export const Sidebar = style([
  DefaultReset,
  {
    width: toRem(76),
    paddingTop: config.space.S200,
    paddingBottom: config.space.S200,
    background: `var(${NAV_RAIL_BG_VAR}, linear-gradient(180deg, rgba(223, 233, 225, 0.94) 0%, rgba(211, 224, 214, 0.94) 100%))`,
    borderRight: `${config.borderWidth.B300} solid var(${NAV_RAIL_BORDER_VAR}, rgba(115, 133, 121, 0.12))`,

    display: 'flex',
    flexDirection: 'column',
    color: color.Background.OnContainer,
    boxShadow: 'inset -1px 0 0 rgba(255, 255, 255, 0.12)',
    backdropFilter: 'blur(18px) saturate(155%)',
    WebkitBackdropFilter: 'blur(18px) saturate(155%)',
  },
]);

export const SidebarStack = style([
  DefaultReset,
  {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: config.space.S250,
    padding: `${config.space.S200} 0`,
  },
]);

const DropLineDist = createVar();
export const DropTarget = style({
  vars: {
    [DropLineDist]: toRem(-8),
  },

  selectors: {
    '&[data-inside-folder=true]': {
      vars: {
        [DropLineDist]: toRem(-6),
      },
    },
    '&[data-drop-child=true]': {
      outline: `${config.borderWidth.B700} solid ${color.Success.Main}`,
      borderRadius: config.radii.R400,
    },
    '&[data-drop-above=true]::after, &[data-drop-below=true]::after': {
      content: '',
      display: 'block',
      position: 'absolute',
      left: toRem(0),
      width: '100%',
      height: config.borderWidth.B700,
      backgroundColor: color.Success.Main,
    },
    '&[data-drop-above=true]::after': {
      top: DropLineDist,
    },
    '&[data-drop-below=true]::after': {
      bottom: DropLineDist,
    },
  },
});

const PUSH_X = 2;
export const SidebarItem = recipe({
  base: [
    DefaultReset,
    {
      minWidth: toRem(46),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      transition: 'transform 180ms cubic-bezier(0, 0.8, 0.67, 0.97)',

      selectors: {
        '&:hover': {
          transform: `translateX(${toRem(1)})`,
        },
        '&::before': {
          content: '',
          display: 'none',
          position: 'absolute',
          left: toRem(-11.5 - PUSH_X),
          width: toRem(3 + PUSH_X),
          height: toRem(16),
          borderRadius: `0 ${toRem(4)} ${toRem(4)} 0`,
          background: 'CurrentColor',
          transition: 'height 200ms linear',
        },
        '&:hover::before': {
          display: 'block',
          width: toRem(3),
        },
      },
    },
    Disabled,
    DropTarget,
  ],
  variants: {
    active: {
      true: {
        selectors: {
          '&::before': {
            display: 'block',
            height: toRem(24),
          },
          '&:hover::before': {
            width: toRem(3 + PUSH_X),
          },
        },
      },
    },
  },
});
export type SidebarItemVariants = RecipeVariants<typeof SidebarItem>;

export const SidebarItemBadge = recipe({
  base: [
    DefaultReset,
    {
      pointerEvents: 'none',
      position: 'absolute',
      zIndex: 1,
      lineHeight: 0,
    },
  ],
  variants: {
    hasCount: {
      true: {
        top: toRem(-6),
        left: toRem(-6),
      },
      false: {
        top: toRem(-2),
        left: toRem(-2),
      },
    },
  },
  defaultVariants: {
    hasCount: false,
  },
});
export type SidebarItemBadgeVariants = RecipeVariants<typeof SidebarItemBadge>;

export const SidebarAvatar = recipe({
  base: [
    {
      overflow: 'hidden',
      background: `color-mix(in srgb, ${color.Surface.Container} 62%, transparent)`,
      border: `${config.borderWidth.B300} solid color-mix(in srgb, ${color.SurfaceVariant.ContainerLine} 44%, transparent)`,
      boxShadow:
        '0 8px 18px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.18)',
      backdropFilter: 'blur(14px) saturate(150%)',
      WebkitBackdropFilter: 'blur(14px) saturate(150%)',
      transition:
        'transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease',
      selectors: {
        'button&': {
          cursor: 'pointer',
        },
        'button&:hover, button&:focus-visible': {
          borderColor: `color-mix(in srgb, ${color.Primary.Main} 24%, ${color.SurfaceVariant.ContainerLine} 76%)`,
          boxShadow:
            '0 10px 22px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.22)',
          transform: 'translateY(-1px)',
        },
      },
    },
  ],
  variants: {
    size: {
      '200': {
        width: toRem(16),
        height: toRem(16),
        fontSize: toRem(10),
        lineHeight: config.lineHeight.T200,
        letterSpacing: config.letterSpacing.T200,
      },
      '300': {
        width: toRem(38),
        height: toRem(38),
      },
      '400': {
        width: toRem(46),
        height: toRem(46),
      },
    },
    outlined: {
      true: {
        borderColor: `color-mix(in srgb, ${color.Primary.Main} 22%, ${color.SurfaceVariant.ContainerLine} 78%)`,
        boxShadow:
          '0 10px 22px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
      },
    },
  },
  defaultVariants: {
    size: '400',
  },
});
export type SidebarAvatarVariants = RecipeVariants<typeof SidebarAvatar>;

export const SidebarFolder = recipe({
  base: [
    ContainerColor({ variant: 'Background' }),
    {
      padding: config.space.S100,
      width: toRem(42),
      minHeight: toRem(42),
      display: 'flex',
      flexWrap: 'wrap',
      background: `color-mix(in srgb, ${color.Surface.Container} 58%, transparent)`,
      outline: `${config.borderWidth.B300} solid color-mix(in srgb, ${color.SurfaceVariant.ContainerLine} 44%, transparent)`,
      boxShadow:
        '0 8px 18px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.16)',
      backdropFilter: 'blur(14px) saturate(150%)',
      WebkitBackdropFilter: 'blur(14px) saturate(150%)',
      position: 'relative',
      transition:
        'transform 160ms ease, outline-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease',

      selectors: {
        'button&': {
          cursor: 'pointer',
        },
        'button&:hover, button&:focus-visible': {
          outlineColor: `color-mix(in srgb, ${color.Primary.Main} 22%, ${color.SurfaceVariant.ContainerLine} 78%)`,
          boxShadow:
            '0 10px 22px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
          transform: 'translateY(-1px)',
        },
      },
    },
    FocusOutline,
    DropTarget,
  ],
  variants: {
    state: {
      Close: {
        gap: toRem(2),
        borderRadius: config.radii.R400,
      },
      Open: {
        paddingLeft: 0,
        paddingRight: 0,
        flexDirection: 'column',
        alignItems: 'center',
        gap: config.space.S200,
        borderRadius: config.radii.R500,
      },
    },
  },
  defaultVariants: {
    state: 'Close',
  },
});
export type SidebarFolderVariants = RecipeVariants<typeof SidebarFolder>;

export const SidebarFolderDropTarget = recipe({
  base: {
    width: '100%',
    height: toRem(8),
    position: 'absolute',
    left: 0,
  },
  variants: {
    position: {
      Top: {
        top: toRem(-4),
      },
      Bottom: {
        bottom: toRem(-4),
      },
    },
  },
});
export type SidebarFolderDropTargetVariants = RecipeVariants<typeof SidebarFolderDropTarget>;
