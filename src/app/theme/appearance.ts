import chroma from 'chroma-js';
import { color } from 'folds';
import type { ThemeKind } from '../hooks/useTheme';
import type { InterfaceStyle } from '../state/settings';
import { THEME_DEFAULT_ACCENT_ID } from './appearanceShared';

export const CLIENT_ROOT_BG_VAR = '--cinny-client-root-bg';
export const CLIENT_SHELL_BG_VAR = '--cinny-client-shell-bg';
export const CLIENT_SHELL_BORDER_VAR = '--cinny-client-shell-border';
export const CLIENT_SHELL_SHADOW_VAR = '--cinny-client-shell-shadow';
export const CLIENT_SHELL_BACKDROP_VAR = '--cinny-client-shell-backdrop';
export const NAV_RAIL_BG_VAR = '--cinny-nav-rail-bg';
export const NAV_RAIL_BORDER_VAR = '--cinny-nav-rail-border';
export const CONTENT_BG_VAR = '--cinny-content-bg';
export const PAGE_NAV_BG_VAR = '--cinny-page-nav-bg';
export const PAGE_NAV_BORDER_VAR = '--cinny-page-nav-border';
export const PAGE_HEADER_BG_VAR = '--cinny-page-header-bg';
export const CARD_BG_VAR = '--cinny-card-bg';
export const CARD_BORDER_VAR = '--cinny-card-border';
export const CARD_SHADOW_VAR = '--cinny-card-shadow';
export const CARD_BACKDROP_VAR = '--cinny-card-backdrop';
export const BUBBLE_SELF_BG_VAR = '--cinny-bubble-self-bg';
export const BUBBLE_SELF_TEXT_VAR = '--cinny-bubble-self-text';
export const BUBBLE_SELF_BORDER_VAR = '--cinny-bubble-self-border';
export const BUBBLE_SELF_SHADOW_VAR = '--cinny-bubble-self-shadow';
export const BUBBLE_SELF_BACKDROP_VAR = '--cinny-bubble-self-backdrop';
export const BUBBLE_OTHER_BG_VAR = '--cinny-bubble-other-bg';
export const BUBBLE_OTHER_TEXT_VAR = '--cinny-bubble-other-text';
export const BUBBLE_OTHER_BORDER_VAR = '--cinny-bubble-other-border';
export const BUBBLE_OTHER_SHADOW_VAR = '--cinny-bubble-other-shadow';
export const BUBBLE_OTHER_BACKDROP_VAR = '--cinny-bubble-other-backdrop';

export type AppearanceColorPreset = {
  id: string;
  label: string;
  value: string;
};

export const appearanceColorPresets: AppearanceColorPreset[] = [
  { id: 'violet', label: 'Violet', value: '#5B34C7' },
  { id: 'red', label: 'Red', value: '#E8513D' },
  { id: 'rose', label: 'Rose', value: '#D9386D' },
  { id: 'orchid', label: 'Orchid', value: '#9437B6' },
  { id: 'indigo', label: 'Indigo', value: '#6645C2' },
  { id: 'cobalt', label: 'Cobalt', value: '#4E5CBF' },
  { id: 'blue', label: 'Blue', value: '#4D8FE3' },
  { id: 'sky', label: 'Sky', value: '#4FA0E3' },
  { id: 'cyan', label: 'Cyan', value: '#58B4CC' },
  { id: 'teal', label: 'Teal', value: '#4A9B8E' },
  { id: 'green', label: 'Green', value: '#68AE57' },
  { id: 'lime', label: 'Lime', value: '#9BC152' },
  { id: 'chartreuse', label: 'Chartreuse', value: '#D3E04A' },
  { id: 'yellow', label: 'Yellow', value: '#F9E65D' },
  { id: 'amber', label: 'Amber', value: '#F7C648' },
  { id: 'orange', label: 'Orange', value: '#F6A032' },
  { id: 'tangerine', label: 'Tangerine', value: '#F26731' },
  { id: 'brown', label: 'Brown', value: '#806050' },
  { id: 'slate', label: 'Slate', value: '#708595' },
];

