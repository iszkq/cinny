import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const CategoryButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: config.space.S100,
  flexGrow: 1,
  width: '100%',
  justifyContent: 'flex-start',
  minHeight: toRem(32),
  paddingBlock: 0,
  paddingInline: 0,
  background: 'transparent',
  border: 0,
  boxShadow: 'none',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
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
