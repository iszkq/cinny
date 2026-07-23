import { DefaultReset, color, config, toRem } from 'folds';
import { globalStyle, style } from '@vanilla-extract/css';

export const PageViewport = style({
  position: 'fixed',
  top: 'var(--safe-area-top, env(safe-area-inset-top, 0px))',
  right: 0,
  bottom: 0,
  left: 0,
  width: '100%',
  minHeight: 0,
  overflowX: 'hidden',
  overflowY: 'auto',
  scrollBehavior: 'smooth',
  overscrollBehaviorY: 'contain',
  WebkitOverflowScrolling: 'touch',
  background:
    'radial-gradient(circle at 8% 4%, rgba(255, 108, 55, 0.12), transparent 28rem), radial-gradient(circle at 92% 14%, rgba(42, 111, 246, 0.11), transparent 30rem)',
});

export const Page = style({
  width: '100%',
  minHeight: '100%',
  background: color.Background.Container,
  color: color.Background.OnContainer,
});

export const Header = style({
  position: 'sticky',
  top: 0,
  zIndex: 20,
  minHeight: toRem(64),
  padding: `${config.space.S200} max(${config.space.S400}, env(safe-area-inset-right, 0px))`,
  paddingLeft: `max(${config.space.S400}, env(safe-area-inset-left, 0px))`,
  background: `color-mix(in srgb, ${color.Background.Container} 88%, transparent)`,
  borderBottom: `1px solid ${color.Background.ContainerLine}`,
  backdropFilter: 'blur(20px) saturate(150%)',
  WebkitBackdropFilter: 'blur(20px) saturate(150%)',
  '@media': {
    'screen and (max-width: 750px)': {
      minHeight: toRem(56),
      padding: `${config.space.S100} max(${config.space.S200}, env(safe-area-inset-right, 0px))`,
      paddingLeft: `max(${config.space.S200}, env(safe-area-inset-left, 0px))`,
    },
  },
});

export const HeaderInner = style({
  width: '100%',
  maxWidth: toRem(1180),
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
      '&:hover': { textDecoration: 'none' },
    },
  },
]);

export const BrandLogo = style([
  DefaultReset,
  {
    width: toRem(36),
    height: toRem(36),
    borderRadius: toRem(11),
    boxShadow: '0 8px 20px rgba(242, 81, 34, 0.16)',
  },
]);

export const HeaderNav = style({
  '@media': {
    'screen and (max-width: 750px)': { display: 'none' },
  },
});

export const HeaderLink = style({
  color: color.Background.OnContainer,
  opacity: 0.68,
  fontWeight: 560,
  selectors: {
    '&:hover': { opacity: 1, textDecoration: 'none' },
  },
});

export const Main = style({
  width: '100%',
  maxWidth: toRem(1180),
  margin: 'auto',
  padding: `${toRem(40)} ${config.space.S400} max(${toRem(48)}, env(safe-area-inset-bottom, 0px))`,
  '@media': {
    'screen and (max-width: 750px)': {
      padding: `${config.space.S200} ${config.space.S200} max(${toRem(
        36
      )}, env(safe-area-inset-bottom, 0px))`,
    },
    'screen and (max-width: 360px)': {
      paddingRight: config.space.S100,
      paddingLeft: config.space.S100,
    },
  },
});

export const Hero = style({
  position: 'relative',
  overflow: 'hidden',
  scrollMarginTop: toRem(76),
  padding: `${toRem(64)} ${toRem(60)}`,
  background:
    'linear-gradient(135deg, rgba(255, 244, 237, 0.98) 0%, rgba(248, 251, 255, 0.98) 54%, rgba(239, 246, 255, 0.98) 100%)',
  border: '1px solid rgba(107, 124, 145, 0.16)',
  borderRadius: toRem(30),
  boxShadow: '0 30px 90px rgba(44, 61, 80, 0.12)',
  selectors: {
    '&::before': {
      content: '',
      position: 'absolute',
      width: toRem(420),
      height: toRem(420),
      right: toRem(-150),
      top: toRem(-250),
      borderRadius: '50%',
      background: 'rgba(50, 116, 246, 0.13)',
      filter: 'blur(4px)',
    },
    '&::after': {
      content: '',
      position: 'absolute',
      width: toRem(300),
      height: toRem(300),
      left: toRem(-150),
      bottom: toRem(-220),
      borderRadius: '50%',
      background: 'rgba(255, 94, 36, 0.14)',
    },
  },
  '@media': {
    'screen and (max-width: 750px)': {
      padding: `${toRem(38)} ${config.space.S300}`,
      borderRadius: toRem(22),
    },
    'screen and (max-width: 420px)': {
      padding: `${toRem(32)} ${config.space.S200}`,
      borderRadius: toRem(18),
    },
  },
});

