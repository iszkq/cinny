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
  gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
  gap: config.space.S300,
});

export const ExploreNavCard = style([
  ContainerColor({ variant: 'SurfaceVariant' }),
  {
    padding: config.space.S300,
    borderRadius: config.radii.R400,
    minHeight: '13rem',
    minWidth: 0,
  },
]);

export const ExploreNavCardButton = style({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S300,
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
});

export const ExploreNavCardDescription = style({
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  lineHeight: 1.5,
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
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
