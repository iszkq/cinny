import { MatrixClient } from 'matrix-js-sdk';
import { isDesktopUpdaterSupported } from './desktopUpdater';
import { setOptimisticRoomReadMarker } from './room';

export type AppNotificationPermission = PermissionState;
export const ROOM_MARKED_AS_READ = 'cinny.room_marked_as_read';

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

const dispatchRoomMarkedAsRead = (roomId: string) => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<{ roomId: string }>(ROOM_MARKED_AS_READ, {
      detail: { roomId },
    })
  );
};

type LatestRoomEvent = {
  eventId: string;
  ts?: number;
};

const getLatestRoomEvent = (mx: MatrixClient, roomId: string): LatestRoomEvent | undefined => {
  const room = mx.getRoom(roomId);
  if (!room) return undefined;

  const events = room.getLiveTimeline().getEvents();
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const eventId = event?.getId();
    if (eventId) {
      const ts = event?.getTs();
      return {
        eventId,
        ts: typeof ts === 'number' ? ts : undefined,
      };
    }
  }

  return undefined;
};

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

export const markAsRead = async (
  mx: MatrixClient,
  roomId: string,
  privateReceipt = false
): Promise<void> => {
  const latestEvent = getLatestRoomEvent(mx, roomId);
  if (!latestEvent) return;
  const { eventId, ts } = latestEvent;

  setOptimisticRoomReadMarker(roomId, eventId, mx.getUserId(), ts);
  dispatchRoomMarkedAsRead(roomId);

  try {
    await mx.setRoomReadMarkers(
      roomId,
      eventId,
      privateReceipt ? undefined : eventId,
      privateReceipt ? eventId : undefined
    );
  } catch {
    // Ignore read marker failures so optimistic unread clearing still works locally.
  }
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
      return undefined;
    }

    const payload: DesktopNotificationPayload = { title };
    if (body) payload.body = body;
    if (silent) payload.silent = true;

    try {
      await invokeDesktopNotificationCommand('send_desktop_notification', { payload });
    } catch {
      // Ignore notification delivery failures to avoid breaking message flow.
    }
    return undefined;
  }

  if (
    !canUseWebNotifications() ||
    normalizePermission(window.Notification.permission) !== 'granted'
  ) {
    return undefined;
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
