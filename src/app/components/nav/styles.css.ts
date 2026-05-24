import { ComplexStyleRule, createVar, style } from '@vanilla-extract/css';
import { RecipeVariants, recipe } from '@vanilla-extract/recipes';
import { ContainerColor, DefaultReset, Disabled, RadiiVariant, color, config, toRem } from 'folds';

export const NavCategory = style([
  DefaultReset,
  {
    position: 'relative',
  },
]);

export const NavCategoryHeader = style({
  gap: config.space.S100,
  background: 'transparent',
  boxShadow: 'none',
});

export const NavLink = style({
  color: 'inherit',
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  flexGrow: 1,
  ':hover': {
    textDecoration: 'unset',
  },
  ':focus': {
    outline: 'none',
  },
});

const Container = createVar();
const ContainerHover = createVar();
const ContainerActive = createVar();
const ContainerLine = createVar();
const OnContainer = createVar();
const ItemSurface = createVar();
const ItemSurfaceHover = createVar();
const ItemSurfaceActive = createVar();
const ItemSurfaceLine = createVar();
const ItemSurfaceGlow = createVar();

const getVariant = (variant: ContainerColor): ComplexStyleRule => ({
  vars: {
    [Container]: color[variant].Container,
    [ContainerHover]: color[variant].ContainerHover,
    [ContainerActive]: color[variant].ContainerActive,
    [ContainerLine]: color[variant].ContainerLine,
    [OnContainer]: color[variant].OnContainer,
    [ItemSurface]: 'transparent',
    [ItemSurfaceHover]: `color-mix(in srgb, ${color.Primary.Container} 18%, transparent)`,
    [ItemSurfaceActive]: `color-mix(in srgb, ${color.Primary.Container} 56%, transparent)`,
    [ItemSurfaceLine]: `color-mix(in srgb, ${color.Primary.Main} 30%, transparent)`,
    [ItemSurfaceGlow]: `0 10px 24px color-mix(in srgb, ${color.Other.Shadow} 18%, transparent)`,
  },
});

const NavItemBase = style({
  width: '100%',
  display: 'flex',
  justifyContent: 'start',
  cursor: 'pointer',
  position: 'relative',
  overflow: 'hidden',
  backgroundColor: ItemSurface,
  color: OnContainer,
  outline: 'none',
  minHeight: toRem(40),
  marginBottom: config.space.S100,
  border: `${config.borderWidth.B300} solid transparent`,
  transition:
    'background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease',

  selectors: {
    '&::after': {
      content: '',
      position: 'absolute',
      left: toRem(8),
      top: toRem(8),
      bottom: toRem(8),
      width: toRem(3),
      borderRadius: toRem(999),
      background: color.Primary.Main,
      opacity: 0,
      transform: 'scaleY(0.72)',
      transition: 'opacity 160ms ease, transform 160ms ease',
    },
    '&:hover, &:focus-visible': {
      backgroundColor: ItemSurfaceHover,
      borderColor: `color-mix(in srgb, ${color.Primary.Main} 12%, transparent)`,
      boxShadow: 'none',
    },
    '&[data-hover=true]': {
      backgroundColor: ItemSurfaceHover,
      borderColor: `color-mix(in srgb, ${color.Primary.Main} 12%, transparent)`,
      boxShadow: 'none',
    },
    [`&:has(.${NavLink}:active)`]: {
      backgroundColor: ItemSurfaceActive,
    },
    '&[aria-selected=true]': {
      backgroundColor: ItemSurfaceActive,
      borderColor: ItemSurfaceLine,
      boxShadow: `${ItemSurfaceGlow}, inset 0 1px 0 color-mix(in srgb, ${color.Primary.OnContainer} 16%, transparent)`,
      transform: 'translateY(-1px)',
    },
    '&[aria-selected=true]::after': {
      opacity: 1,
      transform: 'scaleY(1)',
    },
    [`&:has(.${NavLink}:focus-visible)`]: {
      outline: `${config.borderWidth.B600} solid ${ContainerLine}`,
      outlineOffset: `calc(-1 * ${config.borderWidth.B600})`,
    },
  },
  '@supports': {
    [`not selector(:has(.${NavLink}:focus-visible))`]: {
      ':focus-within': {
        outline: `${config.borderWidth.B600} solid ${ContainerLine}`,
        outlineOffset: `calc(-1 * ${config.borderWidth.B600})`,
      },
    },
  },
});
export const NavItem = recipe({
  base: [DefaultReset, NavItemBase, Disabled],
  variants: {
    variant: {
      Background: getVariant('Background'),
      Surface: getVariant('Surface'),
      SurfaceVariant: getVariant('SurfaceVariant'),
      Primary: getVariant('Primary'),
      Secondary: getVariant('Secondary'),
      Success: getVariant('Success'),
      Warning: getVariant('Warning'),
      Critical: getVariant('Critical'),
    },
    radii: RadiiVariant,
  },
  defaultVariants: {
    variant: 'Surface',
    radii: '400',
  },
});

export type RoomSelectorVariants = RecipeVariants<typeof NavItem>;
export const NavItemContent = style({
  paddingLeft: config.space.S300,
  paddingRight: config.space.S250,
  height: 'inherit',
  minWidth: 0,
  flexGrow: 1,
  display: 'flex',
  alignItems: 'center',
  fontWeight: config.fontWeight.W500,
  borderRadius: config.radii.R400,

  selectors: {
    '&:hover': {
      textDecoration: 'unset',
    },
    [`.${NavItemBase}[data-highlight=true] &`]: {
      fontWeight: config.fontWeight.W600,
    },
  },
});

export const NavItemOptions = style({
  paddingRight: config.space.S150,
});