export const HeroGrid = style({
  position: 'relative',
  zIndex: 1,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.08fr) minmax(360px, 0.92fr)',
  gap: toRem(48),
  alignItems: 'center',
  '@media': {
    'screen and (max-width: 900px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
      gap: toRem(34),
    },
  },
});

export const HeroContent = style({ maxWidth: toRem(650) });

export const HeroKicker = style({
  display: 'inline-flex',
  width: 'fit-content',
  padding: `${toRem(7)} ${toRem(12)}`,
  color: '#b43d17',
  background: 'rgba(255, 219, 202, 0.74)',
  border: '1px solid rgba(217, 82, 32, 0.18)',
  borderRadius: config.radii.Pill,
  fontSize: toRem(13),
  fontWeight: 700,
  letterSpacing: '0.04em',
});

export const HeroTitle = style({
  margin: 0,
  color: '#142033',
  fontSize: 'clamp(2.45rem, 5.6vw, 4.5rem)',
  lineHeight: 1.06,
  letterSpacing: '-0.052em',
  fontWeight: 760,
  '@media': {
    'screen and (max-width: 420px)': {
      fontSize: '2.05rem',
      letterSpacing: '-0.035em',
    },
  },
});

export const HeroDescription = style({
  maxWidth: toRem(620),
  margin: 0,
  color: '#4d5d70',
  fontSize: 'clamp(1rem, 2vw, 1.16rem)',
  lineHeight: 1.75,
});

export const HeroTrustRow = style({
  color: '#425269',
  fontSize: toRem(14),
  fontWeight: 600,
});

export const PrimaryDownloadStack = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S200,
});

export const PrimaryDownloadCard = style([
  DefaultReset,
  {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S250,
    minWidth: 0,
    padding: toRem(22),
    color: '#fff',
    borderRadius: toRem(20),
    textDecoration: 'none',
    boxShadow: '0 18px 42px rgba(38, 55, 80, 0.2)',
    transition: 'transform 160ms ease, box-shadow 160ms ease',
    selectors: {
      '&:hover': {
        transform: 'translateY(-3px)',
        boxShadow: '0 24px 54px rgba(38, 55, 80, 0.25)',
        textDecoration: 'none',
      },
      '&:focus-visible': {
        outline: '3px solid rgba(255, 255, 255, 0.9)',
        outlineOffset: '3px',
      },
    },
    '@media': {
      'screen and (max-width: 420px)': {
        padding: config.space.S300,
        borderRadius: toRem(16),
      },
    },
  },
]);

export const WindowsDownloadCard = style({
  background: 'linear-gradient(135deg, #2167e8 0%, #1847ad 100%)',
});

export const AndroidDownloadCard = style({
  background: 'linear-gradient(135deg, #f05222 0%, #c62e12 100%)',
});

export const PrimaryPlatformIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: toRem(52),
  height: toRem(52),
  background: 'rgba(255, 255, 255, 0.16)',
  border: '1px solid rgba(255, 255, 255, 0.22)',
  borderRadius: toRem(16),
  '@media': {
    'screen and (max-width: 420px)': {
      width: toRem(44),
      height: toRem(44),
      borderRadius: toRem(13),
    },
  },
});

export const PrimaryDownloadLabel = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  minHeight: toRem(42),
  padding: `${toRem(9)} ${toRem(14)}`,
  background: 'rgba(255, 255, 255, 0.95)',
  color: '#17243a',
  borderRadius: toRem(12),
  fontSize: toRem(15),
  fontWeight: 750,
});

export const ReleaseLine = style({
  justifyContent: 'center',
  paddingTop: config.space.S50,
  color: '#536277',
});

export const ReleasePulse = style({
  width: toRem(8),
  height: toRem(8),
  borderRadius: '50%',
  background: '#20a85a',
  boxShadow: '0 0 0 4px rgba(32, 168, 90, 0.12)',
});

export const SecondarySection = style({
  paddingTop: toRem(64),
});

export const SectionHeading = style({ maxWidth: toRem(700) });

export const SecondaryGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: config.space.S300,
  marginTop: toRem(24),
  '@media': {
    'screen and (max-width: 750px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
});

export const SecondaryCard = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S300,
  minWidth: 0,
  padding: config.space.S400,
  background: color.Surface.Container,
  border: `1px solid ${color.Surface.ContainerLine}`,
  borderRadius: toRem(20),
  boxShadow: '0 12px 32px rgba(35, 52, 73, 0.07)',
  '@media': {
    'screen and (max-width: 620px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
      padding: config.space.S300,
    },
  },
});

