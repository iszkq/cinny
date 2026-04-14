import { globalStyle, style } from '@vanilla-extract/css';
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

export const ErrorMessage = style([
  DefaultReset,
  {
    maxWidth: '480px',
    textAlign: 'center',
    wordBreak: 'break-word',
  },
]);

export const SheetRail = style([
  DefaultReset,
  {
    padding: `${config.space.S250} ${config.space.S300}`,
    borderBottomWidth: config.borderWidth.B300,
    gap: config.space.S200,
    backgroundColor: color.Surface.Container,
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

export const SheetPreview = style([
  DefaultReset,
  {
    minWidth: '100%',
    minHeight: '100%',
    padding: config.space.S300,
  },
]);

export const SheetPreviewInner = style([
  DefaultReset,
  {
    display: 'inline-block',
    minWidth: '100%',
    padding: config.space.S300,
    border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
    borderRadius: config.radii.R400,
    backgroundColor: color.Surface.Container,
    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
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
  },
]);

globalStyle(`${SheetPreviewInner} table`, {
  borderCollapse: 'collapse',
  width: 'max-content',
  minWidth: '100%',
  backgroundColor: color.Surface.Container,
});

globalStyle(`${SheetPreviewInner} tr:nth-child(even) td`, {
  backgroundColor: 'rgba(148, 163, 184, 0.06)',
});

globalStyle(`${SheetPreviewInner} td, ${SheetPreviewInner} th`, {
  minWidth: '96px',
  maxWidth: '360px',
  padding: `${config.space.S150} ${config.space.S200}`,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  verticalAlign: 'top',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  lineHeight: '1.45',
  fontSize: '0.9375rem',
});

globalStyle(`${SheetPreviewInner} th`, {
  backgroundColor: 'rgba(148, 163, 184, 0.12)',
  fontWeight: '600',
});

globalStyle(`${SheetPreviewInner} td`, {
  backgroundColor: color.Surface.Container,
});
