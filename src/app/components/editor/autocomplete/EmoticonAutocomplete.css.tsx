import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

export const Carousel = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S100,
    minWidth: 0,
  },
]);

export const CarouselTrack = style([
  DefaultReset,
  {
    display: 'flex',
    flexGrow: 1,
    gap: config.space.S100,
    minWidth: 0,
    overflowX: 'auto',
    overflowY: 'hidden',
    overscrollBehaviorX: 'contain',
    scrollBehavior: 'smooth',
    scrollSnapType: 'x proximity',
    scrollbarWidth: 'thin',
    touchAction: 'pan-x',
  },
]);

export const CarouselItem = style([
  DefaultReset,
  {
    flex: '0 0 9rem',
    minWidth: 0,
    scrollSnapAlign: 'start',
  },
]);

export const CarouselNav = style([
  DefaultReset,
  {
    flexShrink: 0,
  },
]);

export const EmptyState = style([
  DefaultReset,
  {
    minHeight: '3rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
]);

export const HoverPreview = style([
  DefaultReset,
  {
    position: 'fixed',
    zIndex: config.zIndex.Max,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: config.space.S100,
    width: toRem(160),
    maxWidth: `calc(100vw - ${toRem(24)})`,
    padding: config.space.S200,
    border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
    borderRadius: config.radii.R400,
    backgroundColor: color.Surface.Container,
    color: color.Surface.OnContainer,
    boxShadow: config.shadow.E200,
    pointerEvents: 'none',
  },
]);

export const HoverPreviewImage = style([
  DefaultReset,
  {
    display: 'block',
    width: toRem(144),
    height: toRem(144),
    objectFit: 'contain',
  },
]);

export const HoverPreviewUnicode = style([
  DefaultReset,
  {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: toRem(144),
    height: toRem(144),
    fontSize: toRem(96),
    lineHeight: 1,
  },
]);

export const HoverPreviewLabel = style([
  DefaultReset,
  {
    display: 'block',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: toRem(12),
    lineHeight: toRem(16),
  },
]);
