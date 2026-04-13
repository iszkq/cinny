import { style } from '@vanilla-extract/css';
import { DefaultReset, config } from 'folds';

export const FilterCardSection = style([
  DefaultReset,
  {
    width: '100%',
  },
]);

export const FilterCardLabel = style([
  DefaultReset,
  {
    display: 'block',
    marginBottom: config.space.S200,
  },
]);

export const FilterCardActions = style([
  DefaultReset,
  {
    display: 'flex',
    flexWrap: 'wrap',
    gap: config.space.S200,
    alignItems: 'center',
  },
]);

export const MediaGrid = style([
  DefaultReset,
  {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: config.space.S300,
  },
]);

export const MediaCard = style([
  DefaultReset,
  {
    padding: config.space.S300,
  },
]);

export const MediaPreview = style([
  DefaultReset,
  {
    position: 'relative',
    width: '100%',
    aspectRatio: '4 / 3',
    borderRadius: config.radii.R400,
    overflow: 'hidden',
    background:
      'linear-gradient(180deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.14))',
  },
]);

export const MediaPreviewButton = style([
  DefaultReset,
  {
    width: '100%',
    height: '100%',
    display: 'block',
    padding: 0,
    margin: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
  },
]);

export const MediaPreviewImage = style([
  DefaultReset,
  {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
]);

export const MediaPreviewOverlay = style([
  DefaultReset,
  {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    background:
      'linear-gradient(180deg, rgba(15, 23, 42, 0.06) 0%, rgba(15, 23, 42, 0.32) 100%)',
  },
]);

export const MediaCheckbox = style([
  DefaultReset,
  {
    position: 'absolute',
    top: config.space.S200,
    left: config.space.S200,
    zIndex: 2,
    padding: config.space.S100,
    borderRadius: config.radii.R300,
    background: 'rgba(255, 255, 255, 0.92)',
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
  },
]);

export const MediaPlayBadge = style([
  DefaultReset,
  {
    position: 'absolute',
    inset: 0,
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
]);

export const MediaPlayBadgeInner = style([
  DefaultReset,
  {
    width: '64px',
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '999px',
    background: 'rgba(15, 23, 42, 0.78)',
    color: '#fff',
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.24)',
  },
]);

export const MediaCardBody = style([
  DefaultReset,
  {
    minWidth: 0,
  },
]);

export const MediaMetaRow = style([
  DefaultReset,
  {
    display: 'flex',
    flexWrap: 'wrap',
    gap: config.space.S200,
    alignItems: 'center',
  },
]);

export const MediaNotePreview = style([
  DefaultReset,
  {
    padding: `${config.space.S200} ${config.space.S300}`,
    borderRadius: config.radii.R300,
    background: 'rgba(15, 23, 42, 0.04)',
    border: '1px solid rgba(15, 23, 42, 0.06)',
  },
]);

export const ViewerShell = style([
  DefaultReset,
  {
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S200,
    '@media': {
      'screen and (min-width: 1100px)': {
        flexDirection: 'row',
        alignItems: 'stretch',
      },
    },
  },
]);

export const ViewerStageCard = style([
  DefaultReset,
  {
    flex: 1,
    minHeight: 0,
  },
]);

export const ViewerDetailsCard = style([
  DefaultReset,
  {
    flexShrink: 0,
    borderRadius: config.radii.R500,
    padding: config.space.S300,
    background: 'rgba(248, 250, 252, 0.98)',
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
    '@media': {
      'screen and (min-width: 1100px)': {
        width: '360px',
        maxWidth: '30vw',
        overflow: 'auto',
      },
    },
  },
]);

export const VideoViewer = style([
  DefaultReset,
  {
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    borderRadius: config.radii.R500,
    overflow: 'hidden',
    background: 'rgba(7, 10, 16, 0.96)',
    color: '#fff',
    boxShadow: '0 28px 80px rgba(7, 10, 16, 0.4)',
  },
]);

export const VideoViewerHeader = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: config.space.S300,
    padding: `${config.space.S300} ${config.space.S400}`,
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(255, 255, 255, 0.03)',
  },
]);

export const VideoViewerStage = style([
  DefaultReset,
  {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    padding: config.space.S300,
    background:
      'radial-gradient(circle at top, rgba(59, 130, 246, 0.08), transparent 32%), rgba(7, 10, 16, 0.98)',
  },
]);

export const VideoViewerViewport = style([
  DefaultReset,
  {
    width: '100%',
    height: '100%',
    minHeight: '320px',
    borderRadius: config.radii.R400,
    overflow: 'hidden',
    background: 'rgba(255, 255, 255, 0.02)',
  },
]);

export const VideoViewerNav = style([
  DefaultReset,
  {
    position: 'absolute',
    top: '50%',
    zIndex: 2,
    transform: 'translateY(-50%)',
  },
]);
