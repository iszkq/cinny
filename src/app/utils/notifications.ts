import { isDesktopUpdaterSupported } from './desktopUpdater';

export type AppNotificationPermission = PermissionState;

type DesktopNotificationPayload = {
  title: string;
  body?: string;
  silent?: boolean;
};

type AppNotificationOptions = {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  silent?: boolean;
  onClick?: () => void;
};

const normalizePermission = (permission: string): AppNotificationPermission => {
  if (permission === 'granted' || permission === 'denied') {
    return permission;
  }

  return 'prompt';
};

const canUseWebNotifications = (): boolean =>
  typeof window !== 'undefined' && 'Notification' in window;

const invokeDesktopNotificationCommand = async <T>(
  command: string,
  payload?: Record<string, unknown>
): Promise<T> => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, payload);
};

export const getNotificationState = (): AppNotificationPermission => {
  if (isDesktopUpdaterSupported()) {
    return 'prompt';
  }

  if (canUseWebNotifications()) {
    return normalizePermission(window.Notification.permission);
  }

  return 'denied';
};

export const getDesktopNotificationState = async (): Promise<AppNotificationPermission> => {
  if (!isDesktopUpdaterSupported()) {
    return getNotificationState();
  }

  try {
    const permission = await invokeDesktopNotificationCommand<string>(
      'desktop_notification_permission_state'
    );
    return normalizePermission(permission);
  } catch {
    return getNotificationState();
  }
};

export const requestNotificationPermission = async (): Promise<AppNotificationPermission> => {
  if (isDesktopUpdaterSupported()) {
    try {
      const permission = await invokeDesktopNotificationCommand<string>(
        'request_desktop_notification_permission'
      );
      return normalizePermission(permission);
    } catch {
      return getNotificationState();
    }
  }

  if (!canUseWebNotifications()) {
    return 'denied';
  }

  const permission = await window.Notification.requestPermission();
  return normalizePermission(permission);
};

export const sendAppNotification = async ({
  title,
  body,
  icon,
  badge,
  silent,
  onClick,
}: AppNotificationOptions): Promise<Notification | void> => {
  if (isDesktopUpdaterSupported()) {
    const permission = await getDesktopNotificationState();
    if (permission !== 'granted') {
      return;
    }

    const payload: DesktopNotificationPayload = { title };
    if (body) payload.body = body;
    if (silent) payload.silent = true;

    try {
      await invokeDesktopNotificationCommand('send_desktop_notification', { payload });
    } catch {
      // Ignore notification delivery failures to avoid breaking message flow.
    }
    return;
  }

  if (!canUseWebNotifications() || normalizePermission(window.Notification.permission) !== 'granted') {
    return;
  }

  const notification = new window.Notification(title, {
    icon,
    badge,
    body,
    silent,
  });

  if (onClick) {
    notification.onclick = () => {
      onClick();
      notification.close();
    };
  }

  return notification;
};