const DEFAULT_ACCENT_COLOR = 'violet';
const DEFAULT_OUTGOING_BUBBLE_COLOR = 'teal';
const DEFAULT_INCOMING_BUBBLE_COLOR = 'slate';
const DEFAULT_OPACITY = 100;

type AccentColorTokens = {
  main: string;
  mainHover: string;
  mainActive: string;
  mainLine: string;
  onMain: string;
  container: string;
  containerHover: string;
  containerActive: string;
  containerLine: string;
  onContainer: string;
  focusRing: string;
};

type BubbleTokens = {
  background: string;
  text: string;
  border: string;
  shadow: string;
  backdrop: string;
};

type ChromeTokens = Record<string, string>;

const tint = (base: string, accent: string, amount: number): string =>
  chroma.mix(base, accent, amount, 'lab').hex();

const PRIMARY_COLOR_VAR_REFS = [
  color.Primary.Main,
  color.Primary.MainHover,
  color.Primary.MainActive,
  color.Primary.MainLine,
  color.Primary.OnMain,
  color.Primary.Container,
  color.Primary.ContainerHover,
  color.Primary.ContainerActive,
  color.Primary.ContainerLine,
  color.Primary.OnContainer,
  color.Other.FocusRing,
] as const;

const withAlpha = (value: string, alpha: number): string => chroma(value).alpha(alpha).css();
const clampOpacityRatio = (opacity?: number): number => {
  if (typeof opacity !== 'number' || Number.isNaN(opacity)) {
    return DEFAULT_OPACITY / 100;
  }

  return Math.min(1, Math.max(0, opacity / 100));
};
const withOptionalAlpha = (value: string, opacityRatio: number): string =>
  opacityRatio >= 0.999 ? value : withAlpha(value, opacityRatio);

const clampContrastText = (background: string): string =>
  chroma.contrast(background, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#111827';

const getCssVariableName = (value: string): string => {
  const match = value.match(/^var\((--[^)]+)\)$/);
  return match ? match[1] : value;
};

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const isThemeDefaultAccent = (presetId?: string): boolean => presetId === THEME_DEFAULT_ACCENT_ID;

const getThemePrimaryColorHex = (themeClassNames?: string[]): string | undefined => {
  if (typeof document === 'undefined' || !document.body || !themeClassNames?.length) {
    return undefined;
  }

  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.width = '0';
  probe.style.height = '0';
  probe.style.opacity = '0';
  probe.style.pointerEvents = 'none';
  probe.style.overflow = 'hidden';
  probe.classList.add(...themeClassNames);

  document.body.appendChild(probe);
  const computedValue = getComputedStyle(probe)
    .getPropertyValue(getCssVariableName(color.Primary.Main))
    .trim();
  probe.remove();

  if (!computedValue || !chroma.valid(computedValue)) {
    return undefined;
  }

  return chroma(computedValue).hex();
};

const getPresetHex = (presetId: string | undefined, fallbackId: string): string =>
  (presetId && HEX_COLOR_RE.test(presetId) && chroma.valid(presetId)
    ? chroma(presetId).hex()
    : undefined) ??
  appearanceColorPresets.find((preset) => preset.id === presetId)?.value ??
  appearanceColorPresets.find((preset) => preset.id === fallbackId)?.value ??
  appearanceColorPresets[0].value;

export const getAccentColorHex = (presetId?: string, themeClassNames?: string[]): string =>
  (isThemeDefaultAccent(presetId) ? getThemePrimaryColorHex(themeClassNames) : undefined) ??
  getPresetHex(presetId, DEFAULT_ACCENT_COLOR);

export const getOutgoingBubbleColorHex = (presetId?: string): string =>
  getPresetHex(presetId, DEFAULT_OUTGOING_BUBBLE_COLOR);

export const getIncomingBubbleColorHex = (presetId?: string): string =>
  getPresetHex(presetId, DEFAULT_INCOMING_BUBBLE_COLOR);

