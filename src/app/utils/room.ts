import { IconName, IconSrc } from 'folds';
import parse from 'html-dom-parser';
import { ChildNode, isTag, isText } from 'domhandler';

import {
  EventTimeline,
  EventTimelineSet,
  EventType,
  IMentions,
  IPowerLevelsContent,
  IPushRule,
  IPushRules,
  JoinRule,
  MatrixClient,
  MatrixEvent,
  MsgType,
  NotificationCountType,
  RelationType,
  Room,
  RoomMember,
} from 'matrix-js-sdk';
import { CryptoBackend } from 'matrix-js-sdk/lib/common-crypto/CryptoBackend';
import { ReceiptType } from 'matrix-js-sdk/lib/@types/read_receipts';
import { AccountDataEvent } from '../../types/matrix/accountData';
import {
  IRoomCreateContent,
  Membership,
  MessageEvent,
  NotificationType,
  RoomToParents,
  RoomType,
  StateEvent,
  UnreadInfo,
} from '../../types/matrix/room';
import {
  LEGACY_POLL_RESPONSE_EVENT_TYPE,
  UNSTABLE_POLL_END_EVENT_TYPE,
  UNSTABLE_POLL_RESPONSE_EVENT_TYPE,
} from './polls';
import { sanitizeCustomHtml } from './sanitize';

type FullyReadContent = {
  event_id?: string;
};

const FULLY_READ_EVENT_TYPE = 'm.fully_read';
const OPTIMISTIC_ROOM_READ_MARKERS_STORAGE_KEY = 'cinny:optimistic-room-read-markers';

type RoomReadMarker = {
  eventId: string;
  ts?: number;
};

const optimisticRoomReadMarkers = new Map<string, RoomReadMarker>();

type RoomReadMarkerState = {
  eventId?: string;
  ts?: number;
  optimistic: boolean;
};

type LiveTimelineUnreadState = {
  reliable: boolean;
  total: number;
};

export type RoomUnreadStatus = {
  hasUnread: boolean;
  unreadInfo: UnreadInfo;
};

type PersistedOptimisticRoomReadMarker =
  | string
  | {
      eventId?: unknown;
      ts?: unknown;
    };

type OptimisticRoomReadMarkersByUser = Record<
  string,
  Record<string, PersistedOptimisticRoomReadMarker>
>;

type WrappedReadReceipt = {
  eventId?: string;
  data?: {
    ts?: number;
  };
};

const normalizeOptimisticRoomReadMarker = (
  marker: PersistedOptimisticRoomReadMarker | undefined
): RoomReadMarker | undefined => {
  if (typeof marker === 'string') {
    return { eventId: marker };
  }

  if (!marker || typeof marker !== 'object' || typeof marker.eventId !== 'string') {
    return undefined;
  }

  return {
    eventId: marker.eventId,
    ts: typeof marker.ts === 'number' ? marker.ts : undefined,
  };
};

const readOptimisticRoomReadMarkers = (): OptimisticRoomReadMarkersByUser => {
  if (typeof window === 'undefined') return {};

  try {
    const storage = window.localStorage.getItem(OPTIMISTIC_ROOM_READ_MARKERS_STORAGE_KEY);
    if (!storage) return {};

    const parsed = JSON.parse(storage);
    return parsed && typeof parsed === 'object' ? (parsed as OptimisticRoomReadMarkersByUser) : {};
  } catch {
    return {};
  }
};

