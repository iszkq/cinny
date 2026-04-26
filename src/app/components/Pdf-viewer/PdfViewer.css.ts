import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config } from 'folds';

export const PdfViewer = style([
  DefaultReset,
  {
    height: '100%',
  },
]);

export const PdfViewerHeader = style([
  DefaultReset,
  {
    paddingLeft: config.space.S200,
    paddingRight: config.space.S200,
    borderBottomWidth: config.borderWidth.B300,
    flexShrink: 0,
    gap: config.space.S200,
  },
]);

export const PdfViewerBody = style([
  DefaultReset,
  {
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: color.Background.Container,
    color: color.Background.OnContainer,
  },
]);

export const PdfViewerState = style([
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

export const PdfViewerStage = style([
  DefaultReset,
  {
    position: 'relative',
    minHeight: 0,
    overflow: 'hidden',
    padding: config.space.S300,
  },
]);

export const PdfViewerViewport = style([
  DefaultReset,
  {
    width: '100%',
    height: '100%',
    minHeight: 0,
    borderRadius: config.radii.R400,
    backgroundColor: color.Background.Container,
  },
]);

export const PdfViewerCanvasShell = style([
  DefaultReset,
  {
    minWidth: '100%',
    minHeight: '100%',
    padding: config.space.S400,
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'none',
  },
]);

export const PdfViewerContent = style([
  DefaultReset,
  {
    margin: 'auto',
    display: 'inline-block',
    backgroundColor: color.Surface.Container,
    color: color.Surface.OnContainer,
    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
  },
]);

export const NavButton = style([
  DefaultReset,
  {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 1,
    boxShadow: '0 12px 24px rgba(15, 23, 42, 0.12)',
    selectors: {
      '&:disabled': {
        opacity: 0.45,
        boxShadow: 'none',
      },
    },
  },
]);

export const NavButtonLeft = style({
  left: config.space.S400,
});

export const NavButtonRight = style({
  right: config.space.S400,
});
