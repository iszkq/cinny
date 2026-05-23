import { IconName, IconSrc } from 'folds';

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

type FullyReadContent = {
  event_id?: string;
};

const FULLY_READ_EVENT_TYPE = 'm.fully_read';
const OPTIMISTIC_ROOM_READ_MARKERS_STORAGE_KEY = 'cinny:optimistic-room-read-markers';
const optimisticRoomReadMarkers = new Map<string, string>();

type RoomReadMarkerState = {
  eventId?: string;
  optimistic: boolean;
};

type LiveTimelineUnreadState = {
  reliable: boolean;
  total: number;
};

type OptimisticRoomReadMarkersByUser = Record<string, Record<string, string>>;

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
): string | undefined => {
  if (!userId) return undefined;

  const roomReadMarker = readOptimisticRoomReadMarkers()[userId]?.[roomId];
  return typeof roomReadMarker === 'string' ? roomReadMarker : undefined;
};

const setPersistedOptimisticRoomReadMarker = (
  roomId: string,
  eventId: string,
  userId?: string | null
) => {
  if (!userId) return;

  const markersByUser = readOptimisticRoomReadMarkers();
  markersByUser[userId] = {
    ...(markersByUser[userId] ?? {}),
    [roomId]: eventId,
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
): MatrixEvent | undefined => mx.getAccountData(eventType as any);

export const getRoomFullyReadEventId = (room: Room): string | undefined => {
  const fullyReadEvent = room.accountData.get(FULLY_READ_EVENT_TYPE);
  const eventId = fullyReadEvent?.getContent<FullyReadContent>()?.event_id;
  return typeof eventId === 'string' ? eventId : undefined;
};

export const setOptimisticRoomReadMarker = (
  roomId: string,
  eventId: string,
  userId?: string | null
) => {
  optimisticRoomReadMarkers.set(roomId, eventId);
  setPersistedOptimisticRoomReadMarker(roomId, eventId, userId);
};

export const clearOptimisticRoomReadMarker = (
  roomId: string,
  eventId?: string,
  userId?: string | null
) => {
  if (eventId && optimisticRoomReadMarkers.get(roomId) !== eventId) return;
  optimisticRoomReadMarkers.delete(roomId);
  clearPersistedOptimisticRoomReadMarker(roomId, userId);
};

const getStoredRoomReadMarkerEventId = (
  room: Room,
  userId?: string | null
): string | undefined => {
  const fullyReadEventId = getRoomFullyReadEventId(room);
  if (fullyReadEventId) return fullyReadEventId;
  if (!userId) return undefined;
  return room.getEventReadUpTo(userId) ?? undefined;
};

const getLiveTimelineEventIndex = (room: Room, eventId?: string): number => {
  if (!eventId) return -1;
  return room.getLiveTimeline().getEvents().findIndex((event) => event.getId() === eventId);
};

const getLiveTimelineUnreadState = (
  room: Room,
  userId?: string | null
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
      reliable: true,
      total: 0,
    };
  }

  const { eventId: readUpToId } = getRoomReadMarkerState(room, userId);
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
    if (!event || event.getSender() === userId) continue;
    if (isNotificationEvent(event)) {
      total += 1;
    }
  }

  return {
    reliable: true,
    total,
  };
};