const writeOptimisticRoomReadMarkers = (markersByUser: OptimisticRoomReadMarkersByUser) => {
  if (typeof window === 'undefined') return;

  try {
    if (Object.keys(markersByUser).length === 0) {
      window.localStorage.removeItem(OPTIMISTIC_ROOM_READ_MARKERS_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(
      OPTIMISTIC_ROOM_READ_MARKERS_STORAGE_KEY,
      JSON.stringify(markersByUser)
    );
  } catch {
    // ignore local storage errors
  }
};

const getPersistedOptimisticRoomReadMarker = (
  roomId: string,
  userId?: string | null
): RoomReadMarker | undefined => {
  if (!userId) return undefined;

  const roomReadMarker = readOptimisticRoomReadMarkers()[userId]?.[roomId];
  return normalizeOptimisticRoomReadMarker(roomReadMarker);
};

const setPersistedOptimisticRoomReadMarker = (
  roomId: string,
  marker: RoomReadMarker,
  userId?: string | null
) => {
  if (!userId) return;

  const markersByUser = readOptimisticRoomReadMarkers();
  markersByUser[userId] = {
    ...(markersByUser[userId] ?? {}),
    [roomId]: marker,
  };
  writeOptimisticRoomReadMarkers(markersByUser);
};

const clearPersistedOptimisticRoomReadMarker = (roomId: string, userId?: string | null) => {
  if (!userId) return;

  const markersByUser = readOptimisticRoomReadMarkers();
  const userMarkers = markersByUser[userId];
  if (!userMarkers || !(roomId in userMarkers)) return;

  delete userMarkers[roomId];

  if (Object.keys(userMarkers).length === 0) {
    delete markersByUser[userId];
  } else {
    markersByUser[userId] = userMarkers;
  }

  writeOptimisticRoomReadMarkers(markersByUser);
};

export const getStateEvent = (
  room: Room,
  eventType: StateEvent,
  stateKey = ''
): MatrixEvent | undefined =>
  room.getLiveTimeline().getState(EventTimeline.FORWARDS)?.getStateEvents(eventType, stateKey) ??
  undefined;

export const getStateEvents = (room: Room, eventType: StateEvent): MatrixEvent[] =>
  room.getLiveTimeline().getState(EventTimeline.FORWARDS)?.getStateEvents(eventType) ?? [];

export const getAccountData = (
  mx: MatrixClient,
  eventType: AccountDataEvent
): MatrixEvent | undefined => mx.getAccountData(eventType as string);

export const getRoomFullyReadEventId = (room: Room): string | undefined => {
  const fullyReadEvent = room.accountData.get(FULLY_READ_EVENT_TYPE);
  const eventId = fullyReadEvent?.getContent<FullyReadContent>()?.event_id;
  return typeof eventId === 'string' ? eventId : undefined;
};

export const setOptimisticRoomReadMarker = (
  roomId: string,
  eventId: string,
  userId?: string | null,
  ts?: number
) => {
  const marker = { eventId, ts };
  optimisticRoomReadMarkers.set(roomId, marker);
  setPersistedOptimisticRoomReadMarker(roomId, marker, userId);
};

export const clearOptimisticRoomReadMarker = (
  roomId: string,
  eventId?: string,
  userId?: string | null
) => {
  if (eventId && optimisticRoomReadMarkers.get(roomId)?.eventId !== eventId) return;
  optimisticRoomReadMarkers.delete(roomId);
  clearPersistedOptimisticRoomReadMarker(roomId, userId);
};

const getLiveTimelineEventIndex = (room: Room, eventId?: string): number => {
  if (!eventId) return -1;
  return room
    .getLiveTimeline()
    .getEvents()
    .findIndex((event) => event.getId() === eventId);
};

const getLiveTimelineEventTs = (room: Room, eventId?: string): number | undefined => {
  if (!eventId) return undefined;

  const event = room
    .getLiveTimeline()
    .getEvents()
    .find((mEvent) => mEvent.getId() === eventId);
  const eventTs = event?.getTs();
  return typeof eventTs === 'number' ? eventTs : undefined;
};

const makeReadMarkerState = (
  room: Room,
  marker: RoomReadMarker | undefined,
  optimistic: boolean
): RoomReadMarkerState => {
  if (!marker) {
    return {
      optimistic,
    };
  }

  return {
    eventId: marker.eventId,
    ts: marker.ts ?? getLiveTimelineEventTs(room, marker.eventId),
    optimistic,
  };
};

const getReceiptMarker = (
  room: Room,
  userId: string,
  receiptType: ReceiptType
): RoomReadMarker | undefined => {
  const receipt = room.getReadReceiptForUserId(
    userId,
    false,
    receiptType
  ) as WrappedReadReceipt | null;
  if (typeof receipt?.eventId !== 'string') return undefined;

  return {
    eventId: receipt.eventId,
    ts: typeof receipt.data?.ts === 'number' ? receipt.data.ts : undefined,
  };
};

const getStoredRoomReceiptMarker = (
  room: Room,
  userId?: string | null
): RoomReadMarker | undefined => {
  if (!userId) return undefined;

  const publicReceipt = getReceiptMarker(room, userId, ReceiptType.Read);
  const privateReceipt = getReceiptMarker(room, userId, ReceiptType.ReadPrivate);

  if (!publicReceipt) return privateReceipt;
  if (!privateReceipt) return publicReceipt;

  const publicIndex = getLiveTimelineEventIndex(room, publicReceipt.eventId);
  const privateIndex = getLiveTimelineEventIndex(room, privateReceipt.eventId);

  if (publicIndex !== -1 && privateIndex !== -1) {
    return privateIndex >= publicIndex ? privateReceipt : publicReceipt;
  }

  if (typeof publicReceipt.ts === 'number' && typeof privateReceipt.ts === 'number') {
    return privateReceipt.ts >= publicReceipt.ts ? privateReceipt : publicReceipt;
  }

  return privateReceipt;
};

const getStoredRoomReadMarker = (
  room: Room,
  userId?: string | null
): RoomReadMarker | undefined => {
  const fullyReadEventId = getRoomFullyReadEventId(room);
  const receiptMarker = getStoredRoomReceiptMarker(room, userId);
  const receiptEventId = receiptMarker?.eventId;
  if (!fullyReadEventId) return receiptMarker;

  const fullyReadMarker = {
    eventId: fullyReadEventId,
    ts: getLiveTimelineEventTs(room, fullyReadEventId),
  };
  if (!receiptEventId) return fullyReadMarker;

  const fullyReadIndex = getLiveTimelineEventIndex(room, fullyReadEventId);
  const receiptIndex = getLiveTimelineEventIndex(room, receiptEventId);

  if (fullyReadIndex !== -1 && receiptIndex !== -1) {
    return receiptIndex > fullyReadIndex ? receiptMarker : fullyReadMarker;
  }

  if (fullyReadIndex === -1 && receiptIndex !== -1) {
    return receiptMarker;
  }

  if (typeof fullyReadMarker.ts === 'number' && typeof receiptMarker.ts === 'number') {
    return receiptMarker.ts > fullyReadMarker.ts ? receiptMarker : fullyReadMarker;
  }

  return fullyReadMarker;
};

const NOTIFICATION_EVENT_TYPES = [
  'm.room.create',
  'm.room.message',
  'm.room.encrypted',
  'm.poll.start',
  'org.matrix.msc3381.poll.start',
  'm.room.member',
  'm.sticker',
];
export const isNotificationEvent = (mEvent: MatrixEvent) => {
  const eType = mEvent.getType();
  if (!NOTIFICATION_EVENT_TYPES.includes(eType)) {
    return false;
  }
  if (eType === 'm.room.member') return false;

  if (mEvent.isRedacted()) return false;
  if (mEvent.getRelation()?.rel_type === 'm.replace') return false;

  return true;
};

const getLiveTimelineUnreadState = (
  room: Room,
  userId?: string | null,
  readUpToId?: string
): LiveTimelineUnreadState => {
  if (!userId) {
    return {
      reliable: false,
      total: 0,
    };
  }

  const liveEvents = room.getLiveTimeline().getEvents();
  if (liveEvents.length === 0) {
    return {
      reliable: false,
      total: 0,
    };
  }

  if (!readUpToId) {
    return {
      reliable: false,
      total: 0,
    };
  }

  const readUpToIndex = getLiveTimelineEventIndex(room, readUpToId);
  if (readUpToIndex === -1) {
    return {
      reliable: false,
      total: 0,
    };
  }

  let total = 0;
  for (let i = readUpToIndex + 1; i < liveEvents.length; i += 1) {
    const event = liveEvents[i];
    if (event && event.getSender() !== userId && isNotificationEvent(event)) {
      total += 1;
    }
  }

  return {
    reliable: true,
    total,
  };
};

const getLiveTimelineUnreadStateFromTs = (
  room: Room,
  userId?: string | null,
  readUpToTs?: number
): LiveTimelineUnreadState => {
  if (!userId || typeof readUpToTs !== 'number') {
    return {
      reliable: false,
      total: 0,
    };
  }

  const liveEvents = room.getLiveTimeline().getEvents();
  if (liveEvents.length === 0) {
    return {
      reliable: false,
      total: 0,
    };
  }

  let total = 0;
  liveEvents.forEach((event) => {
    if (!event || event.getSender() === userId) return;
    if (event.getTs() <= readUpToTs) return;
    if (isNotificationEvent(event)) {
      total += 1;
    }
  });

  return {
    reliable: true,
    total,
  };
};

const getRoomEventReadState = (
  room: Room,
  userId: string | null | undefined,
  storedReadMarker: RoomReadMarker | undefined
): RoomReadMarkerState => {
  const optimisticReadMarker =
    optimisticRoomReadMarkers.get(room.roomId) ??
    getPersistedOptimisticRoomReadMarker(room.roomId, userId);

  if (optimisticReadMarker) {
    optimisticRoomReadMarkers.set(room.roomId, optimisticReadMarker);
  }

  if (!optimisticReadMarker) {
    return makeReadMarkerState(room, storedReadMarker, false);
  }

  if (storedReadMarker?.eventId === optimisticReadMarker.eventId) {
    clearOptimisticRoomReadMarker(room.roomId, optimisticReadMarker.eventId, userId);
    return makeReadMarkerState(room, storedReadMarker, false);
  }

  if (
    typeof storedReadMarker?.ts === 'number' &&
    typeof optimisticReadMarker.ts === 'number' &&
    storedReadMarker.ts >= optimisticReadMarker.ts
  ) {
    clearOptimisticRoomReadMarker(room.roomId, optimisticReadMarker.eventId, userId);
    return makeReadMarkerState(room, storedReadMarker, false);
  }

  const optimisticIndex = getLiveTimelineEventIndex(room, optimisticReadMarker.eventId);
  if (optimisticIndex === -1) {
    return makeReadMarkerState(room, optimisticReadMarker, true);
  }

  const storedIndex = getLiveTimelineEventIndex(room, storedReadMarker?.eventId);
  if (storedIndex >= optimisticIndex) {
    clearOptimisticRoomReadMarker(room.roomId, optimisticReadMarker.eventId, userId);
    return makeReadMarkerState(room, storedReadMarker, false);
  }

  return makeReadMarkerState(room, optimisticReadMarker, true);
};

const getRoomReadMarkerState = (room: Room, userId?: string | null): RoomReadMarkerState =>
  getRoomEventReadState(room, userId, getStoredRoomReadMarker(room, userId));

export const getRoomReadMarkerEventId = (room: Room, userId?: string | null): string | undefined =>
  getRoomReadMarkerState(room, userId).eventId;

export const getMDirects = (mDirectEvent: MatrixEvent): Set<string> => {
  const roomIds = new Set<string>();
  const userIdToDirects = mDirectEvent?.getContent();

  if (userIdToDirects === undefined) return roomIds;

  Object.keys(userIdToDirects).forEach((userId) => {
    const directs = userIdToDirects[userId];
    if (Array.isArray(directs)) {
      directs.forEach((id) => {
        if (typeof id === 'string') roomIds.add(id);
      });
    }
  });

  return roomIds;
};

export const isDirectInvite = (room: Room | null, myUserId: string | null): boolean => {
  if (!room || !myUserId) return false;
  const me = room.getMember(myUserId);
  const memberEvent = me?.events?.member;
  const content = memberEvent?.getContent();
  return content?.is_direct === true;
};

export const isSpace = (room: Room | null): boolean => {
  if (!room) return false;
  const event = getStateEvent(room, StateEvent.RoomCreate);
  if (!event) return false;
  return event.getContent().type === RoomType.Space;
};

export const isRoom = (room: Room | null): boolean => {
  if (!room) return false;
  const event = getStateEvent(room, StateEvent.RoomCreate);
  if (!event) return true;
  return event.getContent().type !== RoomType.Space;
};

export const isUnsupportedRoom = (room: Room | null): boolean => {
  if (!room) return false;
  const event = getStateEvent(room, StateEvent.RoomCreate);
  if (!event) return true; // Consider room unsupported if m.room.create event doesn't exist
  return event.getContent().type !== undefined && event.getContent().type !== RoomType.Space;
};

export function isValidChild(mEvent: MatrixEvent): boolean {
  return (
    mEvent.getType() === StateEvent.SpaceChild &&
    Array.isArray(mEvent.getContent<{ via: string[] }>().via)
  );
}

export const getAllParents = (roomToParents: RoomToParents, roomId: string): Set<string> => {
  const allParents = new Set<string>();

  const addAllParentIds = (rId: string) => {
    if (allParents.has(rId)) return;
    allParents.add(rId);

    const parents = roomToParents.get(rId);
    parents?.forEach((id) => addAllParentIds(id));
  };
  addAllParentIds(roomId);
  allParents.delete(roomId);
  return allParents;
};

export const getSpaceChildren = (room: Room) =>
  getStateEvents(room, StateEvent.SpaceChild).reduce<string[]>((filtered, mEvent) => {
    const stateKey = mEvent.getStateKey();
    if (isValidChild(mEvent) && stateKey) {
      filtered.push(stateKey);
    }
    return filtered;
  }, []);

export const mapParentWithChildren = (
  roomToParents: RoomToParents,
  roomId: string,
  children: string[]
) => {
  const allParents = getAllParents(roomToParents, roomId);
  children.forEach((childId) => {
    if (allParents.has(childId)) {
      // Space cycle detected.
      return;
    }
    const parents = roomToParents.get(childId) ?? new Set<string>();
    parents.add(roomId);
    roomToParents.set(childId, parents);
  });
};

export const getRoomToParents = (mx: MatrixClient): RoomToParents => {
  const map: RoomToParents = new Map();
  mx.getRooms()
    .filter((room) => isSpace(room))
    .forEach((room) => mapParentWithChildren(map, room.roomId, getSpaceChildren(room)));

  return map;
};

export const getOrphanParents = (roomToParents: RoomToParents, roomId: string): string[] => {
  const parents = getAllParents(roomToParents, roomId);
  const orphanParents = Array.from(parents).filter(
    (parentRoomId) => !roomToParents.has(parentRoomId)
  );

  return orphanParents;
};

export const isMutedRule = (rule: IPushRule) =>
  // Check for empty actions (new spec) or dont_notify (deprecated)
  (rule.actions.length === 0 || rule.actions[0] === 'dont_notify') &&
  rule.conditions?.[0]?.kind === 'event_match';

export const findMutedRule = (overrideRules: IPushRule[], roomId: string) =>
  overrideRules.find((rule) => rule.rule_id === roomId && isMutedRule(rule));

export const getNotificationType = (mx: MatrixClient, roomId: string): NotificationType => {
  let roomPushRule: IPushRule | undefined;
  try {
    roomPushRule = mx.getRoomPushRule('global', roomId);
  } catch {
    roomPushRule = undefined;
  }

  if (!roomPushRule) {
    const overrideRules = mx.getAccountData(EventType.PushRules)?.getContent<IPushRules>()
      ?.global?.override;
    if (!overrideRules) return NotificationType.Default;

    return findMutedRule(overrideRules, roomId) ? NotificationType.Mute : NotificationType.Default;
  }

  if (roomPushRule.actions[0] === 'notify') return NotificationType.AllMessages;
  return NotificationType.MentionsAndKeywords;
};

export const roomHaveNotification = (room: Room): boolean => {
  const total = room.getUnreadNotificationCount(NotificationCountType.Total);
  const highlight = room.getUnreadNotificationCount(NotificationCountType.Highlight);

  return total > 0 || highlight > 0;
};

const roomHaveUnreadFromReadEvent = (room: Room, userId: string, readUpToId?: string): boolean => {
  const liveEvents = room.getLiveTimeline().getEvents();
  const readUpToIndex = getLiveTimelineEventIndex(room, readUpToId);

  if (readUpToId && readUpToIndex === -1) {
    return roomHaveNotification(room);
  }

  if (!readUpToId && !roomHaveNotification(room)) {
    return false;
  }

  for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
    const event = liveEvents[i];
    if (!event) return false;
    if (event.getId() === readUpToId) return false;
    if (event.getSender() !== userId && isNotificationEvent(event)) return true;
  }
  return false;
};

export const getRoomUnreadStatus = (mx: MatrixClient, room: Room): RoomUnreadStatus => {
  const total = room.getUnreadNotificationCount(NotificationCountType.Total);
  const highlight = room.getUnreadNotificationCount(NotificationCountType.Highlight);
  const unreadInfo = {
    roomId: room.roomId,
    highlight,
    total: highlight > total ? highlight : total,
  };
  const userId = mx.getUserId();
  if (!userId) {
    return {
      hasUnread: false,
      unreadInfo,
    };
  }

  const readMarkerState = getRoomReadMarkerState(room, userId);
  const liveTimelineUnread = getLiveTimelineUnreadState(room, userId, readMarkerState.eventId);

  if (liveTimelineUnread.reliable) {
    return {
      hasUnread: liveTimelineUnread.total > 0,
      unreadInfo: {
        roomId: room.roomId,
        highlight: Math.min(highlight, liveTimelineUnread.total),
        total: liveTimelineUnread.total,
      },
    };
  }

  const timestampUnread = getLiveTimelineUnreadStateFromTs(room, userId, readMarkerState.ts);
  if (timestampUnread.reliable) {
    return {
      hasUnread: timestampUnread.total > 0,
      unreadInfo: {
        roomId: room.roomId,
        highlight: Math.min(highlight, timestampUnread.total),
        total: timestampUnread.total,
      },
    };
  }

  const hasUnread = roomHaveUnreadFromReadEvent(room, userId, readMarkerState.eventId);
  if (readMarkerState.optimistic && !hasUnread) {
    return {
      hasUnread: false,
      unreadInfo: {
        roomId: room.roomId,
        highlight: 0,
        total: 0,
      },
    };
  }

  return {
    hasUnread,
    unreadInfo,
  };
};

export const roomHaveUnread = (mx: MatrixClient, room: Room) =>
  getRoomUnreadStatus(mx, room).hasUnread;

export const getUnreadInfo = (mx: MatrixClient, room: Room): UnreadInfo =>
  getRoomUnreadStatus(mx, room).unreadInfo;

export const getUnreadInfos = (mx: MatrixClient): UnreadInfo[] => {
  const unreadInfos = mx.getRooms().reduce<UnreadInfo[]>((unread, room) => {
    if (room.isSpaceRoom()) return unread;
    if (room.getMyMembership() !== 'join') return unread;
    if (getNotificationType(mx, room.roomId) === NotificationType.Mute) return unread;

    const { hasUnread, unreadInfo } = getRoomUnreadStatus(mx, room);

    if (roomHaveNotification(room) || hasUnread) {
      if (unreadInfo.total > 0 || hasUnread) {
        unread.push(unreadInfo);
      }
    }

    return unread;
  }, []);
  return unreadInfos;
};

export const getRoomIconSrc = (
  icons: Record<IconName, IconSrc>,
  roomType?: string,
  joinRule?: JoinRule
): IconSrc => {
  if (roomType === RoomType.Space) {
    if (joinRule === JoinRule.Public) return icons.SpaceGlobe;
    if (
      joinRule === JoinRule.Invite ||
      joinRule === JoinRule.Knock ||
      joinRule === JoinRule.Private
    ) {
      return icons.SpaceLock;
    }
    return icons.Space;
  }

  if (roomType === RoomType.Call) {
    if (joinRule === JoinRule.Public) return icons.VolumeHighGlobe;
    if (
      joinRule === JoinRule.Invite ||
      joinRule === JoinRule.Knock ||
      joinRule === JoinRule.Private
    ) {
      return icons.VolumeHighLock;
    }
    return icons.VolumeHigh;
  }

  if (joinRule === JoinRule.Public) return icons.HashGlobe;
  if (
    joinRule === JoinRule.Invite ||
    joinRule === JoinRule.Knock ||
    joinRule === JoinRule.Private
  ) {
    return icons.HashLock;
  }
  return icons.Hash;
};

export const getRoomAvatarUrl = (
  mx: MatrixClient,
  room: Room,
  size: 32 | 96 = 32,
  useAuthentication = false
): string | undefined => {
  const mxcUrl = room.getMxcAvatarUrl();
  return mxcUrl
    ? mx.mxcUrlToHttp(mxcUrl, size, size, 'crop', undefined, false, useAuthentication) ?? undefined
    : undefined;
};

export const getDirectRoomAvatarUrl = (
  mx: MatrixClient,
  room: Room,
  size: 32 | 96 = 32,
  useAuthentication = false
): string | undefined => {
  const mxcUrl = room.getAvatarFallbackMember()?.getMxcAvatarUrl();

  if (!mxcUrl) {
    return getRoomAvatarUrl(mx, room, size, useAuthentication);
  }

  return (
    mx.mxcUrlToHttp(mxcUrl, size, size, 'crop', undefined, false, useAuthentication) ?? undefined
  );
};

export const trimReplyFromBody = (body: string): string => {
  const match = body.match(/^> <.+?> .+\n(>.*\n)*?\n/m);
  if (!match) return body;
  return body.slice(match[0].length);
};

export const trimReplyFromFormattedBody = (formattedBody: string): string => {
  const suffix = '</mx-reply>';
  const i = formattedBody.lastIndexOf(suffix);
  if (i < 0) {
    return formattedBody;
  }
  return formattedBody.slice(i + suffix.length);
};

const FORMATTED_BODY_LINE_BREAK_TAGS = new Set([
  'blockquote',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'ol',
  'p',
  'pre',
  'table',
  'tr',
  'ul',
]);

const formattedBodyNodeToText = (node: ChildNode): string => {
  if (isText(node)) return node.data;
  if (!isTag(node)) return '';
  if (node.name === 'br') return '\n';
  if (node.name === 'img') return node.attribs.alt ?? node.attribs.title ?? '';

  const text = node.childNodes.map(formattedBodyNodeToText).join('');
  return FORMATTED_BODY_LINE_BREAK_TAGS.has(node.name) ? `${text}\n` : text;
};

const formattedBodyToPreviewText = (formattedBody: string): string =>
  parse(sanitizeCustomHtml(trimReplyFromFormattedBody(formattedBody)))
    .map(formattedBodyNodeToText)
    .join('')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();

export const getReplyPreviewBody = (body: string, formattedBody?: string): string => {
  if (formattedBody) {
    const formattedPreview = formattedBodyToPreviewText(formattedBody);
    if (formattedPreview) return formattedPreview;
  }
  return trimReplyFromBody(body).trim();
};

export const parseReplyBody = (userId: string, body: string) =>
  `> <${userId}> ${body.replace(/\n/g, '\n> ')}\n\n`;

export const parseReplyFormattedBody = (
  roomId: string,
  userId: string,
  eventId: string,
  formattedBody: string
): string => {
  const replyToLink = `<a href="https://matrix.to/#/${encodeURIComponent(
    roomId
  )}/${encodeURIComponent(eventId)}">In reply to</a>`;
  const userLink = `<a href="https://matrix.to/#/${encodeURIComponent(userId)}">${userId}</a>`;

  return `<mx-reply><blockquote>${replyToLink}${userLink}<br />${formattedBody}</blockquote></mx-reply>`;
};

export const getMemberDisplayName = (room: Room, userId: string): string | undefined => {
  const member = room.getMember(userId);
  const name = member?.rawDisplayName;
  if (name === userId) return undefined;
  return name;
};

export const getMemberSearchStr = (
  member: RoomMember,
  query: string,
  mxIdToName: (mxId: string) => string
): string[] => [
  member.rawDisplayName === member.userId ? mxIdToName(member.userId) : member.rawDisplayName,
  query.startsWith('@') || query.indexOf(':') > -1 ? member.userId : mxIdToName(member.userId),
];

export const getMemberAvatarMxc = (room: Room, userId: string): string | undefined => {
  const member = room.getMember(userId);
  return member?.getMxcAvatarUrl();
};

export const isMembershipChanged = (mEvent: MatrixEvent): boolean =>
  mEvent.getContent().membership !== mEvent.getPrevContent().membership ||
  mEvent.getContent().reason !== mEvent.getPrevContent().reason;

type DecryptTimelineEventOptions = {
  retryFailures?: boolean;
};

export const decryptAllTimelineEvent = async (
  mx: MatrixClient,
  timeline: EventTimeline,
  options: DecryptTimelineEventOptions = {}
) => {
  const crypto = mx.getCrypto();
  if (!crypto) return;
  const retryFailures = options.retryFailures ?? true;
  const decryptionPromises = timeline
    .getEvents()
    .filter(
      (event) =>
        !event.isBeingDecrypted() &&
        (event.isEncrypted() || (retryFailures && event.isDecryptionFailure()))
    )
    .reverse()
    .map((event) => event.attemptDecryption(crypto as CryptoBackend, { isRetry: true }));
  await Promise.allSettled(decryptionPromises);
};

export const getReactionContent = (eventId: string, key: string, shortcode?: string) => ({
  'm.relates_to': {
    event_id: eventId,
    key,
    rel_type: 'm.annotation',
  },
  shortcode,
});

export const getEventReactions = (timelineSet: EventTimelineSet, eventId: string) =>
  timelineSet.relations.getChildEventsForEvent(
    eventId,
    RelationType.Annotation,
    EventType.Reaction
  );

export const getEventEdits = (timelineSet: EventTimelineSet, eventId: string, eventType: string) =>
  timelineSet.relations.getChildEventsForEvent(eventId, RelationType.Replace, eventType);

export const getLatestEdit = (
  targetEvent: MatrixEvent,
  editEvents: MatrixEvent[]
): MatrixEvent | undefined => {
  const eventByTargetSender = (rEvent: MatrixEvent) =>
    rEvent.getSender() === targetEvent.getSender();
  return editEvents.sort((m1, m2) => m2.getTs() - m1.getTs()).find(eventByTargetSender);
};

export const getEditedEvent = (
  mEventId: string,
  mEvent: MatrixEvent,
  timelineSet: EventTimelineSet
): MatrixEvent | undefined => {
  const edits = getEventEdits(timelineSet, mEventId, mEvent.getType());
  return edits && getLatestEdit(mEvent, edits.getRelations());
};

export const canEditEvent = (mx: MatrixClient, mEvent: MatrixEvent) => {
  const content = mEvent.getContent();
  const relationType = content['m.relates_to']?.rel_type;
  return (
    mEvent.getSender() === mx.getUserId() &&
    (!relationType || relationType === RelationType.Thread) &&
    mEvent.getType() === MessageEvent.RoomMessage &&
    (content.msgtype === MsgType.Text ||
      content.msgtype === MsgType.Emote ||
      content.msgtype === MsgType.Notice ||
      content.msgtype === MsgType.Image)
  );
};

export const getLatestEditableEvt = (
  timeline: EventTimeline,
  canEdit: (mEvent: MatrixEvent) => boolean
): MatrixEvent | undefined => {
  const events = timeline.getEvents();

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const evt = events[i];
    if (canEdit(evt)) return evt;
  }
  return undefined;
};