export const SecondaryIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: toRem(52),
  height: toRem(52),
  borderRadius: toRem(16),
});

export const IosIcon = style({ color: '#252b35', background: '#eef1f5' });
export const WebIcon = style({ color: '#176c43', background: '#e6f6ed' });

export const GuidesSection = style({
  paddingTop: toRem(84),
  scrollMarginTop: toRem(74),
  '@media': {
    'screen and (max-width: 750px)': { paddingTop: toRem(56) },
  },
});

export const GuidesHeading = style({ maxWidth: toRem(760), margin: '0 auto' });

export const SectionKicker = style({
  color: color.Primary.Main,
  fontSize: toRem(13),
  fontWeight: 750,
  letterSpacing: '0.1em',
});

export const GuidePanel = style({
  marginTop: toRem(32),
  padding: toRem(32),
  scrollMarginTop: toRem(78),
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  border: `1px solid ${color.Surface.ContainerLine}`,
  borderRadius: toRem(24),
  boxShadow: '0 18px 50px rgba(35, 52, 73, 0.08)',
  '@media': {
    'screen and (max-width: 750px)': {
      padding: config.space.S300,
      borderRadius: toRem(20),
    },
    'screen and (max-width: 360px)': {
      padding: config.space.S200,
      borderRadius: toRem(16),
    },
  },
});

export const GuidePanelHeader = style({
  marginBottom: toRem(26),
  '@media': {
    'screen and (max-width: 680px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
  },
});

export const GuidePlatformIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: toRem(50),
  height: toRem(50),
  borderRadius: toRem(15),
});

export const WindowsGuideIcon = style({ color: '#1855c9', background: '#e7efff' });
export const IosGuideIcon = style({ color: '#222a35', background: '#edf0f4' });
export const AndroidGuideIcon = style({ color: '#b33413', background: '#ffebe3' });
export const WebGuideIcon = style({ color: '#176c43', background: '#e6f6ed' });

export const GuideGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: config.space.S300,
  '@media': {
    'screen and (max-width: 750px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
});

export const GuideStep = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  overflow: 'hidden',
  background: color.SurfaceVariant.Container,
  border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: toRem(18),
});

export const GuideStepHeading = style({ padding: config.space.S300 });

export const StepNumber = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: toRem(34),
  height: toRem(34),
  color: '#fff',
  background: '#2167e8',
  borderRadius: '50%',
  fontSize: toRem(16),
  fontWeight: 760,
  boxShadow: '0 7px 16px rgba(33, 103, 232, 0.28)',
});

export const GuideVisual = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexGrow: 1,
  minHeight: toRem(250),
  padding: config.space.S300,
  background: 'linear-gradient(135deg, rgba(247, 249, 252, 0.96), rgba(235, 240, 247, 0.96))',
  borderTop: '1px solid rgba(125, 141, 160, 0.13)',
  '@media': {
    'screen and (max-width: 480px)': { minHeight: toRem(220), padding: config.space.S200 },
  },
});

export const WindowFrame = style({
  width: '100%',
  maxWidth: toRem(440),
  overflow: 'hidden',
  background: '#fff',
  border: '1px solid rgba(74, 88, 108, 0.25)',
  borderRadius: toRem(12),
  boxShadow: '0 18px 42px rgba(46, 60, 80, 0.18)',
});

export const WindowTitleBar = style({
  display: 'flex',
  alignItems: 'center',
  gap: toRem(8),
  height: toRem(32),
  padding: `0 ${toRem(10)}`,
  color: '#3b4657',
  background: '#f6f7f9',
  borderBottom: '1px solid rgba(74, 88, 108, 0.14)',
  fontSize: toRem(11),
});

export const WindowAppDot = style({
  width: toRem(9),
  height: toRem(9),
  background: '#f05324',
  borderRadius: toRem(3),
});

export const WindowControls = style({ marginLeft: 'auto', color: '#606c7c' });
export const WindowBody = style({ color: '#202b3a' });

export const DownloadIllustration = style({
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: config.space.S200,
  width: '100%',
  maxWidth: toRem(430),
  padding: config.space.S300,
  color: '#263244',
  background: '#fff',
  border: '1px solid rgba(70, 88, 112, 0.16)',
  borderRadius: toRem(15),
  boxShadow: '0 14px 36px rgba(46, 60, 80, 0.14)',
  '@media': {
    'screen and (max-width: 480px)': {
      gridTemplateColumns: 'auto minmax(0, 1fr)',
    },
  },
});

