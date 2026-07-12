import { style } from '@vanilla-extract/css';
import { DefaultReset, config } from 'folds';

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
