import { style } from '@vanilla-extract/css';
import { color, config } from 'folds';

export const AvatarFrameGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))',
  gap: config.space.S200,
});

export const AvatarFrameOption = style({
  minWidth: 0,
  padding: config.space.S200,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: config.radii.R300,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  cursor: 'pointer',
  transition: 'border-color 120ms ease, background-color 120ms ease',

  selectors: {
    '&:hover': {
      borderColor: color.Primary.Main,
    },
    '&:disabled': {
      cursor: 'default',
      opacity: 0.6,
    },
  },
});

export const AvatarFrameOptionSelected = style({
  borderColor: color.Primary.Main,
  backgroundColor: color.Primary.Container,
  color: color.Primary.OnContainer,
});

export const AvatarFramePreview = style({
  position: 'relative',
  width: '52px',
  height: '52px',
  margin: '0 auto',
});

export const AvatarFramePreviewImage = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  borderRadius: '50%',
});

export const AvatarFramePreviewOverlay = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
});
