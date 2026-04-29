import { style } from '@vanilla-extract/css';
import { color, config } from 'folds';

export const SplashScreen = style({
  minHeight: 'var(--app-height, 100dvh)',
  backgroundColor: color.Background.Container,
  color: color.Background.OnContainer,
});

export const SplashScreenFooter = style({
  paddingTop: config.space.S400,
  paddingRight: `max(${config.space.S400}, env(safe-area-inset-right, 0px))`,
  paddingBottom: `max(${config.space.S400}, env(safe-area-inset-bottom, 0px))`,
  paddingLeft: `max(${config.space.S400}, env(safe-area-inset-left, 0px))`,
});