export const createAccentColorTokens = (
  accentColorHex: string,
  themeKind: ThemeKind,
  accentOpacity?: number
): AccentColorTokens => {
  const base = chroma(accentColorHex);
  const opacityRatio = clampOpacityRatio(accentOpacity);

  if (themeKind === 'dark') {
    const main = chroma.mix(base, '#FFFFFF', 0.28, 'lab').hex();
    const container = chroma.mix(base, '#0F172A', 0.72, 'lab').hex();

    return {
      main: withOptionalAlpha(main, opacityRatio),
      mainHover: withOptionalAlpha(chroma(main).brighten(0.16).hex(), opacityRatio),
      mainActive: withOptionalAlpha(chroma(main).darken(0.18).hex(), opacityRatio),
      mainLine: withOptionalAlpha(chroma(main).darken(0.35).hex(), opacityRatio),
      onMain: chroma.contrast(main, '#111827') >= 4.5 ? '#111827' : '#F8FAFC',
      container: withOptionalAlpha(container, opacityRatio),
      containerHover: withOptionalAlpha(chroma(container).brighten(0.12).hex(), opacityRatio),
      containerActive: withOptionalAlpha(chroma(container).brighten(0.22).hex(), opacityRatio),
      containerLine: withOptionalAlpha(chroma(container).brighten(0.32).hex(), opacityRatio),
      onContainer: chroma.mix(main, '#FFFFFF', 0.68, 'lab').hex(),
      focusRing: withAlpha(main, 0.42 * opacityRatio),
    };
  }

  const main = base.hex();
  const container = chroma.mix(base, '#FFFFFF', 0.84, 'lab').hex();

  return {
    main: withOptionalAlpha(main, opacityRatio),
    mainHover: withOptionalAlpha(chroma(main).darken(0.08).hex(), opacityRatio),
    mainActive: withOptionalAlpha(chroma(main).darken(0.18).hex(), opacityRatio),
    mainLine: withOptionalAlpha(chroma(main).darken(0.3).hex(), opacityRatio),
    onMain: clampContrastText(main),
    container: withOptionalAlpha(container, opacityRatio),
    containerHover: withOptionalAlpha(chroma.mix(base, '#FFFFFF', 0.8, 'lab').hex(), opacityRatio),
    containerActive: withOptionalAlpha(
      chroma.mix(base, '#FFFFFF', 0.76, 'lab').hex(),
      opacityRatio
    ),
    containerLine: withOptionalAlpha(chroma.mix(base, '#FFFFFF', 0.7, 'lab').hex(), opacityRatio),
    onContainer: chroma(base).darken(1.4).hex(),
    focusRing: withAlpha(main, 0.35 * opacityRatio),
  };
};

