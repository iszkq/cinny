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
});

export const ExploreNavSectionHeader = style([
  ContainerColor({ variant: 'SurfaceVariant' }),
  {
    padding: config.space.S300,
    borderRadius: config.radii.R400,
    minWidth: 0,
  },
]);

export const ExploreNavGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(15rem, 17rem))',
  gap: config.space.S300,
  justifyContent: 'start',
});

export const ExploreNavCard = style([
  ContainerColor({ variant: 'Surface' }),
  {
    padding: config.space.S250,
    borderRadius: config.radii.R500,
    minHeight: '9.5rem',
    minWidth: 0,
    boxSizing: 'border-box',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.08)',
    transition:
      'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background-color 160ms ease',
    selectors: {
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: '0 18px 36px rgba(15, 23, 42, 0.14)',
        borderColor: 'rgba(59, 130, 246, 0.24)',
      },
      '&:focus-within': {
        transform: 'translateY(-2px)',
        boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.18), 0 18px 36px rgba(15, 23, 42, 0.12)',
        borderColor: 'rgba(59, 130, 246, 0.28)',
      },
    },
  },
]);

export const ExploreNavCardButton = style({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S200,
  alignItems: 'stretch',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  appearance: 'none',
  color: 'inherit',
  font: 'inherit',
  padding: 0,
  minWidth: 0,
  cursor: 'pointer',
  flexGrow: 1,
  selectors: {
    '&:focus-visible': {
      outline: 'none',
    },
  },
});

export const ExploreNavCardDescription = style({
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 1,
  WebkitBoxOrient: 'vertical',
  lineHeight: 1.5,
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
});

export const ExploreNavCardFooter = style({
  opacity: 0.82,
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

export const ExploreNavTag = style([
  ContainerColor({ variant: 'Surface' }),
  {
    display: 'inline-flex',
    alignItems: 'center',
    padding: `${config.space.S50} ${config.space.S200}`,
    borderRadius: config.radii.R300,
    fontSize: '0.75rem',
    lineHeight: 1.4,
  },
]);
