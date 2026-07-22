import { style } from '@vanilla-extract/css';

export const Root = style({
  '@media': {
    'screen and (max-width: 750px)': {
      alignItems: 'flex-start',
      flexWrap: 'wrap',
    },
  },
});

export const Content = style({
  minWidth: 0,
  '@media': {
    'screen and (max-width: 750px)': {
      flexBasis: 'min(220px, calc(100% - 56px))',
    },
  },
});

export const After = style({
  maxWidth: '100%',
  '@media': {
    'screen and (max-width: 750px)': {
      marginLeft: 'auto',
    },
  },
});
