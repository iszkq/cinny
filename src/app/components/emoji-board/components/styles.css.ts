import { style } from '@vanilla-extract/css';
import { toRem, color, config, DefaultReset, FocusOutline } from 'folds';

/**
 * Layout
 */

export const Base = style({
  maxWidth: toRem(432),
  width: `min(${toRem(432)}, calc(var(--app-width, 100vw) - 2 * ${config.space.S400}))`,
  height:
    `min(${toRem(450)}, calc(var(--app-height, 100dvh) - ${config.space.S400} - env(safe-area-inset-top) - env(safe-area-inset-bottom)))`,
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  borderRadius: config.radii.R400,
  boxShadow: config.shadow.E200,
  overflow: 'hidden',
  '@media': {
    'screen and (max-width: 750px)': {
      width: `calc(var(--app-width, 100vw) - 2 * ${config.space.S200})`,
      height:
        `min(${toRem(420)}, calc(var(--app-height, 100dvh) - ${config.space.S300} - env(safe-area-inset-top) - env(safe-area-inset-bottom)))`,
    },
  },
});

export const Header = style({
  padding: config.space.S300,
  paddingBottom: 0,
});

/**
 * Sidebar
 */

export const Sidebar = style({
  width: toRem(54),
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
  position: 'relative',
});

export const SidebarContent = style({
  padding: `${config.space.S200} 0`,
});

export const SidebarStack = style({
  width: '100%',
  backgroundColor: color.Surface.Container,
});

export const SidebarDivider = style({
  width: toRem(18),
});

export const SortablePackItem = style({
  position: 'relative',
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  selectors: {
    '&[draggable="true"]': {
      cursor: 'grab',
    },
    '&[data-dragging="true"]': {
      opacity: 0.45,
    },
    '&[data-drop-above="true"]::before': {
      content: '""',
      position: 'absolute',
      top: toRem(-3),
      left: config.space.S200,
      right: config.space.S200,
      height: toRem(3),
      borderRadius: config.radii.Pill,
      backgroundColor: color.Success.Main,
      boxShadow: `0 0 0 1px ${color.Surface.Container}`,
      pointerEvents: 'none',
    },
    '&[data-drop-below="true"]::after': {
      content: '""',
      position: 'absolute',
      bottom: toRem(-3),
      left: config.space.S200,
      right: config.space.S200,
      height: toRem(3),
      borderRadius: config.radii.Pill,
      backgroundColor: color.Success.Main,
      boxShadow: `0 0 0 1px ${color.Surface.Container}`,
      pointerEvents: 'none',
    },
  },
});

export const SidebarBtnImg = style({
  gridArea: '1 / 1',
  width: toRem(24),
  height: toRem(24),
  objectFit: 'contain',
  transition: 'opacity 120ms ease',
});

export const SidebarBtnFallback = style([
  DefaultReset,
  {
    gridArea: '1 / 1',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: toRem(24),
    height: toRem(24),
    borderRadius: config.radii.R200,
    backgroundColor: color.SurfaceVariant.Container,
    color: color.SurfaceVariant.OnContainer,
  },
]);

/**
 * Preview
 */

export const Preview = style({
  padding: config.space.S200,
  margin: config.space.S300,
  marginTop: 0,
  minHeight: toRem(40),

  borderRadius: config.radii.R400,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
});

export const MediaFrame = style({
  display: 'grid',
  placeItems: 'center',
});

export const MediaImgPending = style({
  opacity: 0,
});

export const MediaFallbackHidden = style({
  opacity: 0,
});

export const PreviewEmoji = style([
  DefaultReset,
  {
    width: toRem(32),
    height: toRem(32),
    fontSize: toRem(32),
    lineHeight: toRem(32),
  },
]);
export const PreviewImg = style([
  DefaultReset,
  {
    gridArea: '1 / 1',
    width: toRem(32),
    height: toRem(32),
    objectFit: 'contain',
    transition: 'opacity 120ms ease',
  },
]);

export const PreviewFallback = style([
  DefaultReset,
  {
    gridArea: '1 / 1',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: toRem(32),
    height: toRem(32),
    borderRadius: config.radii.R300,
    backgroundColor: color.Surface.Container,
    color: color.Surface.OnContainer,
  },
]);

/**
 * Group
 */

export const EmojiGroup = style({
  position: 'relative',
  padding: `${config.space.S300} 0`,
});

export const EmojiGroupLabel = style({
  position: 'sticky',
  top: config.space.S200,
  zIndex: 1,

  margin: 'auto',
  padding: `${config.space.S100} ${config.space.S200}`,
  borderRadius: config.radii.Pill,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
});

export const EmojiGroupContent = style([
  DefaultReset,
  {
    padding: `0 ${config.space.S200}`,
  },
]);

/**
 * Item
 */

export const EmojiItem = style([
  DefaultReset,
  FocusOutline,
  {
    width: toRem(48),
    height: toRem(48),
    fontSize: toRem(32),
    lineHeight: toRem(32),
    borderRadius: config.radii.R400,
    cursor: 'pointer',

    ':hover': {
      backgroundColor: color.Surface.ContainerHover,
    },
  },
]);

export const StickerItem = style([
  EmojiItem,
  {
    width: toRem(112),
    height: toRem(112),
  },
]);

export const CustomEmojiImg = style([
  DefaultReset,
  {
    gridArea: '1 / 1',
    width: toRem(32),
    height: toRem(32),
    objectFit: 'contain',
    transition: 'opacity 120ms ease',
  },
]);

export const CustomEmojiFallback = style([
  DefaultReset,
  {
    gridArea: '1 / 1',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: toRem(32),
    height: toRem(32),
    borderRadius: config.radii.R300,
    backgroundColor: color.SurfaceVariant.Container,
    color: color.SurfaceVariant.OnContainer,
  },
]);

export const StickerImg = style([
  DefaultReset,
  {
    gridArea: '1 / 1',
    width: toRem(96),
    height: toRem(96),
    objectFit: 'contain',
    transition: 'opacity 120ms ease',
  },
]);

export const StickerFallback = style([
  DefaultReset,
  {
    gridArea: '1 / 1',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: toRem(96),
    height: toRem(96),
    borderRadius: config.radii.R300,
    backgroundColor: color.SurfaceVariant.Container,
    color: color.SurfaceVariant.OnContainer,
  },
]);
