import { DefaultReset, color, config, toRem } from 'folds';
import { style, styleVariants } from '@vanilla-extract/css';

export const PageViewport = style({
  width: '100%',
  height: '100%',
  minHeight: 0,
  overflowX: 'hidden',
  overflowY: 'auto',
  scrollBehavior: 'smooth',
  overscrollBehaviorY: 'contain',
  WebkitOverflowScrolling: 'touch',
  background:
    'radial-gradient(circle at 12% 8%, rgba(83, 177, 123, 0.10), transparent 28rem), radial-gradient(circle at 88% 22%, rgba(80, 125, 255, 0.08), transparent 32rem)',
});

export const Page = style({
  width: '100%',
  minHeight: '100dvh',
  background: 'transparent',
  color: color.Background.OnContainer,
});

export const Header = style({
  position: 'sticky',
  top: 0,
  zIndex: 10,
  minHeight: toRem(64),
  padding: `${config.space.S200} max(${config.space.S400}, env(safe-area-inset-right))`,
  paddingLeft: `max(${config.space.S400}, env(safe-area-inset-left))`,
  background: `color-mix(in srgb, ${color.Background.Container} 88%, transparent)`,
  borderBottom: `1px solid ${color.Background.ContainerLine}`,
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  '@media': {
    'screen and (max-width: 750px)': {
      minHeight: toRem(56),
      padding: `${config.space.S100} max(${config.space.S200}, env(safe-area-inset-right))`,
      paddingLeft: `max(${config.space.S200}, env(safe-area-inset-left))`,
    },
  },
});

export const HeaderInner = style({
  width: '100%',
  maxWidth: toRem(1120),
  margin: 'auto',
});

export const BrandLink = style([
  DefaultReset,
  {
    display: 'inline-flex',
    alignItems: 'center',
    gap: config.space.S200,
    color: color.Background.OnContainer,
    textDecoration: 'none',
    selectors: {
      '&:hover': {
        textDecoration: 'none',
      },
    },
  },
]);

export const BrandLogo = style([
  DefaultReset,
  {
    width: toRem(32),
    height: toRem(32),
    borderRadius: config.radii.R300,
  },
]);

export const HeaderNav = style({
  '@media': {
    'screen and (max-width: 750px)': {
      display: 'none',
    },
  },
});

export const HeaderLink = style({
  color: color.Background.OnContainer,
  opacity: 0.72,
  selectors: {
    '&:hover': {
      opacity: 1,
      textDecoration: 'none',
    },
  },
});

export const Main = style({
  width: '100%',
  maxWidth: toRem(1120),
  margin: 'auto',
  padding: `${config.space.S700} ${config.space.S400} max(${toRem(
    72
  )}, env(safe-area-inset-bottom))`,
  '@media': {
    'screen and (max-width: 750px)': {
      padding: `${config.space.S300} ${config.space.S200} ${toRem(72)}`,
    },
  },
});

export const Hero = style({
  position: 'relative',
  overflow: 'hidden',
  padding: `${toRem(68)} ${toRem(64)}`,
  background: `linear-gradient(135deg, ${color.Primary.Container}, ${color.Surface.Container} 64%)`,
  border: `1px solid ${color.Primary.ContainerLine}`,
  borderRadius: toRem(28),
  boxShadow: '0 26px 80px rgba(20, 50, 34, 0.10)',
  selectors: {
    '&::before': {
      content: '',
      position: 'absolute',
      width: toRem(360),
      height: toRem(360),
      right: toRem(-120),
      top: toRem(-190),
      borderRadius: '50%',
      background: `color-mix(in srgb, ${color.Primary.Main} 20%, transparent)`,
      filter: 'blur(8px)',
    },
    '&::after': {
      content: '',
      position: 'absolute',
      width: toRem(260),
      height: toRem(260),
      left: toRem(-130),
      bottom: toRem(-180),
      borderRadius: '50%',
      background: `color-mix(in srgb, ${color.Success.Main} 16%, transparent)`,
      filter: 'blur(12px)',
    },
  },
  '@media': {
    'screen and (max-width: 750px)': {
      padding: `${toRem(42)} ${config.space.S300}`,
      borderRadius: toRem(22),
    },
  },
});

export const HeroGrid = style({
  position: 'relative',
  zIndex: 1,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.55fr) minmax(260px, 0.75fr)',
  gap: toRem(44),
  alignItems: 'end',
  '@media': {
    'screen and (max-width: 820px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
      gap: toRem(32),
    },
  },
});

export const HeroContent = style({
  position: 'relative',
  zIndex: 1,
  maxWidth: toRem(660),
});

export const HeroAside = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S300,
  minWidth: 0,
  padding: toRem(26),
  background: `color-mix(in srgb, ${color.Surface.Container} 88%, transparent)`,
  border: `1px solid ${color.Surface.ContainerLine}`,
  borderRadius: toRem(22),
  boxShadow: '0 18px 52px rgba(20, 50, 34, 0.10)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
});