export const reactionOrEditEvent = (mEvent: MatrixEvent) =>
  mEvent.getRelation()?.rel_type === RelationType.Annotation ||
  mEvent.getRelation()?.rel_type === RelationType.Replace ||
  mEvent.getType() === MessageEvent.PollResponse ||
  mEvent.getType() === MessageEvent.PollEnd ||
  mEvent.getType() === UNSTABLE_POLL_RESPONSE_EVENT_TYPE ||
  mEvent.getType() === UNSTABLE_POLL_END_EVENT_TYPE ||
  mEvent.getType() === LEGACY_POLL_RESPONSE_EVENT_TYPE;

export const getMentionContent = (userIds: string[], room: boolean): IMentions => {
  const mMentions: IMentions = {};
  if (userIds.length > 0) {
    mMentions.user_ids = userIds;
  }
  if (room) {
    mMentions.room = true;
  }

  return mMentions;
};

export const getCommonRooms = (
  mx: MatrixClient,
  rooms: string[],
  otherUserId: string
): string[] => {
  const commonRooms: string[] = [];

  rooms.forEach((roomId) => {
    const room = mx.getRoom(roomId);
    if (!room || room.getMyMembership() !== Membership.Join) return;

    const common = room.hasMembershipState(otherUserId, Membership.Join);
    if (common) {
      commonRooms.push(roomId);
    }
  });

  return commonRooms;
};

