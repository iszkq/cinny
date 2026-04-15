import { style } from '@vanilla-extract/css';
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
  padding: config.space.S250,
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
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: config.space.S200,
  minWidth: 0,
  padding: `${config.space.S50} ${config.space.S50} ${config.space.S100}`,
});

export const ExploreNavGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(13rem, 14rem))',
  gap: config.space.S200,
  justifyContent: 'start',
});

export const ExploreNavCard = style([
  {
    position: 'relative',
    width: '100%',
    padding: config.space.S200,
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
        top: '-2rem',
        right: '-1.5rem',
        width: '5.5rem',
        height: '5.5rem',
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

export const ExploreNavCardButton = style({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-start',
  gap: config.space.S150,
  alignItems: 'stretch',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  appearance: 'none',
  color: 'inherit',
  font: 'inherit',
  padding: 0,
  paddingRight: `calc(${config.space.S200} + 2.2rem)`,
  paddingBottom: config.space.S150,
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

export const ExploreNavCardAvatarShell = style([
  ContainerColor({ variant: 'SurfaceVariant' }),
  {
    width: '2.7rem',
    height: '2.7rem',
    minWidth: '2.7rem',
    borderRadius: config.radii.R400,
    border: '1px solid rgba(226, 232, 240, 0.98)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8)',
  },
]);

export const ExploreNavHost = style([
  ContainerColor({ variant: 'SurfaceVariant' }),
  {
    display: 'inline-flex',
    alignItems: 'center',
    maxWidth: '100%',
    padding: `${config.space.S50} ${config.space.S150}`,
    borderRadius: config.radii.R300,
    fontSize: '0.76rem',
    lineHeight: 1.35,
    color: 'rgba(71, 85, 105, 0.92)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
]);

export const ExploreNavCardDescription = style({
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  lineHeight: 1.38,
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
  color: 'rgba(71, 85, 105, 0.95)',
});

export const ExploreNavCardFooter = style({
  position: 'absolute',
  right: config.space.S150,
  bottom: config.space.S150,
  opacity: 0.22,
  pointerEvents: 'auto',
  padding: config.space.S50,
  borderRadius: config.radii.R400,
  background: 'rgba(255, 255, 255, 0.94)',
  border: '1px solid rgba(226, 232, 240, 0.9)',
  boxShadow: '0 10px 24px rgba(148, 163, 184, 0.16)',
  transform: 'translateY(-2px)',
  transition: 'opacity 140ms ease, transform 140ms ease',
  selectors: {
    [`${ExploreNavCard}:hover &`]: {
      opacity: 1,
      transform: 'translateY(0)',
    },
    [`${ExploreNavCard}:focus-within &`]: {
      opacity: 1,
      transform: 'translateY(0)',
    },
  },
});

export const ExploreNavTagRail = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: config.space.S50,
  alignItems: 'center',
});

export const ExploreNavTag = style([
  ContainerColor({ variant: 'SurfaceVariant' }),
  {
    display: 'inline-flex',
    alignItems: 'center',
    padding: `${config.space.S50} ${config.space.S150}`,
    borderRadius: config.radii.R300,
    fontSize: '0.75rem',
    lineHeight: 1.3,
    color: 'rgba(71, 85, 105, 0.95)',
  },
]);
