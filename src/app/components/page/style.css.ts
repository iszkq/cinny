import { style } from '@vanilla-extract/css';
import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';
import {
  CONTENT_BG_VAR,
  PAGE_HEADER_BG_VAR,
  PAGE_NAV_BG_VAR,
  PAGE_NAV_BORDER_VAR,
} from '../../theme/appearance';

export const PageSurface = style({
  background: `var(${CONTENT_BG_VAR}, ${color.Surface.Container})`,
});

export const PageNav = recipe({
  base: {
    minHeight: 0,
    background: `var(${PAGE_NAV_BG_VAR}, rgba(244, 247, 244, 0.92))`,
    borderRight: `1px solid var(${PAGE_NAV_BORDER_VAR}, rgba(114, 131, 120, 0.10))`,
  },
  variants: {
    size: {
      '400': {
        width: toRem(256),
      },
      '300': {
        width: toRem(222),
      },
    },
  },
  defaultVariants: {
    size: '400',
  },
});
export type PageNavVariants = RecipeVariants<typeof PageNav>;

export const PageNavResizeHandle = style({
  position: 'absolute',
  top: 0,
  right: toRem(-4),
  width: toRem(8),
  height: '100%',
  cursor: 'col-resize',
  touchAction: 'none',
  userSelect: 'none',
  zIndex: 1,
});

export const PageNavResizeHandleLine = style({
  position: 'absolute',
  top: 0,
  right: toRem(3),
  width: 1,
  height: '100%',
  backgroundColor: color.Background.ContainerLine,
  opacity: 0,
  transition: 'opacity 120ms ease',
  selectors: {
    [`${PageNavResizeHandle}:hover &, ${PageNavResizeHandle}[data-active=true] &`]: {
      opacity: 1,
    },
  },
});

export const PageNavHeader = recipe({
  base: {
    padding: `0 ${config.space.S200} 0 ${config.space.S300}`,
    flexShrink: 0,
    minWidth: 0,
    background: `var(${PAGE_NAV_BG_VAR}, rgba(244, 247, 244, 0.92))`,
    borderColor: `var(${PAGE_NAV_BORDER_VAR}, ${color.Background.ContainerLine})`,
    '@media': {
      'screen and (max-width: 1124px)': {
        paddingLeft: `max(${config.space.S200}, env(safe-area-inset-left))`,
        paddingRight: `max(${config.space.S200}, env(safe-area-inset-right))`,
      },
    },
    selectors: {
      'button&': {
        cursor: 'pointer',
      },
      'button&[aria-pressed=true]': {
        backgroundColor: color.Background.ContainerActive,
      },
      'button&:hover, button&:focus-visible': {
        backgroundColor: color.Background.ContainerHover,
      },
      'button&:active': {
        backgroundColor: color.Background.ContainerActive,
      },
    },
  },

  variants: {
    outlined: {
      true: {
        borderBottomWidth: 1,
      },
    },
  },
  defaultVariants: {
    outlined: true,
  },
});
export type PageNavHeaderVariants = RecipeVariants<typeof PageNavHeader>;

export const PageNavContent = style({
  minHeight: '100%',
  padding: config.space.S200,
  paddingRight: config.space.S100,
  paddingBottom: config.space.S700,
  '@media': {
    'screen and (max-width: 1124px)': {
      padding: config.space.S100,
      paddingRight: 0,
      paddingBottom: `calc(${config.space.S400} + env(safe-area-inset-bottom))`,
    },
    'screen and (max-width: 750px)': {
      paddingBottom: `max(${config.space.S200}, env(safe-area-inset-bottom))`,
    },
  },
});

export const PageHeader = recipe({
  base: {
    paddingLeft: `max(${config.space.S400}, env(safe-area-inset-left))`,
    paddingRight: `max(${config.space.S200}, env(safe-area-inset-right))`,
    minWidth: 0,
    background: `var(${PAGE_HEADER_BG_VAR}, rgba(250, 252, 250, 0.94))`,
    borderColor: `var(${PAGE_NAV_BORDER_VAR}, ${color.Background.ContainerLine})`,
    '@media': {
      'screen and (max-width: 1124px)': {
        paddingLeft: `max(${config.space.S200}, env(safe-area-inset-left))`,
        paddingRight: `max(${config.space.S200}, env(safe-area-inset-right))`,
      },
    },
  },
  variants: {
    balance: {
      true: {
        paddingLeft: `max(${config.space.S200}, env(safe-area-inset-left))`,
      },
    },
    outlined: {
      true: {
        borderBottomWidth: config.borderWidth.B300,
      },
    },
  },
  defaultVariants: {
    outlined: true,
  },
});
export type PageHeaderVariants = RecipeVariants<typeof PageHeader>;

export const PageContent = style([
  DefaultReset,
  {
    paddingTop: config.space.S400,
    paddingLeft: `max(${config.space.S400}, env(safe-area-inset-left))`,
    paddingRight: `max(${config.space.S200}, env(safe-area-inset-right))`,
    paddingBottom: `max(${toRem(100)}, env(safe-area-inset-bottom))`,
    '@media': {
      'screen and (max-width: 1124px)': {
        paddingTop: config.space.S300,
        paddingLeft: `max(${config.space.S200}, env(safe-area-inset-left))`,
        paddingRight: `max(${config.space.S200}, env(safe-area-inset-right))`,
        paddingBottom: `max(${config.space.S700}, env(safe-area-inset-bottom))`,
      },
      'screen and (max-width: 750px)': {
        paddingTop: config.space.S200,
        paddingBottom: `max(${config.space.S300}, env(safe-area-inset-bottom))`,
      },
    },
  },
]);

export const PageHeroEmpty = style([
  DefaultReset,
  {
    padding: config.space.S400,
    borderRadius: config.radii.R400,
    minHeight: toRem(450),
    '@media': {
      'screen and (max-width: 1124px)': {
        minHeight: toRem(320),
      },
    },
  },
]);

export const PageHeroSection = style([
  DefaultReset,
  {
    padding: '40px 0',
    maxWidth: toRem(466),
    width: '100%',
    margin: 'auto',
    '@media': {
      'screen and (max-width: 1124px)': {
        padding: '24px 0',
      },
    },
  },
]);

export const PageContentCenter = style([
  DefaultReset,
  {
    maxWidth: toRem(964),
    width: '100%',
    margin: 'auto',
  },
]);