const createBubbleTokens = (
  baseColorHex: string,
  tone: 'self' | 'other',
  interfaceStyle: InterfaceStyle,
  themeKind: ThemeKind,
  bubbleOpacity?: number
): BubbleTokens => {
  const base = chroma(baseColorHex);
  const frosted = interfaceStyle === 'frosted';
  const opacityRatio = clampOpacityRatio(bubbleOpacity);

  if (tone === 'self') {
    const solid = themeKind === 'dark' ? chroma.mix(base, '#FFFFFF', 0.12, 'lab') : base;
    const background = frosted
      ? withAlpha(solid.hex(), (themeKind === 'dark' ? 0.68 : 0.8) * opacityRatio)
      : withOptionalAlpha(solid.hex(), opacityRatio);

    return {
      background,
      text: clampContrastText(solid.hex()),
      border: frosted
        ? withAlpha(
            themeKind === 'dark' ? '#F8FAFC' : '#FFFFFF',
            (themeKind === 'dark' ? 0.14 : 0.38) * opacityRatio
          )
        : withAlpha(
            chroma(solid).darken(0.5).hex(),
            (themeKind === 'dark' ? 0.32 : 0.18) * opacityRatio
          ),
      shadow: frosted
        ? themeKind === 'dark'
          ? '0 14px 34px rgba(2, 6, 23, 0.32)'
          : '0 14px 34px rgba(110, 128, 117, 0.16)'
        : themeKind === 'dark'
          ? '0 8px 22px rgba(2, 6, 23, 0.2)'
          : '0 8px 18px rgba(31, 41, 35, 0.08)',
      backdrop: frosted ? 'blur(18px) saturate(175%)' : 'none',
    };
  }

  const solid =
    themeKind === 'dark'
      ? chroma.mix(base, '#0F172A', 0.68, 'lab')
      : chroma.mix(base, '#FFFFFF', 0.78, 'lab');
  const background = frosted
    ? withAlpha(solid.hex(), (themeKind === 'dark' ? 0.64 : 0.74) * opacityRatio)
    : withOptionalAlpha(solid.hex(), opacityRatio);

  return {
    background,
    text: clampContrastText(solid.hex()),
    border: frosted
      ? withAlpha(
          themeKind === 'dark' ? '#F8FAFC' : '#FFFFFF',
          (themeKind === 'dark' ? 0.12 : 0.32) * opacityRatio
        )
      : withAlpha(
          chroma(solid).darken(0.7).hex(),
          (themeKind === 'dark' ? 0.28 : 0.12) * opacityRatio
        ),
    shadow: frosted
      ? themeKind === 'dark'
        ? '0 12px 28px rgba(2, 6, 23, 0.28)'
        : '0 12px 28px rgba(110, 128, 117, 0.12)'
      : themeKind === 'dark'
        ? '0 6px 18px rgba(2, 6, 23, 0.18)'
        : '0 6px 16px rgba(31, 41, 35, 0.06)',
    backdrop: frosted ? 'blur(16px) saturate(165%)' : 'none',
  };
};

