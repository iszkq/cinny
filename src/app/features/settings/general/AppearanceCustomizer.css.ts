import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const ControlSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S250,
});

export const SectionHeader = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S100,
});

export const StyleOptions = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: config.space.S200,
});

export const CustomizerLayout = style({
  display: 'grid',
  gridTemplateColumns: `minmax(0, 1.15fr) minmax(${toRem(300)}, 0.85fr)`,
  gap: config.space.S300,
  alignItems: 'start',
  '@media': {
    'screen and (max-width: 900px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
});

export const ControlColumn = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S250,
  minWidth: 0,
});

export const PreviewColumn = style({
  minWidth: 0,
});

export const StickyPreviewStack = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S250,
  position: 'sticky',
  top: config.space.S100,
  '@media': {
    'screen and (max-width: 900px)': {
      position: 'static',
    },
  },
});

export const ToneGrid = style({
  display: 'grid',
  gap: config.space.S200,
});

export const ToneCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S200,
  padding: config.space.S250,
  borderRadius: config.radii.R300,
  border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  background: color.Surface.Container,
});

export const StyleOptionButton = style({
  border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: config.radii.R300,
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  padding: `${config.space.S200} ${config.space.S300}`,
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S100,
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'border-color 120ms ease, background-color 120ms ease, transform 120ms ease',
  selectors: {
    '&:hover, &:focus-visible': {
      background: color.Surface.ContainerHover,
      borderColor: color.Primary.Main,
    },
    '&[aria-pressed=true]': {
      background: color.Primary.Container,
      borderColor: color.Primary.Main,
      boxShadow: `0 0 0 1px ${color.Primary.Main}`,
    },
    '&:active': {
      transform: 'translateY(1px)',
    },
  },
});

export const StyleOptionTitle = style({
  fontSize: toRem(14),
  fontWeight: 600,
  lineHeight: toRem(18),
});

export const StyleOptionDescription = style({
  fontSize: toRem(12),
  lineHeight: toRem(16),
  color: color.SurfaceVariant.OnContainer,
});

export const SwatchSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S150,
});

export const OpacitySection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S100,
});

export const OpacityTitleBlock = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S100,
});

export const OpacityControlRow = style({
  display: 'grid',
  gridTemplateColumns: `${toRem(36)} minmax(0, 1fr) ${toRem(40)}`,
  alignItems: 'center',
  gap: config.space.S100,
});

export const OpacityHint = style({
  fontSize: toRem(12),
  lineHeight: toRem(16),
  color: color.SurfaceVariant.OnContainer,
});

export const OpacitySlider = style({
  width: '100%',
  margin: 0,
  accentColor: color.Primary.Main,
  cursor: 'pointer',
});

export const SwatchHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: config.space.S200,
  flexWrap: 'wrap',
});

export const SwatchMeta = style({
  fontSize: toRem(12),
  lineHeight: toRem(16),
  color: color.SurfaceVariant.OnContainer,
});

export const SwatchGrid = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: config.space.S100,
  alignItems: 'center',
});

export const ThemeDefaultSwatchButton = style({
  minHeight: toRem(30),
  borderRadius: config.radii.R300,
  border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  background: color.Surface.Container,
  padding: `${config.space.S100} ${config.space.S125}`,
  display: 'inline-flex',
  alignItems: 'center',
  gap: config.space.S100,
  cursor: 'pointer',
  transition: 'transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
  selectors: {
    '&:hover, &:focus-visible': {
      borderColor: color.Primary.Main,
      transform: 'translateY(-1px)',
    },
    '&[aria-pressed=true]': {
      borderColor: color.Primary.Main,
      boxShadow: `0 0 0 1px ${color.Primary.Main}`,
    },
  },
});

export const ThemeDefaultSwatchFill = style({
  width: toRem(16),
  height: toRem(16),
  borderRadius: toRem(999),
  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.18)',
  flexShrink: 0,
});

export const ThemeDefaultSwatchLabel = style({
  fontSize: toRem(12),
  lineHeight: toRem(16),
  fontWeight: 600,
});

export const BackgroundPreview = style({
  minHeight: toRem(96),
  borderRadius: config.radii.R300,
  border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'flex-end',
  padding: config.space.S200,
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: 'cover',
});

export const BackgroundPreviewBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: toRem(28),
  maxWidth: '100%',
  padding: `0 ${config.space.S150}`,
  borderRadius: config.radii.R300,
  background: 'rgba(15, 23, 42, 0.56)',
  color: '#FFFFFF',
  fontSize: toRem(12),
  lineHeight: toRem(16),
  fontWeight: 600,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
});

