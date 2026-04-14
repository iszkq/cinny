import { globalStyle, style } from '@vanilla-extract/css';
import { DefaultReset, color, config } from 'folds';

export const SpreadsheetViewer = style([
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

export const SpreadsheetViewerHeader = style([
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

export const SpreadsheetViewerBody = style([
  DefaultReset,
  {
    width: '100%',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
    background:
      'radial-gradient(circle at top, rgba(59, 130, 246, 0.08), transparent 32%), rgba(7, 10, 16, 0.98)',
    color: '#fff',
  },
]);

export const SpreadsheetViewerState = style([
  DefaultReset,
  {
    minHeight: '100%',
    padding: config.space.S600,
  },
]);

export const ErrorMessage = style([
  DefaultReset,
  {
    maxWidth: '560px',
    textAlign: 'center',
    wordBreak: 'break-word',
  },
]);

export const PasswordForm = style([
  DefaultReset,
  {
    width: 'min(100%, 520px)',
  },
]);

export const PasswordRow = style([
  DefaultReset,
  {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: config.space.S200,
    width: '100%',
    alignItems: 'center',
  },
]);

export const PasswordHint = style([
  DefaultReset,
  {
    textAlign: 'center',
    maxWidth: '560px',
    lineHeight: '1.45',
  },
]);

export const SheetRail = style([
  DefaultReset,
  {
    padding: `${config.space.S250} ${config.space.S300}`,
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    gap: config.space.S200,
    background: 'rgba(255, 255, 255, 0.03)',
  },
]);

export const SheetList = style([
  DefaultReset,
  {
    display: 'flex',
    gap: config.space.S150,
    overflowX: 'auto',
    paddingBottom: config.space.S100,
    scrollbarWidth: 'thin',
  },
]);

export const SheetSummary = style([
  DefaultReset,
  {
    display: 'block',
  },
]);

export const SpreadsheetStage = style([
  DefaultReset,
  {
    width: '100%',
    flex: 1,
    display: 'flex',
    position: 'relative',
    minHeight: 0,
    overflow: 'hidden',
    padding: config.space.S300,
  },
]);

export const SpreadsheetViewport = style([
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

export const SheetPreview = style([
  DefaultReset,
  {
    minWidth: '100%',
    minHeight: '100%',
    padding: config.space.S500,
  },
]);

export const SheetCanvasShell = style([
  DefaultReset,
  {
    width: 'fit-content',
    minWidth: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
    transition: 'transform 140ms ease',
  },
]);

export const EmptySheet = style([
  DefaultReset,
  {
    minHeight: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: config.space.S600,
    border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
    borderRadius: config.radii.R400,
    backgroundColor: color.Surface.Container,
  },
]);

export const Table = style([
  DefaultReset,
  {
    borderCollapse: 'collapse',
    width: 'max-content',
    minWidth: '100%',
    backgroundColor: color.Surface.Container,
    border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
    borderRadius: config.radii.R400,
    overflow: 'hidden',
    boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
  },
]);

export const Cell = style([
  DefaultReset,
  {
    minWidth: '40px',
    padding: `${config.space.S150} ${config.space.S200}`,
    border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
    verticalAlign: 'top',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    lineHeight: '1.45',
    backgroundColor: color.Surface.Container,
  },
]);

export const CellText = style([
  DefaultReset,
  {
    display: 'block',
    minHeight: '1.45em',
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

globalStyle(`${CellText} p`, {
  margin: 0,
});

globalStyle(`${CellText} span`, {
  font: 'inherit',
  color: 'inherit',
});
