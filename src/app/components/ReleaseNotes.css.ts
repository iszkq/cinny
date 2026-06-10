import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const ReleaseNotes = style({
  minWidth: 0,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
  selectors: {
    '& h1, & h2, & h3, & h4, & h5, & h6': {
      margin: `${config.space.S200} 0 ${config.space.S100}`,
      fontSize: toRem(15),
      lineHeight: toRem(22),
      fontWeight: 600,
    },
    '& h1:first-child, & h2:first-child, & h3:first-child, & h4:first-child, & h5:first-child, & h6:first-child':
      {
        marginTop: 0,
      },
    '& p': {
      margin: 0,
      lineHeight: toRem(20),
    },
    '& ul, & ol': {
      margin: `${config.space.S100} 0`,
      paddingInlineStart: config.space.S500,
    },
    '& li': {
      margin: `${toRem(2)} 0`,
    },
    '& li p': {
      margin: 0,
    },
    '& a': {
      color: color.Primary.Main,
    },
    '& blockquote': {
      margin: `${config.space.S100} 0`,
      paddingInlineStart: config.space.S200,
      borderLeft: `${config.borderWidth.B500} solid ${color.SurfaceVariant.ContainerLine}`,
      color: color.SurfaceVariant.OnContainer,
    },
    '& pre': {
      maxWidth: '100%',
      margin: `${config.space.S100} 0`,
      padding: config.space.S200,
      overflowX: 'auto',
      borderRadius: config.radii.R300,
      background: color.SurfaceVariant.Container,
      border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
    },
    '& code': {
      fontFamily: 'monospace',
      fontSize: toRem(12),
    },
    '& img': {
      maxWidth: '100%',
      height: 'auto',
      borderRadius: config.radii.R300,
    },
  },
});

export const CompactReleaseNotes = style({
  fontSize: toRem(13),
  lineHeight: toRem(20),
  selectors: {
    '& h1, & h2, & h3, & h4, & h5, & h6': {
      fontSize: toRem(14),
      lineHeight: toRem(20),
    },
    '& p, & li': {
      fontSize: toRem(13),
      lineHeight: toRem(20),
    },
  },
});
