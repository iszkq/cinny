import { registerPlugin } from '@capacitor/core';
import { isAndroidApp } from './nativePlatform';

type NativeNotificationPermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';

type NativeNotificationPermissionResult = {
  notifications?: NativeNotificationPermissionState;
};

type NativeNotificationOptions = {
  title: string;
  body?: string;
  silent?: boolean;
};

interface NativeNotificationsPlugin {
  checkPermissions(): Promise<NativeNotificationPermissionResult>;
  requestPermissions(): Promise<NativeNotificationPermissionResult>;
  show(options: NativeNotificationOptions): Promise<void>;
}

const NativeNotifications = registerPlugin<NativeNotificationsPlugin>('NativeNotifications');

const normalizePermission = (permission?: NativeNotificationPermissionState): PermissionState => {
  if (permission === 'granted' || permission === 'denied') return permission;
  return 'prompt';
};

export const getNativeNotificationPermission = async (): Promise<PermissionState> => {
  if (!isAndroidApp()) return 'denied';

  const result = await NativeNotifications.checkPermissions();
  return normalizePermission(result.notifications);
};

export const requestNativeNotificationPermission = async (): Promise<PermissionState> => {
  if (!isAndroidApp()) return 'denied';

  const result = await NativeNotifications.requestPermissions();
  return normalizePermission(result.notifications);
};

export const showNativeNotification = async (options: NativeNotificationOptions): Promise<void> => {
  if (!isAndroidApp()) return;
  await NativeNotifications.show(options);
};
