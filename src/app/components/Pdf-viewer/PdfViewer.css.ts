import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config } from 'folds';

export const PdfViewer = style([
  DefaultReset,
  {
    width: '100%',
    height: '100%',
    minHeight: 0,
    borderRadius: config.radii.R500,
    overflow: 'hidden',
    backgroundColor: 'rgba(7, 10, 16, 0.96)',
    color: '#fff',
    boxShadow: '0 28px 80px rgba(7, 10, 16, 0.4)',
  },
]);

export const PdfViewerHeader = style([
  DefaultReset,
  {
    paddingLeft: config.space.S300,
    paddingRight: config.space.S300,
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(255, 255, 255, 0.03)',
    flexShrink: 0,
    gap: config.space.S200,
  },
]);

export const PdfViewerBody = style([
  DefaultReset,
  {
    width: '100%',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
    padding: config.space.S300,
    background:
      'radial-gradient(circle at top, rgba(59, 130, 246, 0.08), transparent 32%), rgba(7, 10, 16, 0.98)',
  },
]);

export const PdfViewerStage = style([
  DefaultReset,
  {
    width: '100%',
    flex: 1,
    display: 'flex',
    position: 'relative',
    minHeight: 0,
    overflow: 'hidden',
  },
]);

export const PdfViewerViewport = style([
  DefaultReset,
  {
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: 0,
    borderRadius: config.radii.R400,
    background: 'rgba(255, 255, 255, 0.03)',
  },
]);

export const PdfViewerCanvasShell = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '100%',
    minHeight: '100%',
    padding: config.space.S500,
  },
]);

export const PdfViewerContent = style([
  DefaultReset,
  {
    margin: 'auto',
    display: 'inline-block',
    backgroundColor: color.Surface.Container,
    color: color.Surface.OnContainer,
    boxShadow: '0 24px 48px rgba(15, 23, 42, 0.28)',
  },
]);

export const NavButton = style([
  DefaultReset,
  {
    position: 'absolute',
    top: '50%',
    zIndex: 2,
    transform: 'translateY(-50%)',
    background: 'rgba(15, 23, 42, 0.72)',
    color: '#fff',
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
  },
]);

export const NavButtonLeft = style({
  left: config.space.S300,
});

export const NavButtonRight = style({
  right: config.space.S300,
});
