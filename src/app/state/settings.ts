import { atom } from 'jotai';
import { SetPresence } from 'matrix-js-sdk';
import { THEME_DEFAULT_ACCENT_ID } from '../theme/appearanceShared';
import { SETTINGS_STORAGE_KEY } from './settingsStorage';
export type DateFormat =
  | 'D MMM YYYY'
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'YYYY/MM/DD'
  | 'YYYY-MM-DD'
  | '';
export type MessageSpacing = '0' | '100' | '200' | '300' | '400' | '500';
export type InterfaceStyle = 'default' | 'frosted';
export enum MessageLayout {
  Modern = 0,
  Compact = 1,
  Bubble = 2,
}
export const PresenceVisibility = SetPresence;
export type PresenceVisibility = SetPresence;

export interface Settings {
  themeId?: string;
  useSystemTheme: boolean;
  lightThemeId?: string;
  darkThemeId?: string;
  interfaceStyle: InterfaceStyle;
  accentColorId: string;
  accentOpacity: number;
  outgoingBubbleColorId: string;
  outgoingBubbleOpacity: number;
  incomingBubbleColorId: string;
  incomingBubbleOpacity: number;
  chatBackgroundDataUrl?: string;
  chatBackgroundMediaMxc?: string;
  monochromeMode?: boolean;
  isMarkdown: boolean;
  editorToolbar: boolean;
  twitterEmoji: boolean;
  pageZoom: number;
  readReceiptAvatarCount: number;
  presenceVisibility: PresenceVisibility;
  sendTypingNotifications: boolean;
  sendReadReceipts: boolean;

  isPeopleDrawer: boolean;
  memberSortFilterIndex: number;
  enterForNewline: boolean;
  messageLayout: MessageLayout;
  messageSpacing: MessageSpacing;
  hideMembershipEvents: boolean;
  hideNickAvatarEvents: boolean;
  mediaAutoLoad: boolean;
  urlPreview: boolean;
  encUrlPreview: boolean;
  showHiddenEvents: boolean;
  legacyUsernameColor: boolean;

  showNotifications: boolean;
  isNotificationSounds: boolean;

  hour24Clock: boolean;
  dateFormatString: string;

  developerTools: boolean;
}

export const defaultSettings: Settings = {
  themeId: undefined,
  useSystemTheme: true,
  lightThemeId: undefined,
  darkThemeId: undefined,
  interfaceStyle: 'default',
  accentColorId: THEME_DEFAULT_ACCENT_ID,
  accentOpacity: 100,
  outgoingBubbleColorId: 'teal',
  outgoingBubbleOpacity: 100,
  incomingBubbleColorId: 'slate',
  incomingBubbleOpacity: 100,
  chatBackgroundDataUrl: undefined,
  chatBackgroundMediaMxc: undefined,
  monochromeMode: false,
  isMarkdown: true,
  editorToolbar: false,
  twitterEmoji: false,
  pageZoom: 100,
  readReceiptAvatarCount: 7,
  presenceVisibility: PresenceVisibility.Online,
  sendTypingNotifications: true,
  sendReadReceipts: true,

  isPeopleDrawer: true,
  memberSortFilterIndex: 0,
  enterForNewline: false,
  messageLayout: MessageLayout.Bubble,
  messageSpacing: '400',
  hideMembershipEvents: false,
  hideNickAvatarEvents: true,
  mediaAutoLoad: true,
  urlPreview: true,
  encUrlPreview: false,
  showHiddenEvents: false,
  legacyUsernameColor: false,

  showNotifications: true,
  isNotificationSounds: true,

  hour24Clock: true,
  dateFormatString: 'D MMM YYYY',

  developerTools: false,
};

export const defaultAppearanceSettings = {
  interfaceStyle: defaultSettings.interfaceStyle,
  accentColorId: defaultSettings.accentColorId,
  accentOpacity: defaultSettings.accentOpacity,
  outgoingBubbleColorId: defaultSettings.outgoingBubbleColorId,
  outgoingBubbleOpacity: defaultSettings.outgoingBubbleOpacity,
  incomingBubbleColorId: defaultSettings.incomingBubbleColorId,
  incomingBubbleOpacity: defaultSettings.incomingBubbleOpacity,
  chatBackgroundDataUrl: defaultSettings.chatBackgroundDataUrl,
  chatBackgroundMediaMxc: defaultSettings.chatBackgroundMediaMxc,
} satisfies Pick<
  Settings,
  | 'interfaceStyle'
  | 'accentColorId'
  | 'accentOpacity'
  | 'outgoingBubbleColorId'
  | 'outgoingBubbleOpacity'
  | 'incomingBubbleColorId'
  | 'incomingBubbleOpacity'
  | 'chatBackgroundDataUrl'
  | 'chatBackgroundMediaMxc'
>;

export const getSettings = () => {
  const settings = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (settings === null) return defaultSettings;

  const {
    hideActivity,
    ...storedSettings
  } = JSON.parse(settings) as Partial<Settings> & { hideActivity?: boolean };

  return {
    ...defaultSettings,
    ...storedSettings,
    presenceVisibility:
      storedSettings.presenceVisibility ??
      (hideActivity === true
        ? PresenceVisibility.Offline
        : defaultSettings.presenceVisibility),
    sendTypingNotifications:
      storedSettings.sendTypingNotifications ??
      (typeof hideActivity === 'boolean'
        ? !hideActivity
        : defaultSettings.sendTypingNotifications),
    sendReadReceipts:
      storedSettings.sendReadReceipts ??
      (typeof hideActivity === 'boolean'
        ? !hideActivity
        : defaultSettings.sendReadReceipts),
  };
};

export const setSettings = (settings: Settings) => {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
};

const baseSettings = atom<Settings>(getSettings());
export const settingsAtom = atom<Settings, [Settings], undefined>(
  (get) => get(baseSettings),
  (get, set, update) => {
    set(baseSettings, update);
    setSettings(update);
  }
);