export const DownloadFileIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: toRem(48),
  height: toRem(48),
  color: '#175bce',
  background: '#e8f0ff',
  borderRadius: toRem(14),
});

export const MockPrimaryButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `${toRem(9)} ${toRem(14)}`,
  color: '#fff',
  background: '#f04c1c',
  borderRadius: toRem(8),
  fontSize: toRem(12),
  fontWeight: 700,
  '@media': {
    'screen and (max-width: 480px)': { gridColumn: '1 / -1' },
  },
});

export const InstallerLayout = style({
  display: 'grid',
  gridTemplateColumns: '34% 66%',
  minHeight: toRem(188),
});
export const InstallerBrand = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(180deg, #f6f7f9, #fff)',
});
globalStyle(`${InstallerBrand} img`, { width: toRem(74), height: toRem(74) });
export const InstallerContent = style({ padding: config.space.S300 });
export const MockButtonRow = style({ marginTop: 'auto' });
export const MockMutedButton = style({
  padding: `${toRem(6)} ${toRem(12)}`,
  color: '#687385',
  background: '#eef0f3',
  borderRadius: toRem(5),
  fontSize: toRem(11),
});
export const MockOutlineButton = style({
  padding: `${toRem(6)} ${toRem(12)}`,
  color: '#1458c5',
  background: '#fff',
  border: '1px solid #2a72df',
  borderRadius: toRem(5),
  fontSize: toRem(11),
  fontWeight: 650,
});

export const LoginMock = style({
  width: '80%',
  margin: 'auto',
  padding: config.space.S300,
});
globalStyle(`${LoginMock} img`, { width: toRem(42), height: toRem(42) });
export const MockField = style({
  padding: `${toRem(8)} ${toRem(10)}`,
  color: '#7a8493',
  background: '#fff',
  border: '1px solid #d6dbe3',
  borderRadius: toRem(7),
  fontSize: toRem(11),
});
export const MockWideButton = style({ width: '100%' });
export const UpdateMock = style({
  padding: config.space.S300,
});
globalStyle(`${UpdateMock} img`, { width: toRem(42), height: toRem(42) });
export const UpdateStatus = style({
  padding: config.space.S200,
  background: '#f7f8fa',
  border: '1px solid #e1e4e9',
  borderRadius: toRem(9),
});

export const PhoneMock = style({
  width: toRem(210),
  maxWidth: '100%',
  overflow: 'hidden',
  color: '#1c2736',
  background: '#fff',
  border: '2px solid #aab1bb',
  borderRadius: toRem(28),
  boxShadow: '0 18px 42px rgba(46, 60, 80, 0.18)',
});
export const PhoneStatus = style({
  padding: `${toRem(8)} ${toRem(14)} ${toRem(5)}`,
  textAlign: 'center',
  fontSize: toRem(9),
  fontWeight: 650,
});
export const SafariAddress = style({
  margin: `0 ${toRem(9)}`,
  padding: toRem(7),
  textAlign: 'center',
  background: '#edf0f3',
  borderRadius: toRem(8),
  fontSize: toRem(9),
});
export const PhonePage = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(9),
  minHeight: toRem(142),
  padding: toRem(14),
});
globalStyle(`${PhonePage} img`, { width: toRem(25), height: toRem(25) });
export const PhoneTextLine = style({
  width: '45%',
  height: toRem(8),
  background: '#e5e8ed',
  borderRadius: toRem(4),
});
export const PhoneField = style({
  height: toRem(30),
  border: '1px solid #dde1e7',
  borderRadius: toRem(6),
});
export const SafariToolbar = style({
  padding: `${toRem(9)} ${toRem(12)}`,
  textAlign: 'center',
  color: '#1769de',
  background: '#f4f5f7',
  borderTop: '1px solid #dfe3e8',
  fontSize: toRem(12),
});

export const IosActionVisual = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: config.space.S200,
  width: '100%',
  maxWidth: toRem(440),
  '@media': { 'screen and (max-width: 420px)': { gridTemplateColumns: '1fr' } },
});
export const SafariToolbarLarge = style({
  display: 'flex',
  alignItems: 'end',
  justifyContent: 'center',
  minHeight: toRem(165),
  padding: config.space.S300,
  color: '#1769de',
  background: '#fff',
  border: '1px solid #cdd3dc',
  borderRadius: toRem(14),
  fontSize: toRem(18),
});
globalStyle(`${SafariToolbarLarge} span`, {
  padding: toRem(5),
  border: '2px solid #f04424',
  borderRadius: '50%',
});
export const IosMenu = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: toRem(3),
  padding: config.space.S200,
  color: '#293545',
  background: '#f6f7f9',
  border: '1px solid #cdd3dc',
  borderRadius: toRem(14),
  fontSize: toRem(12),
});
globalStyle(`${IosMenu} span, ${IosMenu} strong`, {
  padding: toRem(9),
  background: '#fff',
  borderRadius: toRem(7),
});
globalStyle(`${IosMenu} strong`, { border: '2px solid #f04424' });

