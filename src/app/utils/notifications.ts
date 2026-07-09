import { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { isDesktopUpdaterSupported } from './desktopUpdater';
import { setOptimisticRoomReadMarker } from './room';

export type AppNotificationPermission = PermissionState;
export const ROOM_MARKED_AS_READ = 'cinny.room_marked_as_read';
const PENDING_ROOM_READ_MARKERS_STORAGE_KEY = 'cinny:pending-room-read-markers';

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

type PendingRoomReadMarker = {
  eventId: string;
  privateReceipt: boolean;
  ts?: number;
};

type PersistedPendingRoomReadMarker = {
  eventId?: unknown;
  privateReceipt?: unknown;
  ts?: unknown;
};

type PendingRoomReadMarkersByUser = Record<string, Record<string, PersistedPendingRoomReadMarker>>;

const pendingRoomReadMarkersFlushUserIds = new Set<string>();

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
  event: MatrixEvent;
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
        event,
        eventId,
        ts: typeof ts === 'number' ? ts : undefined,
      };
    }
  }

  return undefined;
};

const normalizePendingRoomReadMarker = (
  marker: PersistedPendingRoomReadMarker | undefined
): PendingRoomReadMarker | undefined => {
  if (!marker || typeof marker !== 'object' || typeof marker.eventId !== 'string') {
    return undefined;
  }

  return {
    eventId: marker.eventId,
    privateReceipt: marker.privateReceipt === true,
    ts: typeof marker.ts === 'number' ? marker.ts : undefined,
  };
};

const readPendingRoomReadMarkers = (): PendingRoomReadMarkersByUser => {
  if (typeof window === 'undefined') return {};

  try {
    const storage = window.localStorage.getItem(PENDING_ROOM_READ_MARKERS_STORAGE_KEY);
    if (!storage) return {};

    const parsed = JSON.parse(storage);
    return parsed && typeof parsed === 'object' ? (parsed as PendingRoomReadMarkersByUser) : {};
  } catch {
    return {};
  }
};

const writePendingRoomReadMarkers = (markersByUser: PendingRoomReadMarkersByUser) => {
  if (typeof window === 'undefined') return;

  try {
    if (Object.keys(markersByUser).length === 0) {
      window.localStorage.removeItem(PENDING_ROOM_READ_MARKERS_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(
      PENDING_ROOM_READ_MARKERS_STORAGE_KEY,
      JSON.stringify(markersByUser)
    );
  } catch {
    // ignore local storage errors
  }
};

const setPendingRoomReadMarker = (
  roomId: string,
  marker: PendingRoomReadMarker,
  userId?: string | null
) => {
  if (!userId) return;

  const markersByUser = readPendingRoomReadMarkers();
  markersByUser[userId] = {
    ...(markersByUser[userId] ?? {}),
    [roomId]: marker,
  };
  writePendingRoomReadMarkers(markersByUser);
};

const clearPendingRoomReadMarker = (
  roomId: string,
  userId?: string | null,
  eventId?: string
) => {
  if (!userId) return;

  const markersByUser = readPendingRoomReadMarkers();
  const userMarkers = markersByUser[userId];
  if (!userMarkers || !(roomId in userMarkers)) return;

  const pendingMarker = normalizePendingRoomReadMarker(userMarkers[roomId]);
  if (eventId && pendingMarker?.eventId !== eventId) return;

  delete userMarkers[roomId];

  if (Object.keys(userMarkers).length === 0) {
    delete markersByUser[userId];
  } else {
    markersByUser[userId] = userMarkers;
  }

  writePendingRoomReadMarkers(markersByUser);
};

const findRoomEvent = (
  mx: MatrixClient,
  roomId: string,
  eventId: string
): MatrixEvent | undefined => {
  const room = mx.getRoom(roomId);
  if (!room) return undefined;

  return (
    room.findEventById(eventId) ??
    room
      .getLiveTimeline()
      .getEvents()
      .find((event) => event.getId() === eventId)
  );
};

const sendRoomReadMarker = async (
  mx: MatrixClient,
  roomId: string,
  eventId: string,
  privateReceipt: boolean,
  event?: MatrixEvent
) => {
  if (event) {
    await mx.setRoomReadMarkers(
      roomId,
      eventId,
      privateReceipt ? undefined : event,
      privateReceipt ? event : undefined
    );
    return;
  }

  await mx.setRoomReadMarkersHttpRequest(
    roomId,
    eventId,
    privateReceipt ? undefined : eventId,
    privateReceipt ? eventId : undefined
  );
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
  const { event, eventId, ts } = latestEvent;
  const userId = mx.getUserId();

  setOptimisticRoomReadMarker(roomId, eventId, userId, ts);
  setPendingRoomReadMarker(roomId, { eventId, privateReceipt, ts }, userId);
  dispatchRoomMarkedAsRead(roomId);

  try {
    await sendRoomReadMarker(mx, roomId, eventId, privateReceipt, event);
    clearPendingRoomReadMarker(roomId, userId, eventId);
  } catch {
    // Ignore read marker failures so optimistic unread clearing still works locally.
  }
};

export const flushPendingRoomReadMarkers = async (mx: MatrixClient): Promise<void> => {
  const userId = mx.getUserId();
  if (!userId || pendingRoomReadMarkersFlushUserIds.has(userId)) return;

  const userMarkers = readPendingRoomReadMarkers()[userId];
  if (!userMarkers) return;

  pendingRoomReadMarkersFlushUserIds.add(userId);
  try {
    const pendingEntries = Object.entries(userMarkers);
    await Promise.allSettled(
      pendingEntries.map(async ([roomId, persistedMarker]) => {
        const marker = normalizePendingRoomReadMarker(persistedMarker);
        if (!marker) {
          clearPendingRoomReadMarker(roomId, userId);
          return;
        }

        const event = findRoomEvent(mx, roomId, marker.eventId);
        setOptimisticRoomReadMarker(roomId, marker.eventId, userId, marker.ts);
        dispatchRoomMarkedAsRead(roomId);

        try {
          await sendRoomReadMarker(mx, roomId, marker.eventId, marker.privateReceipt, event);
          clearPendingRoomReadMarker(roomId, userId, marker.eventId);
        } catch {
          // Keep the pending marker so a later sync/session can retry.
        }
      })
    );
  } finally {
    pendingRoomReadMarkersFlushUserIds.delete(userId);
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
