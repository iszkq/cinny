import { CinnyAppearanceSettingsContent } from '../../types/matrix/accountData';
import { Settings, defaultSettings } from './settings';

const APPEARANCE_ACCOUNT_DATA_VERSION = 1;

type SyncedAppearanceSettings = Pick<
  Settings,
  | 'themeId'
  | 'useSystemTheme'
  | 'lightThemeId'
  | 'darkThemeId'
  | 'interfaceStyle'
  | 'accentColorId'
  | 'accentOpacity'
  | 'outgoingBubbleColorId'
  | 'outgoingBubbleOpacity'
  | 'incomingBubbleColorId'
  | 'incomingBubbleOpacity'
  | 'chatBackgroundMediaMxc'
  | 'monochromeMode'
>;

const normalizeAppearanceSettings = (
  source?: Partial<SyncedAppearanceSettings> | CinnyAppearanceSettingsContent
) => ({
  themeId: source?.themeId ?? null,
  useSystemTheme: source?.useSystemTheme ?? defaultSettings.useSystemTheme,
  lightThemeId: source?.lightThemeId ?? null,
  darkThemeId: source?.darkThemeId ?? null,
  interfaceStyle: source?.interfaceStyle ?? defaultSettings.interfaceStyle,
  accentColorId: source?.accentColorId ?? defaultSettings.accentColorId,
  accentOpacity: source?.accentOpacity ?? defaultSettings.accentOpacity,
  outgoingBubbleColorId:
    source?.outgoingBubbleColorId ?? defaultSettings.outgoingBubbleColorId,
  outgoingBubbleOpacity:
    source?.outgoingBubbleOpacity ?? defaultSettings.outgoingBubbleOpacity,
  incomingBubbleColorId:
    source?.incomingBubbleColorId ?? defaultSettings.incomingBubbleColorId,
  incomingBubbleOpacity:
    source?.incomingBubbleOpacity ?? defaultSettings.incomingBubbleOpacity,
  chatBackgroundMediaMxc: source?.chatBackgroundMediaMxc ?? null,
  monochromeMode: source?.monochromeMode ?? defaultSettings.monochromeMode ?? false,
});

export const DEFAULT_APPEARANCE_ACCOUNT_DATA_SIGNATURE = JSON.stringify(
  normalizeAppearanceSettings(defaultSettings)
);

export const getAppearanceAccountDataSignature = (
  source?: Partial<SyncedAppearanceSettings> | CinnyAppearanceSettingsContent
): string | undefined => {
  if (!source) {
    return undefined;
  }

  return JSON.stringify(normalizeAppearanceSettings(source));
};

export const getAppearanceAccountDataContent = (
  settings: Settings
): CinnyAppearanceSettingsContent => ({
  version: APPEARANCE_ACCOUNT_DATA_VERSION,
  updatedAt: Date.now(),
  ...normalizeAppearanceSettings(settings),
  themeId: settings.themeId,
  lightThemeId: settings.lightThemeId,
  darkThemeId: settings.darkThemeId,
  chatBackgroundMediaMxc: settings.chatBackgroundMediaMxc,
});

export const applyAppearanceAccountData = (
  settings: Settings,
  content?: CinnyAppearanceSettingsContent
): Settings => {
  if (!content) {
    return settings;
  }

  return {
    ...settings,
    themeId: content.themeId ?? settings.themeId,
    useSystemTheme: content.useSystemTheme ?? settings.useSystemTheme,
    lightThemeId: content.lightThemeId ?? settings.lightThemeId,
    darkThemeId: content.darkThemeId ?? settings.darkThemeId,
    interfaceStyle: content.interfaceStyle ?? settings.interfaceStyle,
    accentColorId: content.accentColorId ?? settings.accentColorId,
    accentOpacity: content.accentOpacity ?? settings.accentOpacity,
    outgoingBubbleColorId:
      content.outgoingBubbleColorId ?? settings.outgoingBubbleColorId,
    outgoingBubbleOpacity:
      content.outgoingBubbleOpacity ?? settings.outgoingBubbleOpacity,
    incomingBubbleColorId:
      content.incomingBubbleColorId ?? settings.incomingBubbleColorId,
    incomingBubbleOpacity:
      content.incomingBubbleOpacity ?? settings.incomingBubbleOpacity,
    chatBackgroundMediaMxc:
      content.chatBackgroundMediaMxc ?? settings.chatBackgroundMediaMxc,
    monochromeMode: content.monochromeMode ?? settings.monochromeMode,
  };
};