export const ShareSheet = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(4),
  width: '100%',
  maxWidth: toRem(360),
  padding: config.space.S200,
  color: '#273242',
  background: 'rgba(248, 249, 251, 0.98)',
  border: '1px solid #cdd3dc',
  borderRadius: toRem(18),
  boxShadow: '0 18px 42px rgba(46, 60, 80, 0.16)',
  fontSize: toRem(12),
});
globalStyle(`${ShareSheet} span, ${ShareSheet} strong`, {
  padding: toRem(9),
  background: '#fff',
  borderRadius: toRem(8),
});
globalStyle(`${ShareSheet} strong`, { border: '2px solid #f04424' });
export const ShareApps = style({ textAlign: 'center', color: '#2a75dd', fontSize: toRem(22) });

export const AddHomeVisual = style({
  display: 'grid',
  gridTemplateColumns: '1.35fr 0.65fr',
  gap: config.space.S200,
  width: '100%',
  maxWidth: toRem(440),
  '@media': { 'screen and (max-width: 420px)': { gridTemplateColumns: '1fr' } },
});
export const AddHomeSheet = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S200,
  padding: config.space.S200,
  color: '#273242',
  background: '#fff',
  border: '1px solid #cdd3dc',
  borderRadius: toRem(14),
  fontSize: toRem(11),
});
globalStyle(`${AddHomeSheet} img`, {
  width: toRem(42),
  height: toRem(42),
  borderRadius: toRem(10),
});
export const AddHomeHeader = style({
  color: '#2775df',
  fontSize: toRem(10),
});
globalStyle(`${AddHomeHeader} strong`, { color: '#1769de' });
export const AddHomeSwitch = style({
  display: 'flex',
  justifyContent: 'space-between',
  padding: toRem(9),
  background: '#f4f5f7',
  borderRadius: toRem(8),
});
globalStyle(`${AddHomeSwitch} span`, { color: '#27b65f' });
export const HomeScreenMock = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: toRem(7),
  minHeight: toRem(180),
  color: '#fff',
  background: 'linear-gradient(160deg, #12276b, #c64262 58%, #ff922e)',
  borderRadius: toRem(16),
  fontSize: toRem(10),
});
globalStyle(`${HomeScreenMock} img`, {
  width: toRem(48),
  height: toRem(48),
  padding: toRem(5),
  background: '#fff',
  borderRadius: toRem(12),
});

export const CompactGuideGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: config.space.S300,
  marginTop: toRem(32),
  '@media': { 'screen and (max-width: 750px)': { gridTemplateColumns: 'minmax(0, 1fr)' } },
});
export const CompactGuide = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S300,
  scrollMarginTop: toRem(78),
  padding: config.space.S400,
  background: color.Surface.Container,
  border: `1px solid ${color.Surface.ContainerLine}`,
  borderRadius: toRem(20),
  boxShadow: '0 12px 32px rgba(35, 52, 73, 0.07)',
});
export const CompactSteps = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(10),
  color: color.Surface.OnContainer,
  fontSize: toRem(14),
});
globalStyle(`${CompactSteps} span`, { display: 'flex', alignItems: 'center', gap: toRem(9) });
globalStyle(`${CompactSteps} b`, {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: toRem(24),
  height: toRem(24),
  color: '#fff',
  background: '#2167e8',
  borderRadius: '50%',
  fontSize: toRem(11),
});

export const SupportStrip = style({
  marginTop: toRem(48),
  padding: config.space.S400,
  background: color.Primary.Container,
  color: color.Primary.OnContainer,
  border: `1px solid ${color.Primary.ContainerLine}`,
  borderRadius: toRem(20),
  '@media': {
    'screen and (max-width: 700px)': {
      padding: config.space.S300,
    },
  },
});
globalStyle(`${SupportStrip} > div`, {
  '@media': {
    'screen and (max-width: 700px)': {
      flexDirection: 'column',
    },
  },
});
export const SupportIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: toRem(42),
  height: toRem(42),
  background: 'rgba(255, 255, 255, 0.5)',
  borderRadius: toRem(12),
});
export const Footer = style({
  paddingTop: toRem(44),
  paddingBottom: toRem(8),
  textAlign: 'center',
  opacity: 0.68,
});
