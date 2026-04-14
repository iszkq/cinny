import { globalStyle, style } from '@vanilla-extract/css';
import { DefaultReset, color, config } from 'folds';

export const DocxViewer = style([
  DefaultReset,
  {
    height: '100%',
  },
]);

export const DocxViewerHeader = style([
  DefaultReset,
  {
    paddingLeft: config.space.S200,
    paddingRight: config.space.S200,
    borderBottomWidth: config.borderWidth.B300,
    flexShrink: 0,
    gap: config.space.S200,
  },
]);

export const DocxViewerContent = style([
  DefaultReset,
  {
    background:
      'radial-gradient(circle at top, rgba(59, 130, 246, 0.08), transparent 28%), rgba(226, 232, 240, 0.92)',
    color: color.Background.OnContainer,
    overflow: 'hidden',
  },
]);

export const DocxViewerState = style([
  DefaultReset,
  {
    minHeight: '100%',
    padding: config.space.S600,
  },
]);

export const DocxViewport = style([
  DefaultReset,
  {
    minHeight: '100%',
    padding: `${config.space.S500} ${config.space.S400}`,
  },
]);

export const DocxContainer = style([
  DefaultReset,
  {
    minHeight: '100%',
  },
]);

globalStyle(`${DocxContainer} .docx-wrapper`, {
  padding: 0,
  background: 'transparent',
});

globalStyle(`${DocxContainer} .docx-wrapper > .docx`, {
  marginLeft: 'auto',
  marginRight: 'auto',
  boxShadow: '0 24px 48px rgba(15, 23, 42, 0.14)',
});

globalStyle(`${DocxContainer} .docx`, {
  maxWidth: '100%',
});
