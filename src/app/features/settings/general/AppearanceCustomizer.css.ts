import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const ControlSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S300,
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
  gridTemplateColumns: `minmax(${toRem(250)}, 0.86fr) minmax(${toRem(320)}, 1.14fr)`,
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
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: config.space.S250,
  '@media': {
    'screen and (max-width: 920px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
    'screen and (max-width: 620px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
});

export const ToneCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S150,
  minWidth: 0,
});

export const StyleOptionButton = style({
  border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: config.radii.R300,
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  minHeight: toRem(42),
  padding: `0 ${config.space.S300}`,
  display: 'flex',
  alignItems: 'center',
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
  gap: config.space.S200,
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

export const SelectField = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S100,
  minWidth: 0,
});

export const SelectLabel = style({
  fontSize: toRem(13),
  lineHeight: toRem(18),
  fontWeight: 600,
  color: color.Surface.OnContainer,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
});

export const FieldSelect = style({
  width: '100%',
  minWidth: 0,
  height: toRem(40),
  border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: config.radii.R300,
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  padding: `0 ${config.space.S200}`,
  font: 'inherit',
  fontSize: toRem(13),
  lineHeight: toRem(18),
  cursor: 'pointer',
  selectors: {
    '&:hover, &:focus-visible': {
      background: color.Surface.ContainerHover,
      borderColor: color.Primary.Main,
      outline: 'none',
    },
  },
});

export const ColorField = style({
  position: 'relative',
  minWidth: 0,
});

export const ColorSummaryButton = style({
  width: '100%',
  minHeight: toRem(44),
  border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: config.radii.R300,
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  padding: `${config.space.S100} ${config.space.S200}`,
  display: 'grid',
  gridTemplateColumns: `${toRem(24)} minmax(0, 1fr) ${toRem(18)}`,
  alignItems: 'center',
  gap: config.space.S100,
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease',
  selectors: {
    '&:hover, &:focus-visible': {
      background: color.Surface.ContainerHover,
      borderColor: color.Primary.Main,
    },
    '&[aria-expanded=true]': {
      borderColor: color.Primary.Main,
      boxShadow: `0 0 0 1px ${color.Primary.Main}`,
    },
  },
});

export const ColorSummarySwatch = style({
  width: toRem(24),
  height: toRem(24),
  borderRadius: config.radii.R300,
  boxShadow: `inset 0 0 0 1px rgba(255, 255, 255, 0.22), 0 0 0 1px ${color.SurfaceVariant.ContainerLine}`,
});

export const ColorSummaryText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(1),
  minWidth: 0,
});

export const ColorSummaryTitle = style({
  fontSize: toRem(13),
  lineHeight: toRem(16),
  fontWeight: 600,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
});

export const ColorSummaryMeta = style({
  fontSize: toRem(11),
  lineHeight: toRem(14),
  color: color.SurfaceVariant.OnContainer,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
});

export const ColorSummaryIcon = style({
  color: color.SurfaceVariant.OnContainer,
});

export const ColorPickerMenu = style({
  width: toRem(264),
  maxWidth: 'calc(100vw - 32px)',
  padding: config.space.S200,
  borderRadius: config.radii.R400,
});

export const ColorPickerHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: config.space.S200,
  paddingBottom: config.space.S150,
});

export const ColorPickerMeta = style({
  fontSize: toRem(12),
  lineHeight: toRem(16),
  color: color.SurfaceVariant.OnContainer,
});

export const ColorPickerGrid = style({
  display: 'grid',
  gridTemplateColumns: `repeat(6, ${toRem(30)})`,
  gap: config.space.S100,
});

export const ColorPickerDefaultButton = style({
  gridColumn: '1 / -1',
  minHeight: toRem(34),
  borderRadius: config.radii.R300,
  border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  padding: `0 ${config.space.S150}`,
  display: 'inline-flex',
  alignItems: 'center',
  gap: config.space.S100,
  cursor: 'pointer',
  transition: 'border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease',
  selectors: {
    '&:hover, &:focus-visible': {
      background: color.Surface.ContainerHover,
      borderColor: color.Primary.Main,
    },
    '&[aria-pressed=true]': {
      borderColor: color.Primary.Main,
      boxShadow: `0 0 0 1px ${color.Primary.Main}`,
    },
  },
});

export const ColorPickerDefaultSwatch = style({
  width: toRem(18),
  height: toRem(18),
  borderRadius: config.radii.R300,
  boxShadow: `inset 0 0 0 1px rgba(255, 255, 255, 0.22), 0 0 0 1px ${color.SurfaceVariant.ContainerLine}`,
  flexShrink: 0,
});

export const ColorPickerDefaultLabel = style({
  fontSize: toRem(12),
  lineHeight: toRem(16),
  fontWeight: 600,
});

export const ColorPickerSwatchButton = style({
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

export const ColorPickerSwatchFill = style({
  display: 'block',
  width: '100%',
  height: '100%',
  borderRadius: toRem(5),
  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.16)',
});

export const ColorPickerCustomButton = style({
  gridColumn: '1 / -1',
  position: 'relative',
  minHeight: toRem(34),
  borderRadius: config.radii.R300,
  border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  padding: `0 ${config.space.S150}`,
  display: 'inline-flex',
  alignItems: 'center',
  gap: config.space.S100,
  cursor: 'pointer',
  overflow: 'hidden',
  transition: 'border-color 120ms ease, background-color 120ms ease',
  selectors: {
    '&:hover, &:focus-within': {
      background: color.Surface.ContainerHover,
      borderColor: color.Primary.Main,
    },
    '&[data-selected=true]': {
      borderColor: color.Primary.Main,
      boxShadow: `0 0 0 1px ${color.Primary.Main}`,
    },
  },
});

export const ColorPickerCustomInput = style({
  position: 'absolute',
  inset: 0,
  opacity: 0,
  cursor: 'pointer',
});

export const ColorPickerCustomSwatch = style({
  width: toRem(18),
  height: toRem(18),
  borderRadius: config.radii.R300,
  boxShadow: `inset 0 0 0 1px rgba(255, 255, 255, 0.22), 0 0 0 1px ${color.SurfaceVariant.ContainerLine}`,
  flexShrink: 0,
});

export const ColorPickerCustomLabel = style({
  fontSize: toRem(12),
  lineHeight: toRem(16),
  fontWeight: 600,
});

export const BackgroundPreview = style({
  minHeight: toRem(136),
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

export const PreviewRoot = style({
  padding: config.space.S250,
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
  minHeight: toRem(284),
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