export const bannedInRooms = (mx: MatrixClient, rooms: string[], otherUserId: string): boolean =>
  rooms.some((roomId) => {
    const room = mx.getRoom(roomId);
    if (!room || room.getMyMembership() !== Membership.Join) return false;

    const banned = room.hasMembershipState(otherUserId, Membership.Ban);
    return banned;
  });

export const getAllVersionsRoomCreator = (room: Room): Set<string> => {
  const creators = new Set<string>();

  const createEvent = getStateEvent(room, StateEvent.RoomCreate);
  const createContent = createEvent?.getContent<IRoomCreateContent>();
  const creator = createEvent?.getSender();
  if (typeof creator === 'string') creators.add(creator);

  if (createContent && Array.isArray(createContent.additional_creators)) {
    createContent.additional_creators.forEach((c) => {
      if (typeof c === 'string') creators.add(c);
    });
  }

  return creators;
};

export const guessPerfectParent = (
  mx: MatrixClient,
  roomId: string,
  parents: string[]
): string | undefined => {
  if (parents.length === 1) {
    return parents[0];
  }

  const getSpecialUsers = (rId: string): string[] => {
    const specialUsers: Set<string> = new Set();

    const r = mx.getRoom(rId);
    if (!r) return [];

    getAllVersionsRoomCreator(r).forEach((c) => specialUsers.add(c));

    const powerLevels = getStateEvent(
      r,
      StateEvent.RoomPowerLevels
    )?.getContent<IPowerLevelsContent>();

    const { users_default: usersDefault, users } = powerLevels ?? {};
    const defaultPower = typeof usersDefault === 'number' ? usersDefault : 0;

    if (typeof users === 'object')
      Object.keys(users).forEach((userId) => {
        if (users[userId] > defaultPower) {
          specialUsers.add(userId);
        }
      });

    return Array.from(specialUsers);
  };

  let perfectParent: string | undefined;
  let score = 0;

  const roomSpecialUsers = getSpecialUsers(roomId);
  parents.forEach((parentId) => {
    const parentSpecialUsers = getSpecialUsers(parentId);
    const matchedUsersCount = parentSpecialUsers.filter((userId) =>
      roomSpecialUsers.includes(userId)
    ).length;

    if (matchedUsersCount > score) {
      score = matchedUsersCount;
      perfectParent = parentId;
    }
  });

  return perfectParent;
};
