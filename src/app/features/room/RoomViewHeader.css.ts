import { style } from '@vanilla-extract/css';
import { config } from 'folds';

export const HeaderTopic = style({
  opacity: config.opacity.P400,
  ':hover': {
    cursor: 'pointer',
    opacity: config.opacity.P500,
    textDecoration: 'underline',
  },
});
