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

export const DocxViewerBody = style([
  DefaultReset,
  {
    minHeight: 0,
    backgroundColor: color.Background.Container,
    color: color.Background.OnContainer,
    overflow: 'hidden',
  },
]);

export const DocxViewerState = style([
  DefaultReset,
  {
    width: 'min(100%, 560px)',
    margin: 'auto',
    padding: config.space.S600,
    borderRadius: config.radii.R400,
    backgroundColor: color.Surface.Container,
    border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  },
]);

export const DocxViewerStage = style([
  DefaultReset,
  {
    position: 'relative',
    minHeight: 0,
    overflow: 'hidden',
    padding: config.space.S300,
  },
]);

export const DocxViewerViewport = style([
  DefaultReset,
  {
    width: '100%',
    height: '100%',
    minHeight: 0,
    borderRadius: config.radii.R400,
    backgroundColor: color.Background.Container,
  },
]);

export const DocxViewport = style([
  DefaultReset,
  {
    minHeight: '100%',
    padding: `${config.space.S400} ${config.space.S300}`,
  },
]);

export const DocxCanvasShell = style([
  DefaultReset,
  {
    width: 'fit-content',
    minWidth: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
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
  marginBottom: config.space.S400,
  boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
});

globalStyle(`${DocxContainer} .docx`, {
  maxWidth: '100%',
});

globalStyle(`${DocxContainer} .cinny-docx-fallback`, {
  maxWidth: '900px',
  marginLeft: 'auto',
  marginRight: 'auto',
  padding: `${config.space.S500} ${config.space.S600}`,
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  borderRadius: config.radii.R400,
  boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
});

globalStyle(`${DocxContainer} .cinny-docx-fallback > *:first-child`, {
  marginTop: 0,
});

globalStyle(`${DocxContainer} .cinny-docx-fallback > *:last-child`, {
  marginBottom: 0,
});

globalStyle(`${DocxContainer} .cinny-docx-fallback table`, {
  width: '100%',
  borderCollapse: 'collapse',
  marginBottom: config.space.S400,
});

globalStyle(`${DocxContainer} .cinny-docx-fallback th, ${DocxContainer} .cinny-docx-fallback td`, {
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  padding: `${config.space.S100} ${config.space.S200}`,
  verticalAlign: 'top',
});