export const SwatchButton = style({
  width: toRem(30),
  height: toRem(30),
  borderRadius: config.radii.R300,
  border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  background: 'transparent',
  padding: toRem(2),
  cursor: 'pointer',
  transition: 'transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
  selectors: {
    '&:hover, &:focus-visible': {
      borderColor: color.Primary.Main,
      transform: 'translateY(-1px)',
    },
    '&[aria-pressed=true]': {
      borderColor: color.Primary.Main,
      boxShadow: `0 0 0 1px ${color.Primary.Main}`,
    },
  },
});

export const SwatchFill = style({
  display: 'block',
  width: '100%',
  height: '100%',
  borderRadius: toRem(5),
  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.16)',
});

export const CustomColorField = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: config.space.S100,
  paddingInlineStart: toRem(4),
});

export const CustomColorInput = style({
  width: toRem(30),
  height: toRem(30),
  border: 'none',
  borderRadius: config.radii.R300,
  background: 'transparent',
  padding: 0,
  cursor: 'pointer',
  selectors: {
    '&::-webkit-color-swatch-wrapper': {
      padding: 0,
    },
    '&::-webkit-color-swatch': {
      border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
      borderRadius: config.radii.R300,
    },
    '&::-moz-color-swatch': {
      border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
      borderRadius: config.radii.R300,
    },
  },
});

export const CustomColorLabel = style({
  fontSize: toRem(12),
  lineHeight: toRem(16),
  color: color.SurfaceVariant.OnContainer,
});

export const PreviewRoot = style({
  padding: config.space.S200,
  borderRadius: config.radii.R400,
  overflow: 'hidden',
});

export const PreviewShell = style({
  borderRadius: config.radii.R400,
  overflow: 'hidden',
  borderStyle: 'solid',
  borderWidth: 1,
  display: 'grid',
  gridTemplateColumns: `${toRem(86)} minmax(0, 1fr)`,
  minHeight: toRem(232),
  '@media': {
    'screen and (max-width: 750px)': {
      gridTemplateColumns: `${toRem(66)} minmax(0, 1fr)`,
    },
  },
});

export const PreviewRail = style({
  padding: config.space.S200,
  borderRightStyle: 'solid',
  borderRightWidth: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S150,
});

export const PreviewRailItem = style({
  height: toRem(28),
  borderRadius: config.radii.R300,
  background: 'rgba(255, 255, 255, 0.14)',
});

export const PreviewContent = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
});

export const PreviewHeader = style({
  padding: `${config.space.S200} ${config.space.S300}`,
  borderBottomStyle: 'solid',
  borderBottomWidth: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: config.space.S200,
});

export const PreviewHeaderTitle = style({
  fontSize: toRem(13),
  fontWeight: 600,
  lineHeight: toRem(18),
});

export const PreviewHeaderAccent = style({
  width: toRem(14),
  height: toRem(14),
  borderRadius: toRem(999),
  boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.22)',
});

export const PreviewBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S200,
  padding: config.space.S250,
  minWidth: 0,
  flex: 1,
});

export const PreviewCard = style({
  borderRadius: config.radii.R300,
  padding: config.space.S200,
  borderStyle: 'solid',
  borderWidth: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S100,
});

export const PreviewCardTitle = style({
  fontSize: toRem(13),
  fontWeight: 600,
  lineHeight: toRem(18),
});

export const PreviewCardText = style({
  fontSize: toRem(12),
  lineHeight: toRem(17),
  color: color.SurfaceVariant.OnContainer,
});

export const PreviewMessages = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S200,
  minWidth: 0,
});

export const PreviewRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: config.space.S150,
  minWidth: 0,
});

export const PreviewRowSelf = style([
  PreviewRow,
  {
    justifyContent: 'flex-end',
  },
]);

export const PreviewAvatar = style({
  width: toRem(28),
  height: toRem(28),
  borderRadius: toRem(999),
  background: 'rgba(255, 255, 255, 0.22)',
  flexShrink: 0,
});

export const PreviewBubble = style({
  maxWidth: '78%',
  borderRadius: config.radii.R400,
  borderStyle: 'solid',
  borderWidth: 1,
  padding: `${config.space.S150} ${config.space.S200}`,
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S100,
  minWidth: 0,
});

export const PreviewBubbleMeta = style({
  fontSize: toRem(11),
  fontWeight: 600,
  lineHeight: toRem(14),
  opacity: 0.78,
});

export const PreviewBubbleText = style({
  fontSize: toRem(12),
  lineHeight: toRem(17),
  wordBreak: 'break-word',
});
