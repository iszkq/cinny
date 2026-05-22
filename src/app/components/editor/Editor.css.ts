import { style } from '@vanilla-extract/css';
import { color, config, DefaultReset, toRem } from 'folds';

export const Editor = style([
  DefaultReset,
  {
    backgroundColor: color.SurfaceVariant.Container,
    color: color.SurfaceVariant.OnContainer,
    boxShadow: `inset 0 0 0 ${config.borderWidth.B300} ${color.SurfaceVariant.ContainerLine}`,
    borderRadius: config.radii.R400,
    overflow: 'hidden',
  },
]);

export const EditorOptions = style([
  DefaultReset,
  {
    padding: config.space.S200,
    minWidth: 0,
    '@media': {
      'screen and (max-width: 750px)': {
        padding: config.space.S100,
      },
    },
  },
]);

export const EditorMain = style([
  DefaultReset,
  {
    minWidth: 0,
    '@media': {
      'screen and (max-width: 750px)': {
        selectors: {
          'html[data-cinny-desktop-app="true"] &': {
            flexWrap: 'wrap',
          },
        },
      },
    },
  },
]);

export const EditorBeforeOptions = style({});

export const EditorAfterOptions = style({
  '@media': {
    'screen and (max-width: 750px)': {
      selectors: {
        'html[data-cinny-desktop-app="true"] &': {
          marginLeft: 'auto',
          justifyContent: 'flex-end',
        },
      },
    },
  },
});

export const EditorTextareaScroll = style({
  minWidth: 0,
  flexGrow: 1,
});

export const EditorTextarea = style([
  DefaultReset,
  {
    flexGrow: 1,
    height: '100%',
    padding: `${toRem(13)} ${toRem(1)}`,
    minWidth: 0,
    selectors: {
      [`${EditorTextareaScroll}:first-child &`]: {
        paddingLeft: toRem(13),
      },
      [`${EditorTextareaScroll}:last-child &`]: {
        paddingRight: toRem(13),
      },
      '&:focus': {
        outline: 'none',
      },
    },
    '@media': {
      'screen and (max-width: 750px)': {
        paddingTop: toRem(10),
        paddingBottom: toRem(10),
        selectors: {
          [`${EditorTextareaScroll}:first-child &`]: {
            paddingLeft: toRem(10),
          },
          [`${EditorTextareaScroll}:last-child &`]: {
            paddingRight: toRem(10),
          },
        },
      },
    },
  },
]);

export const EditorPlaceholderContainer = style([
  DefaultReset,
  {
    opacity: config.opacity.Placeholder,
    pointerEvents: 'none',
    userSelect: 'none',
  },
]);

export const EditorPlaceholderTextVisual = style([
  DefaultReset,
  {
    display: 'block',
    paddingTop: toRem(13),
    paddingLeft: toRem(1),
    '@media': {
      'screen and (max-width: 750px)': {
        paddingTop: toRem(10),
      },
    },
  },
]);

export const EditorToolbarBase = style({
  padding: `0 ${config.borderWidth.B300}`,
});

export const EditorToolbar = style({
  padding: config.space.S100,
});

export const MarkdownBtnBox = style({
  paddingRight: config.space.S100,
});
