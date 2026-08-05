import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const PageContent = style({
  maxWidth: toRem(1180),
});

export const Toolbar = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: config.space.S200,
  padding: config.space.S300,
  border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: config.radii.R400,
  background: color.SurfaceVariant.Container,
});

export const RoomPicker = style({
  position: 'relative',
  flex: '1 1 15rem',
  minWidth: 0,
});

export const RoomSearchInput = style({
  width: '100%',
  height: toRem(40),
  padding: `0 ${config.space.S300}`,
  border: `1px solid ${color.Surface.ContainerLine}`,
  borderRadius: config.radii.R300,
  color: color.Surface.OnContainer,
  background: color.Surface.Container,
  font: 'inherit',
  outline: 'none',
  selectors: {
    '&:focus-visible': {
      borderColor: color.Primary.Main,
      boxShadow: `0 0 0 2px ${color.Primary.Container}`,
    },
  },
});

export const RoomOptions = style({
  position: 'absolute',
  zIndex: 20,
  top: `calc(100% + ${config.space.S100})`,
  left: 0,
  right: 0,
  maxHeight: `min(${toRem(288)}, calc(100vh - ${toRem(180)}))`,
  overflowY: 'auto',
  padding: config.space.S100,
  border: `1px solid ${color.Surface.ContainerLine}`,
  borderRadius: config.radii.R300,
  background: color.Surface.Container,
  boxShadow: `0 ${toRem(8)} ${toRem(24)} rgba(0, 0, 0, 0.18)`,
});

export const RoomOption = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S100,
  width: '100%',
  minWidth: 0,
  padding: `${config.space.S200} ${config.space.S300}`,
  border: 0,
  borderRadius: config.radii.R300,
  color: color.Surface.OnContainer,
  background: 'transparent',
  textAlign: 'left',
  font: 'inherit',
  cursor: 'pointer',
  selectors: {
    '&:hover, &[aria-selected="true"]': {
      background: color.Surface.ContainerHover,
    },
    '&:focus-visible': {
      outline: `2px solid ${color.Primary.Main}`,
      outlineOffset: -2,
    },
  },
});

export const RoomOptionName = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const RoomOptionId = style({
  overflow: 'hidden',
  color: color.SurfaceVariant.OnContainer,
  fontSize: toRem(12),
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  opacity: 0.7,
});

export const RoomOptionEmpty = style({
  padding: config.space.S400,
  color: color.SurfaceVariant.OnContainer,
  textAlign: 'center',
});

export const RoomOptionHint = style({
  padding: config.space.S200,
  color: color.SurfaceVariant.OnContainer,
  fontSize: toRem(12),
  textAlign: 'center',
});

export const Status = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: config.space.S200,
  minWidth: 0,
});

export const WeekScroller = style({
  width: '100%',
  overflowX: 'auto',
  paddingBottom: config.space.S100,
});

export const WeekGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(8.5rem, 1fr))',
  gap: config.space.S200,
  minWidth: toRem(980),
});

export const DayColumn = style({
  minWidth: 0,
  minHeight: toRem(300),
  padding: config.space.S200,
  border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: config.radii.R400,
  background: color.SurfaceVariant.Container,
});

export const TodayColumn = style({
  borderColor: color.Primary.Main,
  boxShadow: `inset 0 0 0 1px ${color.Primary.Main}`,
});

export const PastColumn = style({
  opacity: 0.62,
});

export const DayHeader = style({
  paddingBottom: config.space.S200,
  borderBottom: `1px solid ${color.SurfaceVariant.ContainerLine}`,
});

export const DayNumber = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: toRem(30),
  height: toRem(30),
  borderRadius: '999px',
  background: color.Surface.Container,
});

export const TodayNumber = style({
  color: color.Primary.OnContainer,
  background: color.Primary.Container,
});

export const MeetingList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S100,
  paddingTop: config.space.S200,
});

export const MeetingCard = style({
  width: '100%',
  minWidth: 0,
  padding: config.space.S200,
  textAlign: 'left',
  color: color.Surface.OnContainer,
  background: color.Surface.Container,
  border: `1px solid ${color.Surface.ContainerLine}`,
  borderRadius: config.radii.R300,
  font: 'inherit',
  cursor: 'pointer',
  transition: 'border-color 120ms ease, background-color 120ms ease',
  selectors: {
    '&:hover': {
      background: color.Surface.ContainerHover,
      borderColor: color.Primary.Main,
    },
    '&:focus-visible': {
      outline: `2px solid ${color.Primary.Main}`,
      outlineOffset: 1,
    },
  },
});

export const EmptyDay = style({
  padding: `${config.space.S400} ${config.space.S100}`,
  color: color.SurfaceVariant.OnContainer,
  textAlign: 'center',
  opacity: 0.65,
});

export const EmptyCalendar = style({
  minHeight: toRem(320),
  padding: config.space.S700,
  border: `1px dashed ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: config.radii.R400,
  background: color.SurfaceVariant.Container,
});

export const Dialog = style({
  width: 'calc(100vw - 2rem)',
  maxWidth: toRem(520),
  maxHeight: 'calc(100vh - 2rem)',
  overflow: 'hidden',
});

export const DetailRow = style({
  display: 'grid',
  gridTemplateColumns: '4.5rem minmax(0, 1fr)',
  gap: config.space.S200,
  alignItems: 'start',
});

export const BreakText = style({
  minWidth: 0,
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
});
