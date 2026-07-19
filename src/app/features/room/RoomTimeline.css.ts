import { RecipeVariants, recipe } from '@vanilla-extract/recipes';
import { DefaultReset, config, toRem } from 'folds';

export const TimelineFloat = recipe({
  base: [
    DefaultReset,
    {
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1,
      minWidth: 'max-content',
    },
  ],
  variants: {
    position: {
      Top: {
        top: config.space.S400,
      },
      Bottom: {
        bottom: config.space.S400,
      },
    },
  },
  defaultVariants: {
    position: 'Top',
  },
});

export type TimelineFloatVariants = RecipeVariants<typeof TimelineFloat>;

export const ImageGalleryGrid = recipe({
  base: [
    DefaultReset,
    {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: toRem(3),
      width: `min(${toRem(480)}, 100%)`,
      maxWidth: '100%',
    },
  ],
  variants: {
    mosaic: {
      true: {
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      },
    },
  },
});

export const ImageGalleryCell = recipe({
  base: [
    DefaultReset,
    {
      position: 'relative',
      minWidth: 0,
    },
  ],
  variants: {
    editing: {
      true: {
        gridColumn: '1 / -1',
      },
    },
  },
});
