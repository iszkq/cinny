import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config } from 'folds';

export const ImageViewer = style([
  DefaultReset,
  {
    height: '100%',
    minHeight: 0,
    borderRadius: config.radii.R500,
    overflow: 'hidden',
    backgroundColor: 'rgba(7, 10, 16, 0.96)',
    color: color.Common.White,
    boxShadow: '0 28px 80px rgba(7, 10, 16, 0.4)',
  },
]);

export const ImageViewerHeader = style([
  DefaultReset,
  {
    paddingLeft: config.space.S300,
    paddingRight: config.space.S300,
    borderBottom: `1px solid rgba(255, 255, 255, 0.08)`,
    background: 'rgba(255, 255, 255, 0.03)',
    flexShrink: 0,
    gap: config.space.S200,
  },
]);

export const ImageViewerContent = style([
  DefaultReset,
  {
    minHeight: 0,
    overflow: 'hidden',
    padding: config.space.S300,
    background:
      'radial-gradient(circle at top, rgba(59, 130, 246, 0.08), transparent 32%), rgba(7, 10, 16, 0.98)',
  },
]);

export const ImageViewerViewport = style([
  DefaultReset,
  {
    width: '100%',
    height: '100%',
    minHeight: 0,
    overflow: 'hidden',
  },
]);

export const ImageViewerImg = style([
  DefaultReset,
  {
    display: 'block',
    width: 'auto',
    height: 'auto',
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    backgroundColor: 'transparent',
    transformOrigin: 'center center',
    transition: 'transform 120ms ease',
    userSelect: 'none',
    WebkitUserDrag: 'none',
  },
]);
