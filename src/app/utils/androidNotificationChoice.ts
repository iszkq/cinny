export const ANDROID_NOTIFICATION_CHOICE_KEY = 'calculator:android-notifications-choice-v1';
export const hasAndroidNotificationChoice = (): boolean => {
  try {
    return localStorage.getItem(ANDROID_NOTIFICATION_CHOICE_KEY) !== null;
  } catch {
    return false;
  }
};
export const saveAndroidNotificationChoice = (enabled: boolean) => {
  try {
    localStorage.setItem(ANDROID_NOTIFICATION_CHOICE_KEY, enabled ? 'enabled' : 'disabled');
  } catch {
    /* In-memory setting still applies. */
  }
};
