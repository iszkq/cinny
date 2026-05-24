import chroma from 'chroma-js';
import { color } from 'folds';
import type { ThemeKind } from '../hooks/useTheme';
import type { InterfaceStyle } from '../state/settings';

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

const clampContrastText = (background: string): string =>
  chroma.contrast(background, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#111827';

const getCssVariableName = (value: string): string => {
  const match = value.match(/^var\((--[^)]+)\)$/);
  return match ? match[1] : value;
};

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const getPresetHex = (presetId: string | undefined, fallbackId: string): string =>
  (presetId && HEX_COLOR_RE.test(presetId) && chroma.valid(presetId)
    ? chroma(presetId).hex()
    : undefined) ??
  appearanceColorPresets.find((preset) => preset.id === presetId)?.value ??
  appearanceColorPresets.find((preset) => preset.id === fallbackId)?.value ??
  appearanceColorPresets[0].value;

export const getAccentColorHex = (presetId?: string): string =>
  getPresetHex(presetId, DEFAULT_ACCENT_COLOR);

export const getOutgoingBubbleColorHex = (presetId?: string): string =>
  getPresetHex(presetId, DEFAULT_OUTGOING_BUBBLE_COLOR);

export const getIncomingBubbleColorHex = (presetId?: string): string =>
  getPresetHex(presetId, DEFAULT_INCOMING_BUBBLE_COLOR);

export const createAccentColorTokens = (
  accentColorHex: string,
  themeKind: ThemeKind
): AccentColorTokens => {
  const base = chroma(accentColorHex);

  if (themeKind === 'dark') {
    const main = chroma.mix(base, '#FFFFFF', 0.28, 'lab').hex();
    const container = chroma.mix(base, '#0F172A', 0.72, 'lab').hex();

    return {
      main,
      mainHover: chroma(main).brighten(0.16).hex(),
      mainActive: chroma(main).darken(0.18).hex(),
      mainLine: chroma(main).darken(0.35).hex(),
      onMain: chroma.contrast(main, '#111827') >= 4.5 ? '#111827' : '#F8FAFC',
      container,
      containerHover: chroma(container).brighten(0.12).hex(),
      containerActive: chroma(container).brighten(0.22).hex(),
      containerLine: chroma(container).brighten(0.32).hex(),
      onContainer: chroma.mix(main, '#FFFFFF', 0.68, 'lab').hex(),
      focusRing: withAlpha(main, 0.42),
    };
  }

  const main = base.hex();
  const container = chroma.mix(base, '#FFFFFF', 0.84, 'lab').hex();

  return {
    main,
    mainHover: chroma(main).darken(0.08).hex(),
    mainActive: chroma(main).darken(0.18).hex(),
    mainLine: chroma(main).darken(0.3).hex(),
    onMain: clampContrastText(main),
    container,
    containerHover: chroma.mix(base, '#FFFFFF', 0.8, 'lab').hex(),
    containerActive: chroma.mix(base, '#FFFFFF', 0.76, 'lab').hex(),
    containerLine: chroma.mix(base, '#FFFFFF', 0.7, 'lab').hex(),
    onContainer: chroma(base).darken(1.4).hex(),
    focusRing: withAlpha(main, 0.35),
  };
};

