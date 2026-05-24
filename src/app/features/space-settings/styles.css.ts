import { style } from '@vanilla-extract/css';
import { color, config } from 'folds';
import {
  CARD_BACKDROP_VAR,
  CARD_BG_VAR,
  CARD_BORDER_VAR,
  CARD_SHADOW_VAR,
} from '../../theme/appearance';

export const SequenceCardStyle = style({
  padding: config.space.S300,
  background: `var(${CARD_BG_VAR}, ${color.SurfaceVariant.Container})`,
  boxShadow: `var(${CARD_SHADOW_VAR}, none)`,
  border: `1px solid var(${CARD_BORDER_VAR}, transparent)`,
  backdropFilter: `var(${CARD_BACKDROP_VAR}, none)`,
  WebkitBackdropFilter: `var(${CARD_BACKDROP_VAR}, none)`,
});