export const createInterfaceChromeTokens = (
  interfaceStyle: InterfaceStyle,
  themeKind: ThemeKind,
  accentColorHex: string,
  accentOpacity?: number
): ChromeTokens => {
  const dark = themeKind === 'dark';
  const frosted = interfaceStyle === 'frosted';
  const opacityRatio = clampOpacityRatio(accentOpacity);
  const tintStrength = opacityRatio;

  if (frosted) {
    const rootTop = dark
      ? tint('#070A10', accentColorHex, 0.12 * tintStrength)
      : tint('#F0F7F4', accentColorHex, 0.12 * tintStrength);
    const rootBottom = dark
      ? tint('#0C121A', accentColorHex, 0.14 * tintStrength)
      : tint('#E5EFEA', accentColorHex, 0.16 * tintStrength);
    const shellBase = dark
      ? tint('#0A0F17', accentColorHex, 0.16 * tintStrength)
      : tint('#FFFFFF', accentColorHex, 0.14 * tintStrength);
    const railBase = dark
      ? tint('#0D131C', accentColorHex, 0.18 * tintStrength)
      : tint('#ECF4F0', accentColorHex, 0.18 * tintStrength);
    const contentBase = dark
      ? tint('#0C121B', accentColorHex, 0.1 * tintStrength)
      : tint('#FAFDFC', accentColorHex, 0.1 * tintStrength);
    const navBase = dark
      ? tint('#0F161F', accentColorHex, 0.14 * tintStrength)
      : tint('#F4F9F7', accentColorHex, 0.16 * tintStrength);
    const cardBase = dark
      ? tint('#121923', accentColorHex, 0.16 * tintStrength)
      : tint('#FFFFFF', accentColorHex, 0.18 * tintStrength);

    return {
      [CLIENT_ROOT_BG_VAR]: `linear-gradient(180deg, ${withAlpha(rootTop, 0.98)} 0%, ${withAlpha(rootBottom, 0.98)} 100%)`,
      [CLIENT_SHELL_BG_VAR]: withAlpha(shellBase, dark ? 0.64 : 0.68),
      [CLIENT_SHELL_BORDER_VAR]: dark
        ? withAlpha(accentColorHex, 0.18 * opacityRatio)
        : withAlpha(accentColorHex, 0.22 * opacityRatio),
      [CLIENT_SHELL_SHADOW_VAR]: dark
        ? '0 22px 58px rgba(0, 0, 0, 0.45)'
        : '0 22px 58px rgba(125, 145, 132, 0.18)',
      [CLIENT_SHELL_BACKDROP_VAR]: 'blur(24px) saturate(175%)',
      [NAV_RAIL_BG_VAR]: withAlpha(railBase, dark ? 0.62 : 0.66),
      [NAV_RAIL_BORDER_VAR]: dark
        ? withAlpha(accentColorHex, 0.14 * opacityRatio)
        : withAlpha(accentColorHex, 0.18 * opacityRatio),
      [CONTENT_BG_VAR]: withAlpha(contentBase, dark ? 0.52 : 0.6),
      [PAGE_NAV_BG_VAR]: withAlpha(navBase, dark ? 0.6 : 0.64),
      [PAGE_NAV_BORDER_VAR]: dark
        ? withAlpha(accentColorHex, 0.14 * opacityRatio)
        : withAlpha(accentColorHex, 0.18 * opacityRatio),
      [PAGE_HEADER_BG_VAR]: withAlpha(navBase, dark ? 0.58 : 0.64),
      [CARD_BG_VAR]: withAlpha(cardBase, dark ? 0.62 : 0.62),
      [CARD_BORDER_VAR]: dark
        ? withAlpha(accentColorHex, 0.18 * opacityRatio)
        : withAlpha(accentColorHex, 0.2 * opacityRatio),
      [CARD_SHADOW_VAR]: dark
        ? '0 14px 36px rgba(0, 0, 0, 0.32)'
        : '0 14px 36px rgba(132, 149, 138, 0.14)',
      [CARD_BACKDROP_VAR]: 'blur(20px) saturate(180%)',
    };
  }

  const rootTop = dark
    ? tint('#080B10', accentColorHex, 0.08 * tintStrength)
    : tint('#F4F7F5', accentColorHex, 0.1 * tintStrength);
  const rootBottom = dark
    ? tint('#0C1218', accentColorHex, 0.1 * tintStrength)
    : tint('#ECF2EE', accentColorHex, 0.14 * tintStrength);
  const shellBase = dark
    ? tint('#0C1218', accentColorHex, 0.1 * tintStrength)
    : tint('#FFFFFF', accentColorHex, 0.08 * tintStrength);
  const railTop = dark
    ? tint('#0F161D', accentColorHex, 0.16 * tintStrength)
    : tint('#E2EBE4', accentColorHex, 0.18 * tintStrength);
  const railBottom = dark
    ? tint('#121B22', accentColorHex, 0.18 * tintStrength)
    : tint('#D6E2D9', accentColorHex, 0.2 * tintStrength);
  const contentBase = dark
    ? tint('#0B1016', accentColorHex, 0.06 * tintStrength)
    : tint('#FAFCFA', accentColorHex, 0.08 * tintStrength);
  const navBase = dark
    ? tint('#0F161D', accentColorHex, 0.12 * tintStrength)
    : tint('#F4F7F4', accentColorHex, 0.12 * tintStrength);
  const cardBase = dark
    ? tint('#262C34', accentColorHex, 0.1 * tintStrength)
    : tint('#FFFFFF', accentColorHex, 0.05 * tintStrength);

  return {
    [CLIENT_ROOT_BG_VAR]: `linear-gradient(180deg, ${withAlpha(rootTop, 0.98)} 0%, ${withAlpha(rootBottom, 0.98)} 100%)`,
    [CLIENT_SHELL_BG_VAR]: withAlpha(shellBase, dark ? 0.94 : 0.92),
    [CLIENT_SHELL_BORDER_VAR]: dark
      ? withAlpha(accentColorHex, 0.18 * opacityRatio)
      : withAlpha(accentColorHex, 0.14 * opacityRatio),
    [CLIENT_SHELL_SHADOW_VAR]: dark
      ? '0 18px 44px rgba(0, 0, 0, 0.34)'
      : '0 18px 44px rgba(31, 41, 35, 0.12)',
    [CLIENT_SHELL_BACKDROP_VAR]: dark ? 'none' : 'blur(14px)',
    [NAV_RAIL_BG_VAR]: `linear-gradient(180deg, ${withAlpha(railTop, dark ? 0.98 : 0.96)} 0%, ${withAlpha(railBottom, dark ? 0.98 : 0.96)} 100%)`,
    [NAV_RAIL_BORDER_VAR]: dark
      ? withAlpha(accentColorHex, 0.16 * opacityRatio)
      : withAlpha(accentColorHex, 0.14 * opacityRatio),
    [CONTENT_BG_VAR]: withAlpha(contentBase, dark ? 0.96 : 0.94),
    [PAGE_NAV_BG_VAR]: withAlpha(navBase, dark ? 0.94 : 0.92),
    [PAGE_NAV_BORDER_VAR]: dark
      ? withAlpha(accentColorHex, 0.14 * opacityRatio)
      : withAlpha(accentColorHex, 0.12 * opacityRatio),
    [PAGE_HEADER_BG_VAR]: withAlpha(contentBase, dark ? 0.96 : 0.94),
    [CARD_BG_VAR]: withAlpha(cardBase, dark ? 0.94 : 0.98),
    [CARD_BORDER_VAR]: dark
      ? withAlpha(accentColorHex, 0.14 * opacityRatio)
      : withAlpha(accentColorHex, 0.1 * opacityRatio),
    [CARD_SHADOW_VAR]: 'none',
    [CARD_BACKDROP_VAR]: 'none',
  };
};

