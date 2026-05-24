import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const CategoryButton = style({
  flexGrow: 1,
  justifyContent: 'flex-start',
  minHeight: toRem(32),
  paddingInline: 0,
  background: 'transparent',
  border: 0,
  boxShadow: 'none',
  selectors: {
    '&:hover, &:focus-visible, &[aria-pressed=true]': {
      background: `color-mix(in srgb, ${color.Primary.Container} 18%, transparent)`,
      boxShadow: 'none',
    },
  },
});
export const CategoryButtonIcon = style({
  opacity: config.opacity.P400,
});
