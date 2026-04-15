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