const buildPrimaryVarMap = (
  accentColorHex: string,
  themeKind: ThemeKind,
  accentOpacity?: number
): Record<string, string> => {
  const tokens = createAccentColorTokens(accentColorHex, themeKind, accentOpacity);

  return {
    [getCssVariableName(PRIMARY_COLOR_VAR_REFS[0])]: tokens.main,
    [getCssVariableName(PRIMARY_COLOR_VAR_REFS[1])]: tokens.mainHover,
    [getCssVariableName(PRIMARY_COLOR_VAR_REFS[2])]: tokens.mainActive,
    [getCssVariableName(PRIMARY_COLOR_VAR_REFS[3])]: tokens.mainLine,
    [getCssVariableName(PRIMARY_COLOR_VAR_REFS[4])]: tokens.onMain,
    [getCssVariableName(PRIMARY_COLOR_VAR_REFS[5])]: tokens.container,
    [getCssVariableName(PRIMARY_COLOR_VAR_REFS[6])]: tokens.containerHover,
    [getCssVariableName(PRIMARY_COLOR_VAR_REFS[7])]: tokens.containerActive,
    [getCssVariableName(PRIMARY_COLOR_VAR_REFS[8])]: tokens.containerLine,
    [getCssVariableName(PRIMARY_COLOR_VAR_REFS[9])]: tokens.onContainer,
    [getCssVariableName(PRIMARY_COLOR_VAR_REFS[10])]: tokens.focusRing,
  };
};

export const APPEARANCE_MANAGED_VARS = [
  CLIENT_ROOT_BG_VAR,
  CLIENT_SHELL_BG_VAR,
  CLIENT_SHELL_BORDER_VAR,
  CLIENT_SHELL_SHADOW_VAR,
  CLIENT_SHELL_BACKDROP_VAR,
  NAV_RAIL_BG_VAR,
  NAV_RAIL_BORDER_VAR,
  CONTENT_BG_VAR,
  PAGE_NAV_BG_VAR,
  PAGE_NAV_BORDER_VAR,
  PAGE_HEADER_BG_VAR,
  CARD_BG_VAR,
  CARD_BORDER_VAR,
  CARD_SHADOW_VAR,
  CARD_BACKDROP_VAR,
  BUBBLE_SELF_BG_VAR,
  BUBBLE_SELF_TEXT_VAR,
  BUBBLE_SELF_BORDER_VAR,
  BUBBLE_SELF_SHADOW_VAR,
  BUBBLE_SELF_BACKDROP_VAR,
  BUBBLE_OTHER_BG_VAR,
  BUBBLE_OTHER_TEXT_VAR,
  BUBBLE_OTHER_BORDER_VAR,
  BUBBLE_OTHER_SHADOW_VAR,
  BUBBLE_OTHER_BACKDROP_VAR,
  ...PRIMARY_COLOR_VAR_REFS.map(getCssVariableName),
];

