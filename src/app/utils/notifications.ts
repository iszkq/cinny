import { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { isDesktopUpdaterSupported } from './desktopUpdater';
import { setOptimisticRoomReadMarker } from './room';

export type AppNotificationPermission = PermissionState;
export const ROOM_MARKED_AS_READ = 'cinny.room_marked_as_read';
const PENDING_ROOM_READ_MARKERS_STORAGE_KEY = 'cinny:pending-room-read-markers';
const MARKED_UNREAD_EVENT_TYPE = 'm.marked_unread';
const PRIVATE_READ_RECEIPT_STABLE_VERSION = 'v1.4';
const PRIVATE_READ_RECEIPT_UNSTABLE_FEATURE = 'org.matrix.msc2285.stable';

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

type MarkedUnreadContent = {
  unread?: boolean;
};

const pendingRoomReadMarkersFlushUserIds = new Set<string>();
const privateReadReceiptSupport = new WeakMap<MatrixClient, Promise<boolean>>();
const markedUnreadClearRequests = new Map<string, Promise<void>>();
const roomReadMarkerRequestChains = new Map<string, Promise<void>>();
const latestScheduledRoomReadMarkerSignatures = new Map<string, string>();
const successfulRoomReadMarkerSignatures = new Map<string, string>();

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
    // Local echoes have temporary IDs which the homeserver cannot accept as read markers.
    if (!event?.status) {
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

const clearPendingRoomReadMarker = (roomId: string, userId?: string | null, eventId?: string) => {
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

const supportsPrivateReadReceipts = (mx: MatrixClient): Promise<boolean> => {
  const cachedSupport = privateReadReceiptSupport.get(mx);
  if (cachedSupport) return cachedSupport;

  const supportRequest = (async () => {
    try {
      if (await mx.isVersionSupported(PRIVATE_READ_RECEIPT_STABLE_VERSION)) return true;
      return await mx.doesServerSupportUnstableFeature(PRIVATE_READ_RECEIPT_UNSTABLE_FEATURE);
    } catch {
      // If capability discovery is unavailable, retain the current private-receipt attempt.
      return true;
    }
  })();

  privateReadReceiptSupport.set(mx, supportRequest);
  return supportRequest;
};

const clearRoomMarkedUnread = (mx: MatrixClient, roomId: string): Promise<void> => {
  const room = mx.getRoom(roomId);
  const markedUnread = room?.accountData
    .get(MARKED_UNREAD_EVENT_TYPE)
    ?.getContent<MarkedUnreadContent>()?.unread;
  if (markedUnread !== true) return Promise.resolve();

  const requestKey = `${mx.getUserId() ?? ''}\u0000${roomId}`;
  const activeRequest = markedUnreadClearRequests.get(requestKey);
  if (activeRequest) return activeRequest;

  const request = mx
    .setRoomAccountData(roomId, MARKED_UNREAD_EVENT_TYPE, { unread: false })
    .then(() => undefined)
    .finally(() => markedUnreadClearRequests.delete(requestKey));
  markedUnreadClearRequests.set(requestKey, request);
  return request;
};

const sendRoomReadMarker = async (
  mx: MatrixClient,
  roomId: string,
  eventId: string,
  privateReceipt: boolean,
  event?: MatrixEvent
) => {
  const usePrivateReceipt = privateReceipt && (await supportsPrivateReadReceipts(mx));

  if (event) {
    await mx.setRoomReadMarkers(
      roomId,
      eventId,
      privateReceipt ? undefined : event,
      usePrivateReceipt ? event : undefined
    );
    return;
  }

  await mx.setRoomReadMarkersHttpRequest(
    roomId,
    eventId,
    privateReceipt ? undefined : eventId,
    usePrivateReceipt ? eventId : undefined
  );
};

const sendRoomReadMarkerOnce = async (
  mx: MatrixClient,
  roomId: string,
  eventId: string,
  privateReceipt: boolean,
  event: MatrixEvent | undefined,
  userId?: string | null
): Promise<void> => {
  const requestKey = `${userId ?? ''}\u0000${roomId}`;
  const signature = `${eventId}\u0000${privateReceipt ? 'private' : 'public'}`;

  if (successfulRoomReadMarkerSignatures.get(requestKey) === signature) {
    clearPendingRoomReadMarker(roomId, userId, eventId);
    return;
  }

  const activeRequest = roomReadMarkerRequestChains.get(requestKey);
  if (activeRequest && latestScheduledRoomReadMarkerSignatures.get(requestKey) === signature) {
    await activeRequest;
    return;
  }

  latestScheduledRoomReadMarkerSignatures.set(requestKey, signature);
  const previousRequest = activeRequest ?? Promise.resolve();
  const request = previousRequest
    .catch(() => undefined)
    .then(async () => {
      // Several live events can arrive while a request is in flight. Skip intermediate markers
      // and send only the newest queued event, while preserving request order per room.
      if (latestScheduledRoomReadMarkerSignatures.get(requestKey) !== signature) return;
      if (successfulRoomReadMarkerSignatures.get(requestKey) === signature) {
        clearPendingRoomReadMarker(roomId, userId, eventId);
        return;
      }

      await sendRoomReadMarker(mx, roomId, eventId, privateReceipt, event);
      successfulRoomReadMarkerSignatures.set(requestKey, signature);
      clearPendingRoomReadMarker(roomId, userId, eventId);
    })
    .finally(() => {
      if (latestScheduledRoomReadMarkerSignatures.get(requestKey) === signature) {
        latestScheduledRoomReadMarkerSignatures.delete(requestKey);
        roomReadMarkerRequestChains.delete(requestKey);
      }
    });

  roomReadMarkerRequestChains.set(requestKey, request);
  await request;
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
    await sendRoomReadMarkerOnce(mx, roomId, eventId, privateReceipt, event, userId);
  } catch {
    // Ignore read marker failures so optimistic unread clearing still works locally.
  }

  try {
    await clearRoomMarkedUnread(mx, roomId);
  } catch {
    // A stale manual-unread marker can be retried the next time this room is read.
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
          const currentPendingMarker = normalizePendingRoomReadMarker(
            readPendingRoomReadMarkers()[userId]?.[roomId]
          );
          if (currentPendingMarker?.eventId === marker.eventId) {
            await sendRoomReadMarkerOnce(
              mx,
              roomId,
              marker.eventId,
              marker.privateReceipt,
              event,
              userId
            );
          }
        } catch {
          // Keep the pending marker so a later sync/session can retry.
        }

        try {
          await clearRoomMarkedUnread(mx, roomId);
        } catch {
          // Retry when a later read/flush occurs.
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
