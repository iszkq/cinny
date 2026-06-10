import { globalStyle, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const ReleaseNotes = style({
  minWidth: 0,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
});

export const CompactReleaseNotes = style({
  fontSize: toRem(13),
  lineHeight: toRem(20),
});

const releaseNotesHeadingSelector = `${ReleaseNotes} h1, ${ReleaseNotes} h2, ${ReleaseNotes} h3, ${ReleaseNotes} h4, ${ReleaseNotes} h5, ${ReleaseNotes} h6`;
const releaseNotesFirstHeadingSelector = `${ReleaseNotes} h1:first-child, ${ReleaseNotes} h2:first-child, ${ReleaseNotes} h3:first-child, ${ReleaseNotes} h4:first-child, ${ReleaseNotes} h5:first-child, ${ReleaseNotes} h6:first-child`;
const compactReleaseNotesHeadingSelector = `${CompactReleaseNotes} h1, ${CompactReleaseNotes} h2, ${CompactReleaseNotes} h3, ${CompactReleaseNotes} h4, ${CompactReleaseNotes} h5, ${CompactReleaseNotes} h6`;

globalStyle(releaseNotesHeadingSelector, {
  margin: `${config.space.S200} 0 ${config.space.S100}`,
  fontSize: toRem(15),
  lineHeight: toRem(22),
  fontWeight: 600,
});

globalStyle(releaseNotesFirstHeadingSelector, {
  marginTop: 0,
});

globalStyle(`${ReleaseNotes} p`, {
  margin: 0,
  lineHeight: toRem(20),
});

globalStyle(`${ReleaseNotes} ul, ${ReleaseNotes} ol`, {
  margin: `${config.space.S100} 0`,
  paddingInlineStart: config.space.S500,
});

globalStyle(`${ReleaseNotes} li`, {
  margin: `${toRem(2)} 0`,
});

globalStyle(`${ReleaseNotes} li p`, {
  margin: 0,
});

globalStyle(`${ReleaseNotes} a`, {
  color: color.Primary.Main,
});

globalStyle(`${ReleaseNotes} blockquote`, {
  margin: `${config.space.S100} 0`,
  paddingInlineStart: config.space.S200,
  borderLeft: `${config.borderWidth.B500} solid ${color.SurfaceVariant.ContainerLine}`,
  color: color.SurfaceVariant.OnContainer,
});

globalStyle(`${ReleaseNotes} pre`, {
  maxWidth: '100%',
  margin: `${config.space.S100} 0`,
  padding: config.space.S200,
  overflowX: 'auto',
  borderRadius: config.radii.R300,
  background: color.SurfaceVariant.Container,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
});

globalStyle(`${ReleaseNotes} code`, {
  fontFamily: 'monospace',
  fontSize: toRem(12),
});

globalStyle(`${ReleaseNotes} img`, {
  maxWidth: '100%',
  height: 'auto',
  borderRadius: config.radii.R300,
});

globalStyle(compactReleaseNotesHeadingSelector, {
  fontSize: toRem(14),
  lineHeight: toRem(20),
});

globalStyle(`${CompactReleaseNotes} p, ${CompactReleaseNotes} li`, {
  fontSize: toRem(13),
  lineHeight: toRem(20),
});