export const createAppearanceVariableMap = ({
  interfaceStyle,
  accentColorId,
  accentOpacity,
  outgoingBubbleColorId,
  outgoingBubbleOpacity,
  incomingBubbleColorId,
  incomingBubbleOpacity,
  themeKind,
  themeClassNames,
}: {
  interfaceStyle: InterfaceStyle;
  accentColorId: string;
  accentOpacity: number;
  outgoingBubbleColorId: string;
  outgoingBubbleOpacity: number;
  incomingBubbleColorId: string;
  incomingBubbleOpacity: number;
  themeKind: ThemeKind;
  themeClassNames?: string[];
}): Record<string, string> => {
  const accentColorHex = getAccentColorHex(accentColorId, themeClassNames);
  const chromeTokens = createInterfaceChromeTokens(
    interfaceStyle,
    themeKind,
    accentColorHex,
    accentOpacity
  );
  const primaryTokens =
    isThemeDefaultAccent(accentColorId) && clampOpacityRatio(accentOpacity) >= 0.999
      ? {}
      : buildPrimaryVarMap(accentColorHex, themeKind, accentOpacity);
  const outgoingBubble = createBubbleTokens(
    getOutgoingBubbleColorHex(outgoingBubbleColorId),
    'self',
    interfaceStyle,
    themeKind,
    outgoingBubbleOpacity
  );
  const incomingBubble = createBubbleTokens(
    getIncomingBubbleColorHex(incomingBubbleColorId),
    'other',
    interfaceStyle,
    themeKind,
    incomingBubbleOpacity
  );

  return {
    ...chromeTokens,
    ...primaryTokens,
    [BUBBLE_SELF_BG_VAR]: outgoingBubble.background,
    [BUBBLE_SELF_TEXT_VAR]: outgoingBubble.text,
    [BUBBLE_SELF_BORDER_VAR]: outgoingBubble.border,
    [BUBBLE_SELF_SHADOW_VAR]: outgoingBubble.shadow,
    [BUBBLE_SELF_BACKDROP_VAR]: outgoingBubble.backdrop,
    [BUBBLE_OTHER_BG_VAR]: incomingBubble.background,
    [BUBBLE_OTHER_TEXT_VAR]: incomingBubble.text,
    [BUBBLE_OTHER_BORDER_VAR]: incomingBubble.border,
    [BUBBLE_OTHER_SHADOW_VAR]: incomingBubble.shadow,
    [BUBBLE_OTHER_BACKDROP_VAR]: incomingBubble.backdrop,
  };
};

export const getPreviewBubbleStyle = ({
  interfaceStyle,
  themeKind,
  tone,
  colorId,
  opacity,
}: {
  interfaceStyle: InterfaceStyle;
  themeKind: ThemeKind;
  tone: 'self' | 'other';
  colorId: string;
  opacity: number;
}): BubbleTokens =>
  createBubbleTokens(
    tone === 'self' ? getOutgoingBubbleColorHex(colorId) : getIncomingBubbleColorHex(colorId),
    tone,
    interfaceStyle,
    themeKind,
    opacity
  );

export const getPreviewChromeStyle = (
  interfaceStyle: InterfaceStyle,
  themeKind: ThemeKind,
  accentColorId?: string,
  accentOpacity?: number,
  themeClassNames?: string[]
): ChromeTokens =>
  createInterfaceChromeTokens(
    interfaceStyle,
    themeKind,
    getAccentColorHex(accentColorId, themeClassNames),
    accentOpacity
  );
