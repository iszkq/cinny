import { globalStyle, style } from '@vanilla-extract/css';
import { config } from 'folds';
import { ContainerColor } from '../../../styles/ContainerColor.css';

export const RoomsInfoCard = style([
  ContainerColor({ variant: 'SurfaceVariant' }),
  {
    padding: `${config.space.S700} ${config.space.S300}`,
    borderRadius: config.radii.R400,
  },
]);

export const PublicRoomsError = style([
  ContainerColor({ variant: 'Critical' }),
  {
    padding: config.space.S300,
    borderRadius: config.radii.R400,
  },
]);

export const ExploreWebFrameShell = style([
  ContainerColor({ variant: 'Surface' }),
  {
    flexGrow: 1,
    minHeight: 0,
    overflow: 'hidden',
    borderRadius: config.radii.R400,
  },
]);

export const ExploreWebFrame = style({
  width: '100%',
  height: '100%',
  border: 'none',
  display: 'block',
  background: '#fff',
});

export const ExploreNavSection = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  padding: config.space.S400,
  boxSizing: 'border-box',
  borderRadius: config.radii.R500,
  background:
    'linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.84))',
  border: '1px solid rgba(226, 232, 240, 0.92)',
  boxShadow: '0 10px 26px rgba(148, 163, 184, 0.1)',
});

export const ExploreNavCanvas = style({
  padding: config.space.S300,
  borderRadius: config.radii.R600,
  background:
    'radial-gradient(circle at top left, rgba(191, 219, 254, 0.34), transparent 34%), radial-gradient(circle at 82% 18%, rgba(226, 232, 240, 0.6), transparent 26%), linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(255, 255, 255, 0.98))',
  border: '1px solid rgba(226, 232, 240, 0.92)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
});

export const ExploreNavSectionHeader = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: config.space.S300,
  minWidth: 0,
  paddingBottom: config.space.S300,
  borderBottom: '1px solid rgba(226, 232, 240, 0.78)',
});

export const ExploreNavSectionMeta = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S100,
  minWidth: 0,
  paddingLeft: config.space.S100,
});

export const ExploreNavSectionActions = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: config.space.S100,
  justifyContent: 'flex-end',
  alignItems: 'center',
  marginLeft: 'auto',
  minWidth: 0,
  paddingRight: config.space.S100,
});

globalStyle(`${ExploreNavSectionActions} > *`, {
  flexShrink: 0,
});

export const ExploreNavGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(17.5rem, 1fr))',
  gap: config.space.S300,
  alignItems: 'start',
});

export const ExploreNavCard = style([
  {
    position: 'relative',
    display: 'flex',
    alignItems: 'stretch',
    width: '100%',
    alignSelf: 'start',
    minHeight: '6.35rem',
    padding: config.space.S300,
    borderRadius: config.radii.R500,
    minWidth: 0,
    boxSizing: 'border-box',
    overflow: 'hidden',
    background:
      'linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.95))',
    border: '1px solid rgba(226, 232, 240, 0.96)',
    boxShadow: '0 14px 30px rgba(148, 163, 184, 0.14)',
    transition:
      'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background-color 180ms ease',
    '@media': {
      '(max-width: 720px)': {
        width: '100%',
      },
    },
    selectors: {
      '&::before': {
        content: '""',
        position: 'absolute',
        top: '-1.8rem',
        right: '-1.2rem',
        width: '4.8rem',
        height: '4.8rem',
        borderRadius: '999px',
        background: 'radial-gradient(circle, rgba(191, 219, 254, 0.36), rgba(191, 219, 254, 0))',
        pointerEvents: 'none',
      },
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: '0 22px 44px rgba(148, 163, 184, 0.2)',
        borderColor: 'rgba(191, 219, 254, 0.98)',
      },
      '&:focus-within': {
        transform: 'translateY(-2px)',
        boxShadow: '0 0 0 2px rgba(96, 165, 250, 0.16), 0 20px 42px rgba(148, 163, 184, 0.18)',
        borderColor: 'rgba(59, 130, 246, 0.28)',
      },
    },
  },
]);

export const ExploreNavCardHead = style({
  display: 'flex',
  alignItems: 'stretch',
  gap: config.space.S300,
  minWidth: 0,
  width: '100%',
});

export const ExploreNavCardButton = style({
  flex: 1,
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  appearance: 'none',
  color: 'inherit',
  font: 'inherit',
  padding: 0,
  minWidth: 0,
  cursor: 'pointer',
  textDecoration: 'none',
  selectors: {
    '&:hover': {
      textDecoration: 'none',
    },
    '&:focus-visible': {
      outline: 'none',
    },
  },
});

export const ExploreNavCardMain = style({
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  columnGap: config.space.S300,
  alignItems: 'center',
  minWidth: 0,
  minHeight: '100%',
});

export const ExploreNavCardAvatarShell = style([
  ContainerColor({ variant: 'SurfaceVariant' }),
  {
    width: '2.75rem',
    height: '2.75rem',
    minWidth: '2.75rem',
    borderRadius: config.radii.R400,
    border: '1px solid rgba(226, 232, 240, 0.98)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8)',
  },
]);

export const ExploreNavCardContent = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: config.space.S100,
  minWidth: 0,
  minHeight: 0,
});

export const ExploreNavCardTitleBlock = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S100,
  minWidth: 0,
});

export const ExploreNavCardDescription = style({
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 1,
  WebkitBoxOrient: 'vertical',
  lineHeight: 1.38,
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
  color: 'rgba(71, 85, 105, 0.95)',
});

export const ExploreNavCardFooter = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: config.space.S100,
  width: '2.5rem',
  flexShrink: 0,
  paddingLeft: config.space.S100,
  opacity: 0.62,
  transition: 'opacity 140ms ease',
  selectors: {
    [`${ExploreNavCard}:hover &`]: {
      opacity: 1,
    },
    [`${ExploreNavCard}:focus-within &`]: {
      opacity: 1,
    },
  },
});

export const ExploreNavTagRail = style({
  display: 'flex',
  flexWrap: 'nowrap',
  gap: config.space.S100,
  alignItems: 'center',
  maxWidth: '100%',
  minWidth: 0,
  overflow: 'hidden',
});

export const ExploreNavTag = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.12rem',
  minWidth: 0,
  maxWidth: '100%',
  fontSize: '0.74rem',
  lineHeight: 1.3,
  fontWeight: 500,
  color: 'rgba(37, 99, 235, 0.9)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  selectors: {
    '&::before': {
      content: '"#"',
      color: 'rgba(96, 165, 250, 0.88)',
    },
  },
});