export const ReleaseEyebrow = style({
  color: color.Primary.Main,
  fontSize: toRem(11),
  fontWeight: 720,
  letterSpacing: '0.14em',
});

export const ReleaseStatusList = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: config.space.S100,
});

export const ReleaseStatusItem = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: `${toRem(7)} ${toRem(10)}`,
  color: color.Success.OnContainer,
  background: color.Success.Container,
  border: `1px solid ${color.Success.ContainerLine}`,
  borderRadius: config.radii.Pill,
  fontSize: toRem(12),
  fontWeight: 600,
});

export const HeroLogo = style([
  DefaultReset,
  {
    width: toRem(72),
    height: toRem(72),
    padding: toRem(8),
    background: color.Surface.Container,
    border: `1px solid ${color.Surface.ContainerLine}`,
    borderRadius: toRem(22),
    boxShadow: '0 14px 36px rgba(20, 50, 34, 0.12)',
  },
]);

export const HeroTitle = style({
  margin: 0,
  fontSize: 'clamp(2.25rem, 6vw, 4.25rem)',
  lineHeight: 1.08,
  letterSpacing: '-0.045em',
  fontWeight: 720,
});

export const HeroDescription = style({
  maxWidth: toRem(620),
  margin: 0,
  fontSize: 'clamp(1rem, 2vw, 1.18rem)',
  lineHeight: 1.75,
  color: color.Primary.OnContainer,
  opacity: 0.8,
});

export const HeroMeta = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: config.space.S100,
  padding: `${config.space.S100} ${config.space.S200}`,
  color: color.Primary.OnContainer,
  background: `color-mix(in srgb, ${color.Surface.Container} 72%, transparent)`,
  border: `1px solid ${color.Primary.ContainerLine}`,
  borderRadius: config.radii.Pill,
});

export const Section = style({
  paddingTop: toRem(72),
  scrollMarginTop: toRem(72),
  '@media': {
    'screen and (max-width: 750px)': {
      paddingTop: toRem(48),
    },
  },
});

export const SectionHeading = style({
  maxWidth: toRem(700),
});

export const ChannelGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: config.space.S300,
  '@media': {
    'screen and (max-width: 750px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
      gap: config.space.S200,
    },
  },
});

export const ChannelCard = style({
  minWidth: 0,
  height: '100%',
  padding: config.space.S400,
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  border: `1px solid ${color.Surface.ContainerLine}`,
  borderRadius: toRem(20),
  boxShadow: '0 12px 34px rgba(20, 50, 34, 0.055)',
  transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
  selectors: {
    '&:hover': {
      transform: 'translateY(-2px)',
      borderColor: color.Primary.ContainerLine,
      boxShadow: '0 18px 42px rgba(20, 50, 34, 0.09)',
    },
  },
  '@media': {
    'screen and (max-width: 750px)': {
      padding: config.space.S300,
      borderRadius: toRem(18),
    },
  },
});

export const ChannelIcon = styleVariants({
  windows: {
    color: color.Primary.OnContainer,
    background: color.Primary.Container,
  },
  web: {
    color: color.Success.OnContainer,
    background: color.Success.Container,
  },
  android: {
    color: color.Secondary.OnContainer,
    background: color.Secondary.Container,
  },
  ios: {
    color: color.SurfaceVariant.OnContainer,
    background: color.SurfaceVariant.Container,
  },
});

export const ChannelIconBase = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: toRem(48),
  height: toRem(48),
  borderRadius: toRem(15),
});

export const Badge = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: `${toRem(3)} ${config.space.S100}`,
  color: color.Primary.OnContainer,
  background: color.Primary.Container,
  border: `1px solid ${color.Primary.ContainerLine}`,
  borderRadius: config.radii.Pill,
  fontSize: toRem(12),
  fontWeight: 600,
});

export const BulletList = style({
  margin: 0,
  paddingLeft: toRem(20),
  color: color.Surface.OnContainer,
  opacity: 0.72,
  lineHeight: 1.7,
});

export const CardActions = style({
  marginTop: 'auto',
});

export const ManualGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: config.space.S300,
  '@media': {
    'screen and (max-width: 750px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
      gap: config.space.S200,
    },
  },
});

export const ManualCard = style({
  padding: config.space.S400,
  background: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: toRem(20),
  '@media': {
    'screen and (max-width: 750px)': {
      padding: config.space.S300,
    },
  },
});

export const ManualAnchor = style({
  height: '100%',
  scrollMarginTop: toRem(84),
});

export const StepNumber = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: toRem(28),
  height: toRem(28),
  color: color.Primary.OnContainer,
  background: color.Primary.Container,
  borderRadius: config.radii.Pill,
  fontSize: toRem(13),
  fontWeight: 650,
});

export const InfoStrip = style({
  padding: config.space.S300,
  background: color.Primary.Container,
  color: color.Primary.OnContainer,
  border: `1px solid ${color.Primary.ContainerLine}`,
  borderRadius: toRem(18),
});

export const Footer = style({
  paddingTop: toRem(72),
  paddingBottom: toRem(12),
  textAlign: 'center',
  opacity: 0.72,
});
