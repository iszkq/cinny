import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config } from 'folds';

export const EventReaders = style([
  DefaultReset,
  {
    height: '100%',
  },
]);

export const Header = style({
  paddingLeft: config.space.S400,
  paddingRight: config.space.S300,

  flexShrink: 0,
});

export const Content = style({
  paddingLeft: config.space.S200,
  paddingBottom: config.space.S400,
});

export const ReaderMeta = style({
  minWidth: 0,
  paddingTop: config.space.S100,
  paddingBottom: config.space.S100,
});

export const ReaderTime = style({
  fontSize: '0.875rem',
});

export const ReaderItem = style({
  borderBottom: `1px dashed ${color.SurfaceVariant.ContainerLine}`,
  selectors: {
    '&:last-child': {
      borderBottom: 'none',
    },
  },
});
