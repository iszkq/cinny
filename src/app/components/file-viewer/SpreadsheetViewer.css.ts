import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config } from 'folds';

export const SpreadsheetViewer = style([
  DefaultReset,
  {
    height: '100%',
  },
]);

export const SpreadsheetViewerHeader = style([
  DefaultReset,
  {
    paddingLeft: config.space.S200,
    paddingRight: config.space.S200,
    borderBottomWidth: config.borderWidth.B300,
    flexShrink: 0,
    gap: config.space.S200,
  },
]);

export const SpreadsheetViewerContent = style([
  DefaultReset,
  {
    overflow: 'hidden',
    backgroundColor: color.Background.Container,
    color: color.Background.OnContainer,
  },
]);

export const SpreadsheetViewerState = style([
  DefaultReset,
  {
    minHeight: '100%',
    padding: config.space.S600,
  },
]);

export const SheetRail = style([
  DefaultReset,
  {
    padding: `${config.space.S250} ${config.space.S300}`,
    borderBottomWidth: config.borderWidth.B300,
    gap: config.space.S200,
    background: 'rgba(241, 245, 249, 0.92)',
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

export const TableWrapper = style([
  DefaultReset,
  {
    display: 'inline-block',
    minWidth: '100%',
    padding: config.space.S300,
  },
]);

export const Table = style([
  DefaultReset,
  {
    borderCollapse: 'separate',
    borderSpacing: 0,
    minWidth: '100%',
    width: 'max-content',
    backgroundColor: color.Surface.Container,
    border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
    borderRadius: config.radii.R400,
    overflow: 'hidden',
  },
]);

const sharedCell = {
  padding: `${config.space.S150} ${config.space.S200}`,
  borderRight: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  borderBottom: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  maxWidth: '320px',
  minWidth: '120px',
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-word' as const,
  verticalAlign: 'top' as const,
};

export const CornerCell = style([
  DefaultReset,
  {
    ...sharedCell,
    position: 'sticky',
    top: 0,
    left: 0,
    zIndex: 3,
    minWidth: '56px',
    maxWidth: '56px',
    width: '56px',
    textAlign: 'center',
    backgroundColor: 'rgba(241, 245, 249, 0.96)',
    fontWeight: 600,
  },
]);

export const HeadCell = style([
  DefaultReset,
  {
    ...sharedCell,
    position: 'sticky',
    top: 0,
    zIndex: 2,
    backgroundColor: 'rgba(241, 245, 249, 0.96)',
    fontWeight: 600,
  },
]);

export const IndexCell = style([
  DefaultReset,
  {
    ...sharedCell,
    position: 'sticky',
    left: 0,
    zIndex: 1,
    minWidth: '56px',
    maxWidth: '56px',
    width: '56px',
    textAlign: 'center',
    backgroundColor: 'rgba(248, 250, 252, 0.98)',
    fontWeight: 600,
  },
]);

export const Cell = style([
  DefaultReset,
  {
    ...sharedCell,
    backgroundColor: color.Surface.Container,
  },
]);

export const EmptyCell = style([
  DefaultReset,
  {
    padding: config.space.S500,
  },
]);
