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

export const GlassCard = style([
  DefaultReset,
  {
    background: 'rgba(255, 255, 255, 0.58)',
    border: '1px solid rgba(148, 163, 184, 0.16)',
    boxShadow: '0 16px 42px rgba(15, 23, 42, 0.06)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
  },
]);

export const GlassCardSelected = style([
  DefaultReset,
  {
    background: 'rgba(59, 130, 246, 0.12)',
    border: '1px solid rgba(59, 130, 246, 0.22)',
    boxShadow: '0 16px 42px rgba(37, 99, 235, 0.08)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
  },
]);

export const GlassEmptyState = style([
  DefaultReset,
  {
    padding: config.space.S400,
    borderRadius: config.radii.R400,
    minHeight: '320px',
    background: 'rgba(255, 255, 255, 0.48)',
    border: '1px solid rgba(148, 163, 184, 0.14)',
    boxShadow: '0 14px 36px rgba(15, 23, 42, 0.05)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
  },
]);

export const MediaGrid = style([
  DefaultReset,
  {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: config.space.S300,
    alignItems: 'stretch',
  },
]);

export const MediaCard = style([
  DefaultReset,
  {
    display: 'flex',
    flexDirection: 'column',
    padding: 0,
    height: '100%',
    overflow: 'hidden',
  },
]);

export const MediaPreview = style([
  DefaultReset,
  {
    position: 'relative',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'stretch',
    width: '100%',
    aspectRatio: '1 / 1',
    minHeight: '220px',
    borderRadius: config.radii.R400,
    overflow: 'hidden',
    background:
      'radial-gradient(circle at top, rgba(59, 130, 246, 0.12), transparent 36%), rgba(15, 23, 42, 0.12)',
  },
]);

export const MediaPreviewButton = style([
  DefaultReset,
  {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'stretch',
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
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S200,
  },
]);

export const MediaCardTitle = style([
  DefaultReset,
  {
    display: 'block',
    wordBreak: 'break-word',
    lineHeight: 1.4,
  },
]);

export const MediaMetaRow = style([
  DefaultReset,
  {
    display: 'flex',
    flexWrap: 'wrap',
    gap: config.space.S150,
    alignItems: 'center',
  },
]);

export const ActionRow = style([
  DefaultReset,
  {
    display: 'flex',
    flexWrap: 'wrap',
    gap: config.space.S200,
    alignItems: 'center',
  },
]);

export const CardStack = style([
  DefaultReset,
  {
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S300,
  },
]);

export const MetaStack = style([
  DefaultReset,
  {
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S150,
    minWidth: 0,
  },
]);

export const MetaLine = style([
  DefaultReset,
  {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: config.space.S100,
    minWidth: 0,
  },
]);

export const DetailInfoGrid = style([
  DefaultReset,
  {
    display: 'flex',
    flexWrap: 'wrap',
    gap: config.space.S200,
  },
]);

export const DetailInfoCard = style([
  DefaultReset,
  {
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S100,
    flex: '1 1 220px',
    minWidth: '220px',
    maxWidth: '320px',
    padding: config.space.S250,
    borderRadius: config.radii.R300,
    background: 'rgba(15, 23, 42, 0.04)',
    border: '1px solid rgba(15, 23, 42, 0.06)',
  },
]);

export const DetailInfoLabel = style([
  DefaultReset,
  {
    display: 'block',
  },
]);

export const MessageContentCard = style([
  DefaultReset,
  {
    padding: 0,
    borderRadius: 0,
    background: 'transparent',
    border: 'none',
    overflow: 'visible',
  },
]);

export const NoteCard = style([
  DefaultReset,
  {
    paddingTop: config.space.S150,
    borderTop: '1px solid rgba(15, 23, 42, 0.08)',
  },
]);

export const NoteHeader = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: config.space.S200,
    flexWrap: 'wrap',
  },
]);

export const NoteText = style([
  DefaultReset,
  {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    lineHeight: 1.5,
  },
]);

export const NoteActionOnly = style([
  DefaultReset,
  {
    display: 'flex',
    justifyContent: 'flex-start',
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
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 360px',
        alignItems: 'stretch',
        gap: config.space.S150,
      },
    },
  },
]);

export const ViewerStageCard = style([
  DefaultReset,
  {
    flex: 1,
    display: 'flex',
    minWidth: 0,
    minHeight: 0,
    alignSelf: 'stretch',
  },
]);

export const ViewerDetailsCard = style([
  DefaultReset,
  {
    flexShrink: 0,
    borderRadius: config.radii.R500,
    padding: config.space.S300,
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(248, 250, 252, 0.94)',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.14)',
    backdropFilter: 'blur(20px)',
    maxHeight: '100%',
    height: '100%',
    overflow: 'auto',
    '@media': {
      'screen and (min-width: 1100px)': {
        width: '360px',
        maxWidth: '360px',
      },
    },
  },
]);

export const VideoViewer = style([
  DefaultReset,
  {
    width: '100%',
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