const createBubbleTokens = (
  baseColorHex: string,
  tone: 'self' | 'other',
  interfaceStyle: InterfaceStyle,
  themeKind: ThemeKind
): BubbleTokens => {
  const base = chroma(baseColorHex);
  const frosted = interfaceStyle === 'frosted';

  if (tone === 'self') {
    const solid = themeKind === 'dark' ? chroma.mix(base, '#FFFFFF', 0.12, 'lab') : base;
    const background = frosted
      ? withAlpha(solid.hex(), themeKind === 'dark' ? 0.68 : 0.8)
      : solid.hex();

    return {
      background,
      text: clampContrastText(solid.hex()),
      border: frosted
        ? withAlpha(
            themeKind === 'dark' ? '#F8FAFC' : '#FFFFFF',
            themeKind === 'dark' ? 0.14 : 0.38
          )
        : withAlpha(
            chroma(solid).darken(0.5).hex(),
            themeKind === 'dark' ? 0.32 : 0.18
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
    ? withAlpha(solid.hex(), themeKind === 'dark' ? 0.64 : 0.74)
    : solid.hex();

  return {
    background,
    text: clampContrastText(solid.hex()),
    border: frosted
      ? withAlpha(
          themeKind === 'dark' ? '#F8FAFC' : '#FFFFFF',
          themeKind === 'dark' ? 0.12 : 0.32
        )
      : withAlpha(chroma(solid).darken(0.7).hex(), themeKind === 'dark' ? 0.28 : 0.12),
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
  themeKind: ThemeKind
): ChromeTokens => {
  const dark = themeKind === 'dark';
  const frosted = interfaceStyle === 'frosted';

  if (frosted) {
    return {
      [CLIENT_ROOT_BG_VAR]: dark
        ? 'linear-gradient(180deg, rgba(7, 10, 16, 0.98) 0%, rgba(12, 18, 26, 0.98) 100%)'
        : 'linear-gradient(180deg, rgba(240, 247, 244, 0.98) 0%, rgba(229, 239, 234, 0.98) 100%)',
      [CLIENT_SHELL_BG_VAR]: dark ? 'rgba(10, 15, 23, 0.58)' : 'rgba(255, 255, 255, 0.62)',
      [CLIENT_SHELL_BORDER_VAR]: dark
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(255, 255, 255, 0.42)',
      [CLIENT_SHELL_SHADOW_VAR]: dark
        ? '0 22px 58px rgba(0, 0, 0, 0.45)'
        : '0 22px 58px rgba(125, 145, 132, 0.18)',
      [CLIENT_SHELL_BACKDROP_VAR]: 'blur(24px) saturate(175%)',
      [NAV_RAIL_BG_VAR]: dark ? 'rgba(13, 19, 28, 0.5)' : 'rgba(236, 244, 240, 0.58)',
      [NAV_RAIL_BORDER_VAR]: dark
        ? 'rgba(255, 255, 255, 0.06)'
        : 'rgba(255, 255, 255, 0.38)',
      [CONTENT_BG_VAR]: dark ? 'rgba(12, 18, 27, 0.48)' : 'rgba(250, 253, 252, 0.56)',
      [PAGE_NAV_BG_VAR]: dark ? 'rgba(15, 22, 31, 0.54)' : 'rgba(244, 249, 247, 0.58)',
      [PAGE_NAV_BORDER_VAR]: dark
        ? 'rgba(255, 255, 255, 0.06)'
        : 'rgba(255, 255, 255, 0.34)',
      [PAGE_HEADER_BG_VAR]: dark ? 'rgba(15, 22, 31, 0.5)' : 'rgba(250, 253, 252, 0.58)',
      [CARD_BG_VAR]: dark ? 'rgba(18, 25, 35, 0.56)' : 'rgba(255, 255, 255, 0.54)',
      [CARD_BORDER_VAR]: dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.42)',
      [CARD_SHADOW_VAR]: dark
        ? '0 14px 36px rgba(0, 0, 0, 0.32)'
        : '0 14px 36px rgba(132, 149, 138, 0.14)',
      [CARD_BACKDROP_VAR]: 'blur(20px) saturate(180%)',
    };
  }

  return {
    [CLIENT_ROOT_BG_VAR]: dark
      ? 'linear-gradient(180deg, rgba(8, 11, 16, 0.98) 0%, rgba(12, 18, 24, 0.98) 100%)'
      : 'linear-gradient(180deg, rgba(244, 247, 245, 0.98) 0%, rgba(236, 242, 238, 0.98) 100%)',
    [CLIENT_SHELL_BG_VAR]: dark ? 'rgba(12, 18, 24, 0.94)' : 'rgba(255, 255, 255, 0.92)',
    [CLIENT_SHELL_BORDER_VAR]: dark ? 'rgba(69, 81, 91, 0.38)' : 'rgba(103, 122, 110, 0.12)',
    [CLIENT_SHELL_SHADOW_VAR]: dark
      ? '0 18px 44px rgba(0, 0, 0, 0.34)'
      : '0 18px 44px rgba(31, 41, 35, 0.12)',
    [CLIENT_SHELL_BACKDROP_VAR]: dark ? 'none' : 'blur(14px)',
    [NAV_RAIL_BG_VAR]: dark
      ? 'linear-gradient(180deg, rgba(15, 22, 29, 0.98) 0%, rgba(18, 27, 34, 0.98) 100%)'
      : 'linear-gradient(180deg, rgba(226, 235, 228, 0.96) 0%, rgba(214, 226, 217, 0.96) 100%)',
    [NAV_RAIL_BORDER_VAR]: dark ? 'rgba(65, 76, 86, 0.4)' : 'rgba(110, 128, 117, 0.14)',
    [CONTENT_BG_VAR]: dark ? 'rgba(11, 16, 22, 0.96)' : 'rgba(250, 252, 250, 0.94)',
    [PAGE_NAV_BG_VAR]: dark ? 'rgba(15, 22, 29, 0.94)' : 'rgba(244, 247, 244, 0.92)',
    [PAGE_NAV_BORDER_VAR]: dark ? 'rgba(68, 78, 88, 0.36)' : 'rgba(114, 131, 120, 0.10)',
    [PAGE_HEADER_BG_VAR]: dark ? 'rgba(12, 18, 24, 0.96)' : 'rgba(250, 252, 250, 0.94)',
    [CARD_BG_VAR]: dark
      ? 'var(--bg-surface-variant, rgba(38, 44, 52, 0.94))'
      : 'var(--bg-surface-variant, rgba(255, 255, 255, 1))',
    [CARD_BORDER_VAR]: 'transparent',
    [CARD_SHADOW_VAR]: 'none',
    [CARD_BACKDROP_VAR]: 'none',
  };
};

const buildPrimaryVarMap = (
  accentColorId: string,
  themeKind: ThemeKind
): Record<string, string> => {
  const tokens = createAccentColorTokens(getAccentColorHex(accentColorId), themeKind);

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
  outgoingBubbleColorId,
  incomingBubbleColorId,
  themeKind,
}: {
  interfaceStyle: InterfaceStyle;
  accentColorId: string;
  outgoingBubbleColorId: string;
  incomingBubbleColorId: string;
  themeKind: ThemeKind;
}): Record<string, string> => {
  const chromeTokens = createInterfaceChromeTokens(interfaceStyle, themeKind);
  const primaryTokens = buildPrimaryVarMap(accentColorId, themeKind);
  const outgoingBubble = createBubbleTokens(
    getOutgoingBubbleColorHex(outgoingBubbleColorId),
    'self',
    interfaceStyle,
    themeKind
  );
  const incomingBubble = createBubbleTokens(
    getIncomingBubbleColorHex(incomingBubbleColorId),
    'other',
    interfaceStyle,
    themeKind
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
}: {
  interfaceStyle: InterfaceStyle;
  themeKind: ThemeKind;
  tone: 'self' | 'other';
  colorId: string;
}): BubbleTokens =>
  createBubbleTokens(
    tone === 'self' ? getOutgoingBubbleColorHex(colorId) : getIncomingBubbleColorHex(colorId),
    tone,
    interfaceStyle,
    themeKind
  );

export const getPreviewChromeStyle = (
  interfaceStyle: InterfaceStyle,
  themeKind: ThemeKind
): ChromeTokens => createInterfaceChromeTokens(interfaceStyle, themeKind);