const getRoomReadMarkerState = (room: Room, userId?: string | null): RoomReadMarkerState => {
  const storedReadMarkerEventId = getStoredRoomReadMarkerEventId(room, userId);
  const optimisticReadMarkerEventId =
    optimisticRoomReadMarkers.get(room.roomId) ??
    getPersistedOptimisticRoomReadMarker(room.roomId, userId);

  if (optimisticReadMarkerEventId) {
    optimisticRoomReadMarkers.set(room.roomId, optimisticReadMarkerEventId);
  }

  if (!optimisticReadMarkerEventId) {
    return {
      eventId: storedReadMarkerEventId,
      optimistic: false,
    };
  }

  if (storedReadMarkerEventId === optimisticReadMarkerEventId) {
    clearOptimisticRoomReadMarker(room.roomId, optimisticReadMarkerEventId, userId);
    return {
      eventId: storedReadMarkerEventId,
      optimistic: false,
    };
  }

  const optimisticIndex = getLiveTimelineEventIndex(room, optimisticReadMarkerEventId);
  if (optimisticIndex === -1) {
    clearOptimisticRoomReadMarker(room.roomId, optimisticReadMarkerEventId, userId);
    return {
      eventId: storedReadMarkerEventId,
      optimistic: false,
    };
  }

  const storedIndex = getLiveTimelineEventIndex(room, storedReadMarkerEventId);
  if (storedIndex >= optimisticIndex) {
    clearOptimisticRoomReadMarker(room.roomId, optimisticReadMarkerEventId, userId);
    return {
      eventId: storedReadMarkerEventId,
      optimistic: false,
    };
  }

  return {
    eventId: optimisticReadMarkerEventId,
    optimistic: true,
  };
};

export const getRoomReadMarkerEventId = (
  room: Room,
  userId?: string | null
): string | undefined => getRoomReadMarkerState(room, userId).eventId;

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

export const roomHaveNotification = (room: Room): boolean => {
  const total = room.getUnreadNotificationCount(NotificationCountType.Total);
  const highlight = room.getUnreadNotificationCount(NotificationCountType.Highlight);

  return total > 0 || highlight > 0;
};

export const roomHaveUnread = (mx: MatrixClient, room: Room) => {
  const userId = mx.getUserId();
  if (!userId) return false;
  const liveTimelineUnread = getLiveTimelineUnreadState(room, userId);
  if (liveTimelineUnread.reliable) {
    return liveTimelineUnread.total > 0;
  }

  const readUpToId = getRoomReadMarkerEventId(room, userId);
  const liveEvents = room.getLiveTimeline().getEvents();
  const readUpToIndex = getLiveTimelineEventIndex(room, readUpToId);

  if (readUpToId && readUpToIndex === -1) {
    return roomHaveNotification(room);
  }

  for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
    const event = liveEvents[i];
    if (!event) return false;
    if (event.getId() === readUpToId) return false;
    if (event.getSender() === userId) continue;
    if (isNotificationEvent(event)) return true;
  }
  return false;
};

export const getUnreadInfo = (mx: MatrixClient, room: Room): UnreadInfo => {
  const total = room.getUnreadNotificationCount(NotificationCountType.Total);
  const highlight = room.getUnreadNotificationCount(NotificationCountType.Highlight);
  const userId = mx.getUserId();
  const readMarkerState = getRoomReadMarkerState(room, userId);
  const liveTimelineUnread = getLiveTimelineUnreadState(room, userId);

  if (liveTimelineUnread.reliable) {
    return {
      roomId: room.roomId,
      highlight: Math.min(highlight, liveTimelineUnread.total),
      total: liveTimelineUnread.total,
    };
  }

  if (readMarkerState.optimistic && !roomHaveUnread(mx, room)) {
    return {
      roomId: room.roomId,
      highlight: 0,
      total: 0,
    };
  }

  return {
    roomId: room.roomId,
    highlight,
    total: highlight > total ? highlight : total,
  };
};

export const getUnreadInfos = (mx: MatrixClient): UnreadInfo[] => {
  const unreadInfos = mx.getRooms().reduce<UnreadInfo[]>((unread, room) => {
    if (room.isSpaceRoom()) return unread;
    if (room.getMyMembership() !== 'join') return unread;
    if (getNotificationType(mx, room.roomId) === NotificationType.Mute) return unread;

    const hasUnread = roomHaveUnread(mx, room);
    const unreadInfo = getUnreadInfo(mx, room);

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

export const decryptAllTimelineEvent = async (mx: MatrixClient, timeline: EventTimeline) => {
  const crypto = mx.getCrypto();
  if (!crypto) return;
  const decryptionPromises = timeline
    .getEvents()
    .filter(
      (event) => !event.isBeingDecrypted() && (event.isEncrypted() || event.isDecryptionFailure())
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
      content.msgtype === MsgType.Notice)
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
