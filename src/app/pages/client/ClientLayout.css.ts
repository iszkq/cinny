import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import {
  CLIENT_ROOT_BG_VAR,
  CLIENT_SHELL_BACKDROP_VAR,
  CLIENT_SHELL_BG_VAR,
  CLIENT_SHELL_BORDER_VAR,
  CLIENT_SHELL_SHADOW_VAR,
  CONTENT_BG_VAR,
  NAV_RAIL_BG_VAR,
  NAV_RAIL_BORDER_VAR,
} from '../../theme/appearance';

export const Root = style({
  minWidth: 0,
  minHeight: 0,
  width: '100%',
  height: '100%',
  padding: config.space.S200,
  background: `var(${CLIENT_ROOT_BG_VAR}, linear-gradient(180deg, rgba(244,247,245,0.98) 0%, rgba(236,242,238,0.98) 100%))`,
  '@media': {
    'screen and (max-width: 1124px)': {
      padding: 0,
      background: color.Background.Container,
    },
  },
});

export const DesktopShell = style({
  minWidth: 0,
  minHeight: 0,
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  borderRadius: toRem(18),
  boxShadow: `var(${CLIENT_SHELL_SHADOW_VAR}, 0 18px 44px rgba(31, 41, 35, 0.12))`,
  border: `1px solid var(${CLIENT_SHELL_BORDER_VAR}, rgba(103, 122, 110, 0.12))`,
  background: `var(${CLIENT_SHELL_BG_VAR}, rgba(255, 255, 255, 0.92))`,
  backdropFilter: `var(${CLIENT_SHELL_BACKDROP_VAR}, blur(14px))`,
  WebkitBackdropFilter: `var(${CLIENT_SHELL_BACKDROP_VAR}, blur(14px))`,
  '@media': {
    'screen and (max-width: 1124px)': {
      borderRadius: 0,
      boxShadow: 'none',
      border: 0,
      background: color.Surface.Container,
      backdropFilter: 'none',
    },
  },
});

export const NavRail = style({
  minHeight: 0,
  background: `var(${NAV_RAIL_BG_VAR}, linear-gradient(180deg, rgba(226, 235, 228, 0.96) 0%, rgba(214, 226, 217, 0.96) 100%))`,
  borderRight: `1px solid var(${NAV_RAIL_BORDER_VAR}, rgba(110, 128, 117, 0.14))`,
  '@media': {
    'screen and (max-width: 1124px)': {
      background: color.Background.Container,
      borderRight: 'none',
    },
  },
});

export const Content = style({
  minWidth: 0,
  minHeight: 0,
  background: `var(${CONTENT_BG_VAR}, rgba(250, 252, 250, 0.94))`,
  '@media': {
    'screen and (max-width: 1124px)': {
      background: color.Surface.Container,
    },
  },
});
