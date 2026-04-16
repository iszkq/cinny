import { atom } from 'jotai';
import { SetPresence } from 'matrix-js-sdk';

const STORAGE_KEY = 'settings';
export type DateFormat =
  | 'D MMM YYYY'
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'YYYY/MM/DD'
  | 'YYYY-MM-DD'
  | '';
export type MessageSpacing = '0' | '100' | '200' | '300' | '400' | '500';
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

const defaultSettings: Settings = {
  themeId: undefined,
  useSystemTheme: true,
  lightThemeId: undefined,
  darkThemeId: undefined,
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

export const getSettings = () => {
  const settings = localStorage.getItem(STORAGE_KEY);
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

const baseSettings = atom<Settings>(getSettings());
export const settingsAtom = atom<Settings, [Settings], undefined>(
  (get) => get(baseSettings),
  (get, set, update) => {
    set(baseSettings, update);
    setSettings(update);
  }
);
