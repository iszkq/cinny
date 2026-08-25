/* eslint-disable react/destructuring-assignment */
import React, {
  Dispatch,
  MouseEventHandler,
  RefObject,
  SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Direction,
  EventTimeline,
  EventTimelineSet,
  EventTimelineSetHandlerMap,
  EventType,
  IContent,
  MatrixClient,
  MatrixEvent,
  MatrixEventEvent,
  MsgType,
  RelationType,
  Room,
  RoomEvent,
  RoomEventHandlerMap,
  SyncState,
} from 'matrix-js-sdk';
import { HTMLReactParserOptions } from 'html-react-parser';
import classNames from 'classnames';
import { ReactEditor } from 'slate-react';
import { Editor } from 'slate';
import type { SessionMembershipData } from 'matrix-js-sdk/lib/matrixrtc';
import to from 'await-to-js';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  Badge,
  Box,
  Chip,
  ContainerColor,
  Icon,
  Icons,
  Line,
  Scroll,
  Text,
  as,
  color,
  config,
  toRem,
} from 'folds';
import { isKeyHotkey } from 'is-hotkey';
import { Opts as LinkifyOpts } from 'linkifyjs';
import { useTranslation } from 'react-i18next';
import { eventWithShortcode, factoryEventSentBy, getMxIdLocalPart } from '../../utils/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useVirtualPaginator, ItemRange } from '../../hooks/useVirtualPaginator';
import { useAlive } from '../../hooks/useAlive';
import { editableActiveElement, scrollToBottom } from '../../utils/dom';
import {
  DefaultPlaceholder,
  CompactPlaceholder,
  Reply,
  MessageBase,
  MessageUnsupportedContent,
  Time,
  MessageNotDecryptedContent,
  RedactedContent,
  MSticker,
  ImageContent,
  EventContent,
} from '../../components/message';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeMentionCustomProps,
  renderMatrixMention,
} from '../../plugins/react-custom-html-parser';
import {
  canEditEvent,
  decryptAllTimelineEvent,
  getEditedEvent,
  getEventReactions,
  getLatestEditableEvt,
  getMemberDisplayName,
  getRoomReadMarkerEventId,
  getReactionContent,
  isMembershipChanged,
  roomHaveUnread,
  reactionOrEditEvent,
} from '../../utils/room';
import { useSetting } from '../../state/hooks/settings';
import { MessageLayout, settingsAtom } from '../../state/settings';
import { useMatrixEventRenderer } from '../../hooks/useMatrixEventRenderer';
import { Reactions, Message, Event, EncryptedContent } from './message';
import { useMemberEventParser } from '../../hooks/useMemberEventParser';
import * as customHtmlCss from '../../styles/CustomHtml.css';
import { RoomIntro } from '../../components/room-intro';
import {
  getIntersectionObserverEntry,
  useIntersectionObserver,
} from '../../hooks/useIntersectionObserver';
import { markAsRead, ROOM_MARKED_AS_READ } from '../../utils/notifications';
import { ROOM_COMPOSER_VIEWPORT_CHANGE, ROOM_FOLLOW_LATEST } from '../../utils/roomViewEvents';
import { useDebounce } from '../../hooks/useDebounce';
import { getResizeObserverEntry, useResizeObserver } from '../../hooks/useResizeObserver';
import * as css from './RoomTimeline.css';
import { inSameDay, minuteDifference, timeDayMonthYear, today, yesterday } from '../../utils/time';
import { createMentionElement, isEmptyEditor, moveCursor } from '../../components/editor';
import { roomIdToReplyDraftAtomFamily } from '../../state/room/roomInputDrafts';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import { GetContentCallback, MessageEvent, StateEvent } from '../../../types/matrix/room';
import { useKeyDown } from '../../hooks/useKeyDown';
import { useDocumentFocusChange } from '../../hooks/useDocumentFocusChange';
import { useSyncState } from '../../hooks/useSyncState';
import { RenderMessageContent } from '../../components/RenderMessageContent';
import { Image } from '../../components/media';
import { ImageViewer } from '../../components/image-viewer';
import type { ViewerImageItem } from '../../components/message/content/ImageContent';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { useRoomUnread } from '../../state/hooks/unread';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { useMentionClickHandler } from '../../hooks/useMentionClickHandler';
import { useSpoilerClickHandler } from '../../hooks/useSpoilerClickHandler';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useIgnoredUsers } from '../../hooks/useIgnoredUsers';
import { useImagePackRooms } from '../../hooks/useImagePackRooms';
import { useIsDirectRoom } from '../../hooks/useRoom';
import { useOpenUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { useSpaceOptionally } from '../../hooks/useSpace';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { useAccessiblePowerTagColors, useGetMemberPowerTag } from '../../hooks/useMemberPowerTag';
import { useTheme } from '../../hooks/useTheme';
import { useRoomCreatorsTag } from '../../hooks/useRoomCreatorsTag';
import { usePowerLevelTags } from '../../hooks/usePowerLevelTags';
import { useRoomLatestRenderedEvent } from '../../hooks/useRoomLatestRenderedEvent';
import { ForwardableMessage, isForwardableMessage } from './forwardMessages';
import { ForwardMessagesModal } from './ForwardMessagesModal';
import { ThreadDialog } from './ThreadDialog';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { POLL_START_EVENT_TYPE, UNSTABLE_POLL_START_EVENT_TYPE } from '../../utils/polls';
import { isDesktopUpdaterSupported } from '../../utils/desktopUpdater';
import { prioritizeRoomDecryption } from '../../utils/backgroundDecryption';

const TimelineFloat = as<'div', css.TimelineFloatVariants>(
  ({ position, className, ...props }, ref) => (
    <Box
      className={classNames(css.TimelineFloat({ position }), className)}
      justifyContent="Center"
      alignItems="Center"
      gap="200"
      {...props}
      ref={ref}
    />
  )
);

const TimelineDivider = as<'div', { variant?: ContainerColor | 'Inherit' }>(
  ({ variant, children, ...props }, ref) => (
    <Box gap="100" justifyContent="Center" alignItems="Center" {...props} ref={ref}>
      <Line style={{ flexGrow: 1 }} variant={variant} size="300" />
      {children}
      <Line style={{ flexGrow: 1 }} variant={variant} size="300" />
    </Box>
  )
);

export const getLiveTimeline = (room: Room): EventTimeline =>
  room.getUnfilteredTimelineSet().getLiveTimeline();

export const getEventTimeline = (room: Room, eventId: string): EventTimeline | undefined => {
  const timelineSet = room.getUnfilteredTimelineSet();
  return timelineSet.getTimelineForEvent(eventId) ?? undefined;
};

type TimelineReplyRelation = {
  replyEventId?: string;
  threadRootId?: string;
};

const getContentRelation = (content: IContent): Record<string, unknown> | undefined => {
  const relation = content['m.relates_to'];
  return relation && typeof relation === 'object'
    ? (relation as Record<string, unknown>)
    : undefined;
};

const getTimelineReplyRelation = (mEvent: MatrixEvent): TimelineReplyRelation => {
  const relation = getContentRelation(mEvent.getContent<IContent>());
  const inReplyTo = relation?.['m.in_reply_to'];
  const replyEventId =
    inReplyTo && typeof inReplyTo === 'object'
      ? (inReplyTo as Record<string, unknown>).event_id
      : undefined;
  const threadRootId =
    relation?.rel_type === RelationType.Thread && typeof relation.event_id === 'string'
      ? relation.event_id
      : undefined;

  return {
    replyEventId:
      mEvent.replyEventId ?? (typeof replyEventId === 'string' ? replyEventId : undefined),
    threadRootId: mEvent.threadRootId ?? threadRootId,
  };
};

const DESKTOP_PAGINATION_LIMIT = 80;
const WEB_PAGINATION_LIMIT = 40;
const IMAGE_VIEWER_RANGE_BUFFER = 48;

export const getFirstLinkedTimeline = (
  timeline: EventTimeline,
  direction: Direction
): EventTimeline => {
  const linkedTm = timeline.getNeighbouringTimeline(direction);
  if (!linkedTm) return timeline;
  return getFirstLinkedTimeline(linkedTm, direction);
};

export const getLinkedTimelines = (timeline: EventTimeline): EventTimeline[] => {
  const firstTimeline = getFirstLinkedTimeline(timeline, Direction.Backward);
  const timelines: EventTimeline[] = [];

  for (
    let nextTimeline: EventTimeline | null = firstTimeline;
    nextTimeline;
    nextTimeline = nextTimeline.getNeighbouringTimeline(Direction.Forward)
  ) {
    timelines.push(nextTimeline);
  }
  return timelines;
};

const getTimelineImageViewerItems = (linkedTimelines: EventTimeline[]): ViewerImageItem[] => {
  const seenEventIds = new Set<string>();
  const items: ViewerImageItem[] = [];

  linkedTimelines.forEach((timeline) => {
    timeline.getEvents().forEach((mEvent) => {
      const eventId = mEvent.getId();
      if (!eventId || seenEventIds.has(eventId) || mEvent.isRedacted()) return;
      seenEventIds.add(eventId);

      const editedEvent = getEditedEvent(eventId, mEvent, timeline.getTimelineSet());
      const content = editedEvent?.getContent()['m.new_content'] ?? mEvent.getContent();
      const url =
        typeof content.file?.url === 'string'
          ? content.file.url
          : typeof content.url === 'string'
          ? content.url
          : undefined;
      const mimeType =
        typeof content.info?.mimetype === 'string' ? content.info.mimetype : undefined;
      const info =
        content.info && typeof content.info === 'object'
          ? (content.info as ViewerImageItem['info'])
          : undefined;
      const body = typeof content.body === 'string' ? content.body : '图片';

      if (!url) return;

      if (mEvent.getType() === MessageEvent.Sticker) {
        items.push({
          id: eventId,
          body,
          mimeType,
          url,
          info,
          encInfo: content.file,
        });
        return;
      }

      if (mEvent.getType() !== MessageEvent.RoomMessage || content.msgtype !== MsgType.Image) {
        return;
      }

      items.push({
        id: eventId,
        body,
        mimeType,
        url,
        info,
        encInfo: content.file,
      });
    });
  });

  return items;
};

type TimelineIndexEntry = {
  timeline: EventTimeline;
  timelineSet: EventTimelineSet;
  event: MatrixEvent;
  eventIndex: number;
  baseIndex: number;
};

type TimelineIndexRange = {
  timeline: EventTimeline;
  timelineSet: EventTimelineSet;
  baseIndex: number;
  endIndex: number;
};

type TimelineIndex = {
  ranges: TimelineIndexRange[];
  eventsCount: number;
  version: string;
};

const buildTimelineIndex = (linkedTimelines: EventTimeline[], version: string): TimelineIndex => {
  const ranges: TimelineIndexRange[] = [];
  let baseIndex = 0;

  linkedTimelines.forEach((timeline) => {
    const timelineSet = timeline.getTimelineSet();
    const endIndex = baseIndex + timeline.getEvents().length;

    ranges.push({
      timeline,
      timelineSet,
      baseIndex,
      endIndex,
    });

    baseIndex = endIndex;
  });

  return {
    ranges,
    eventsCount: baseIndex,
    version,
  };
};

const getTimelineIndexEntry = (
  timelineIndex: TimelineIndex,
  index: number
): TimelineIndexEntry | undefined => {
  const range = timelineIndex.ranges.find(
    (timelineRange) => index >= timelineRange.baseIndex && index < timelineRange.endIndex
  );
  if (!range) {
    return undefined;
  }

  const eventIndex = index - range.baseIndex;
  const event = range.timeline.getEvents()[eventIndex];
  if (!event) {
    return undefined;
  }

  const entry: TimelineIndexEntry = {
    timeline: range.timeline,
    timelineSet: range.timelineSet,
    event,
    eventIndex,
    baseIndex: range.baseIndex,
  };

  return entry;
};

const getEventIdAbsoluteIndexFromTimelineIndex = (
  timelineIndex: TimelineIndex,
  eventTimeline: EventTimeline,
  eventId: string
): number | undefined => {
  const range = timelineIndex.ranges.find(
    (timelineRange) => timelineRange.timeline === eventTimeline
  );
  if (!range) {
    return undefined;
  }

  const eventIndex = eventTimeline.getEvents().findIndex((evt) => evt.getId() === eventId);
  if (eventIndex === -1) {
    return undefined;
  }

  return range.baseIndex + eventIndex;
};

const getTimelineImageViewerItemsInRange = (
  timelineIndex: TimelineIndex,
  range: ItemRange
): ViewerImageItem[] => {
  const { eventsCount } = timelineIndex;
  const start = Math.max(range.start - IMAGE_VIEWER_RANGE_BUFFER, 0);
  const end = Math.min(range.end + IMAGE_VIEWER_RANGE_BUFFER, eventsCount);
  const seenEventIds = new Set<string>();
  const items: ViewerImageItem[] = [];

  for (let index = start; index < end; index += 1) {
    const timelineEntry = getTimelineIndexEntry(timelineIndex, index);
    const mEvent = timelineEntry?.event;
    const eventId = mEvent?.getId();
    if (!timelineEntry || !mEvent || !eventId || seenEventIds.has(eventId) || mEvent.isRedacted()) {
      continue;
    }
    seenEventIds.add(eventId);

    const editedEvent = getEditedEvent(eventId, mEvent, timelineEntry.timelineSet);
    const content = editedEvent?.getContent()['m.new_content'] ?? mEvent.getContent();
    const url =
      typeof content.file?.url === 'string'
        ? content.file.url
        : typeof content.url === 'string'
        ? content.url
        : undefined;
    const mimeType = typeof content.info?.mimetype === 'string' ? content.info.mimetype : undefined;
    const info =
      content.info && typeof content.info === 'object'
        ? (content.info as ViewerImageItem['info'])
        : undefined;
    const body = typeof content.body === 'string' ? content.body : 'Image';

    if (!url) {
      continue;
    }

    if (mEvent.getType() === MessageEvent.Sticker) {
      items.push({
        id: eventId,
        body,
        mimeType,
        url,
        info,
        encInfo: content.file,
      });
      continue;
    }

    if (mEvent.getType() !== MessageEvent.RoomMessage || content.msgtype !== MsgType.Image) {
      continue;
    }

    items.push({
      id: eventId,
      body,
      mimeType,
      url,
      info,
      encInfo: content.file,
    });
  }

  return items;
};

export const timelineToEventsCount = (t: EventTimeline) => t.getEvents().length;
export const getTimelinesEventsCount = (timelines: EventTimeline[]): number => {
  const timelineEventCountReducer = (count: number, tm: EventTimeline) =>
    count + timelineToEventsCount(tm);
  return timelines.reduce(timelineEventCountReducer, 0);
};

export const getTimelineAndBaseIndex = (
  timelines: EventTimeline[],
  index: number
): [EventTimeline | undefined, number] => {
  let uptoTimelineLen = 0;
  const timeline = timelines.find((t) => {
    uptoTimelineLen += t.getEvents().length;
    if (index < uptoTimelineLen) return true;
    return false;
  });
  if (!timeline) return [undefined, 0];
  return [timeline, uptoTimelineLen - timeline.getEvents().length];
};

export const getTimelineRelativeIndex = (absoluteIndex: number, timelineBaseIndex: number) =>
  absoluteIndex - timelineBaseIndex;

export const getTimelineEvent = (timeline: EventTimeline, index: number): MatrixEvent | undefined =>
  timeline.getEvents()[index];

export const getEventIdAbsoluteIndex = (
  timelines: EventTimeline[],
  eventTimeline: EventTimeline,
  eventId: string
): number | undefined => {
  const timelineIndex = timelines.findIndex((t) => t === eventTimeline);
  if (timelineIndex === -1) return undefined;
  const eventIndex = eventTimeline.getEvents().findIndex((evt) => evt.getId() === eventId);
  if (eventIndex === -1) return undefined;
  const baseIndex = timelines
    .slice(0, timelineIndex)
    .reduce((accValue, timeline) => timeline.getEvents().length + accValue, 0);
  return baseIndex + eventIndex;
};

type RoomTimelineProps = {
  room: Room;
  eventId?: string;
  roomInputRef: RefObject<HTMLElement>;
  editor: Editor;
};

type Timeline = {
  linkedTimelines: EventTimeline[];
  range: ItemRange;
};

const useEventTimelineLoader = (
  mx: MatrixClient,
  room: Room,
  onLoad: (eventId: string, linkedTimelines: EventTimeline[], evtAbsIndex: number) => void,
  onError: (err: Error | null) => void
) => {
  const loadEventTimeline = useCallback(
    async (eventId: string) => {
      const [err, replyEvtTimeline] = await to(
        mx.getEventTimeline(room.getUnfilteredTimelineSet(), eventId)
      );
      if (!replyEvtTimeline) {
        onError(err ?? null);
        return;
      }
      const linkedTimelines = getLinkedTimelines(replyEvtTimeline);
      const absIndex = getEventIdAbsoluteIndex(linkedTimelines, replyEvtTimeline, eventId);

      if (absIndex === undefined) {
        onError(err ?? null);
        return;
      }

      onLoad(eventId, linkedTimelines, absIndex);
    },
    [mx, room, onLoad, onError]
  );

  return loadEventTimeline;
};

const useTimelinePagination = (
  mx: MatrixClient,
  timeline: Timeline,
  setTimeline: Dispatch<SetStateAction<Timeline>>,
  limit: number
) => {
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const alive = useAlive();

  const handleTimelinePagination = useMemo(() => {
    let fetching = false;

    const recalibratePagination = (
      linkedTimelines: EventTimeline[],
      timelinesEventsCount: number[],
      backwards: boolean
    ) => {
      const topTimeline = linkedTimelines[0];
      const timelineMatch = (mt: EventTimeline) => (t: EventTimeline) => t === mt;

      const newLTimelines = getLinkedTimelines(topTimeline);
      const topTmIndex = newLTimelines.findIndex(timelineMatch(topTimeline));
      const topAddedTm = topTmIndex === -1 ? [] : newLTimelines.slice(0, topTmIndex);

      const topTmAddedEvt =
        timelineToEventsCount(newLTimelines[topTmIndex]) - timelinesEventsCount[0];
      const offsetRange = getTimelinesEventsCount(topAddedTm) + (backwards ? topTmAddedEvt : 0);

      setTimeline((currentTimeline) => ({
        linkedTimelines: newLTimelines,
        range:
          offsetRange > 0
            ? {
                start: currentTimeline.range.start + offsetRange,
                end: currentTimeline.range.end + offsetRange,
              }
            : { ...currentTimeline.range },
      }));
    };

    return async (backwards: boolean) => {
      if (fetching) return;
      const { linkedTimelines: lTimelines } = timelineRef.current;
      const timelinesEventsCount = lTimelines.map(timelineToEventsCount);

      const timelineToPaginate = backwards ? lTimelines[0] : lTimelines[lTimelines.length - 1];
      if (!timelineToPaginate) return;

      const paginationToken = timelineToPaginate.getPaginationToken(
        backwards ? Direction.Backward : Direction.Forward
      );
      if (
        !paginationToken &&
        getTimelinesEventsCount(lTimelines) !==
          getTimelinesEventsCount(getLinkedTimelines(timelineToPaginate))
      ) {
        recalibratePagination(lTimelines, timelinesEventsCount, backwards);
        return;
      }

      fetching = true;
      const [err] = await to(
        mx.paginateEventTimeline(timelineToPaginate, {
          backwards,
          limit,
        })
      );
      if (err) {
        // TODO: handle pagination error.
        fetching = false;
        return;
      }
      const fetchedTimeline =
        timelineToPaginate.getNeighbouringTimeline(
          backwards ? Direction.Backward : Direction.Forward
        ) ?? timelineToPaginate;
      // Decrypt all event ahead of render cycle
      const roomId = fetchedTimeline.getRoomId();
      const room = roomId ? mx.getRoom(roomId) : null;

      if (room?.hasEncryptionStateEvent()) {
        const retryFailures = isDesktopUpdaterSupported();
        const decryptPromise = to(decryptAllTimelineEvent(mx, fetchedTimeline, { retryFailures }));
        if (retryFailures) {
          await decryptPromise;
        } else {
          decryptPromise.then(() => undefined);
        }
      }

      fetching = false;
      if (alive()) {
        recalibratePagination(lTimelines, timelinesEventsCount, backwards);
      }
    };
  }, [mx, alive, setTimeline, limit]);
  return handleTimelinePagination;
};

const useLiveEventArrive = (
  room: Room,
  onArrive: (mEvent: MatrixEvent) => void,
  onRedaction: () => void
) => {
  useEffect(() => {
    const handleTimelineEvent: EventTimelineSetHandlerMap[RoomEvent.Timeline] = (
      mEvent,
      eventRoom,
      toStartOfTimeline,
      removed,
      data
    ) => {
      if (eventRoom?.roomId !== room.roomId || !data?.liveEvent) return;
      if (mEvent.getType() === EventType.RoomRedaction) {
        onRedaction();
        return;
      }
      onArrive(mEvent);
    };
    const handleRedaction: RoomEventHandlerMap[RoomEvent.Redaction] = (_mEvent, eventRoom) => {
      if (eventRoom?.roomId !== room.roomId) return;
      // The SDK mutates the redacted event in place. Re-render without adding
      // the redaction event to the visible timeline range.
      onRedaction();
    };

    room.on(RoomEvent.Timeline, handleTimelineEvent);
    room.on(RoomEvent.Redaction, handleRedaction);
    return () => {
      room.removeListener(RoomEvent.Timeline, handleTimelineEvent);
      room.removeListener(RoomEvent.Redaction, handleRedaction);
    };
  }, [room, onArrive, onRedaction]);
};

const useLiveTimelineRefresh = (room: Room, onRefresh: () => void) => {
  useEffect(() => {
    const handleTimelineRefresh: RoomEventHandlerMap[RoomEvent.TimelineRefresh] = (r) => {
      if (r.roomId !== room.roomId) return;
      onRefresh();
    };

    room.on(RoomEvent.TimelineRefresh, handleTimelineRefresh);
    return () => {
      room.removeListener(RoomEvent.TimelineRefresh, handleTimelineRefresh);
    };
  }, [room, onRefresh]);
};

const getInitialTimeline = (room: Room, limit: number) => {
  const linkedTimelines = getLinkedTimelines(getLiveTimeline(room));
  const evLength = getTimelinesEventsCount(linkedTimelines);
  return {
    linkedTimelines,
    range: {
      start: Math.max(evLength - limit, 0),
      end: evLength,
    },
  };
};

const getEmptyTimeline = () => ({
  range: { start: 0, end: 0 },
  linkedTimelines: [],
});

const getRoomUnreadInfo = (room: Room, scrollTo = false) => {
  const readUptoEventId = getRoomReadMarkerEventId(room, room.client.getUserId());
  if (!readUptoEventId) return undefined;
  if (!roomHaveUnread(room.client, room)) return undefined;
  const evtTimeline = getEventTimeline(room, readUptoEventId);
  const latestTimeline = evtTimeline && getFirstLinkedTimeline(evtTimeline, Direction.Forward);
  return {
    readUptoEventId,
    inLiveTimeline: latestTimeline === room.getLiveTimeline(),
    scrollTo,
  };
};

type ReceiptWithTs = {
  data?: {
    ts?: number;
  };
  ts?: number;
};

const RECEIPT_MESSAGE_TYPES = new Set<string>([
  MessageEvent.RoomMessage,
  MessageEvent.RoomMessageEncrypted,
  MessageEvent.Sticker,
  MessageEvent.PollStart,
  UNSTABLE_POLL_START_EVENT_TYPE,
]);
const UNREAD_SYNC_STATES = new Set<SyncState>([
  SyncState.Prepared,
  SyncState.Catchup,
  SyncState.Syncing,
]);
const READ_AT_BOTTOM_THRESHOLD = 8;
const COMPOSER_VIEWPORT_ANCHOR_DURATION_MS = 1200;

const isScrollAtBottom = (scrollElement: HTMLElement): boolean =>
  scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.offsetHeight <=
  READ_AT_BOTTOM_THRESHOLD;

const getReceiptTimestamp = (room: Room, userId: string): number | undefined => {
  const receipt = room.getReadReceiptForUserId(userId) as ReceiptWithTs | null;
  if (typeof receipt?.data?.ts === 'number') return receipt.data.ts;
  if (typeof receipt?.ts === 'number') return receipt.ts;
  return undefined;
};

const isOwnMessageEvent = (mx: MatrixClient, mEvent: MatrixEvent): boolean =>
  mEvent.getSender() === mx.getUserId() && RECEIPT_MESSAGE_TYPES.has(mEvent.getType());

export function RoomTimeline({ room, eventId, roomInputRef, editor }: RoomTimelineProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const screenSize = useScreenSizeContext();
  const [sendReadReceipts] = useSetting(settingsAtom, 'sendReadReceipts');
  const [messageLayout] = useSetting(settingsAtom, 'messageLayout');
  const [messageSpacing] = useSetting(settingsAtom, 'messageSpacing');
  const [legacyUsernameColor] = useSetting(settingsAtom, 'legacyUsernameColor');
  const direct = useIsDirectRoom();
  const [hideMembershipEvents] = useSetting(settingsAtom, 'hideMembershipEvents');
  const [hideNickAvatarEvents] = useSetting(settingsAtom, 'hideNickAvatarEvents');
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [encUrlPreview] = useSetting(settingsAtom, 'encUrlPreview');
  const showUrlPreview = room.hasEncryptionStateEvent() ? encUrlPreview : urlPreview;
  const [showHiddenEvents] = useSetting(settingsAtom, 'showHiddenEvents');
  const [showDeveloperTools] = useSetting(settingsAtom, 'developerTools');
  const timelinePaddingY = screenSize === ScreenSize.Mobile ? config.space.S300 : config.space.S600;
  const timelinePageLimit = isDesktopUpdaterSupported()
    ? DESKTOP_PAGINATION_LIMIT
    : WEB_PAGINATION_LIMIT;

  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const ignoredUsersList = useIgnoredUsers();
  const ignoredUsersSet = useMemo(() => new Set(ignoredUsersList), [ignoredUsersList]);

  const setReplyDraft = useSetAtom(roomIdToReplyDraftAtomFamily(room.roomId));
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);

  const creatorsTag = useRoomCreatorsTag();
  const powerLevelTags = usePowerLevelTags(room, powerLevels);
  const getMemberPowerTag = useGetMemberPowerTag(room, creators, powerLevels);

  const theme = useTheme();
  const accessiblePowerTagColors = useAccessiblePowerTagColors(
    theme.kind,
    creatorsTag,
    powerLevelTags
  );

  const permissions = useRoomPermissions(creators, powerLevels);

  const canRedact = permissions.action('redact', mx.getSafeUserId());
  const canDeleteOwn = permissions.event(MessageEvent.RoomRedaction, mx.getSafeUserId());
  const canSendReaction = permissions.event(MessageEvent.Reaction, mx.getSafeUserId());
  const canPinEvent = permissions.stateEvent(StateEvent.RoomPinnedEvents, mx.getSafeUserId());
  const [editId, setEditId] = useState<string>();
  const [forwardMessages, setForwardMessages] = useState<Record<string, ForwardableMessage>>({});
  const [forwardDialog, setForwardDialog] = useState(false);
  const [threadDialogRootId, setThreadDialogRootId] = useState<string>();
  const [receiptTick, setReceiptTick] = useState(0);

  const roomToParents = useAtomValue(roomToParentsAtom);
  const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
  const { navigateRoom } = useRoomNavigate();
  const mentionClickHandler = useMentionClickHandler(room.roomId);
  const spoilerClickHandler = useSpoilerClickHandler();
  const openUserRoomProfile = useOpenUserRoomProfile();
  const space = useSpaceOptionally();

  const imagePackRooms: Room[] = useImagePackRooms(room.roomId, roomToParents);

  const [unreadInfo, setUnreadInfo] = useState(() => getRoomUnreadInfo(room, true));
  const readUptoEventIdRef = useRef<string>();
  readUptoEventIdRef.current = unreadInfo?.readUptoEventId;

  const atBottomAnchorRef = useRef<HTMLElement>(null);
  const [atBottom, setAtBottom] = useState<boolean>(true);
  const atBottomRef = useRef(atBottom);
  atBottomRef.current = atBottom;

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToBottomRef = useRef({
    count: 0,
    smooth: true,
  });
  const composerViewportAnchorUntilRef = useRef(0);

  const [focusItem, setFocusItem] = useState<
    | {
        index: number;
        scrollTo: boolean;
        highlight: boolean;
      }
    | undefined
  >();
  const alive = useAlive();

  const linkifyOpts = useMemo<LinkifyOpts>(
    () => ({
      ...LINKIFY_OPTS,
      render: factoryRenderLinkifyWithMention((href) =>
        renderMatrixMention(mx, room.roomId, href, makeMentionCustomProps(mentionClickHandler))
      ),
    }),
    [mx, room, mentionClickHandler]
  );
  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, room.roomId, {
        linkifyOpts,
        useAuthentication,
        handleSpoilerClick: spoilerClickHandler,
        handleMentionClick: mentionClickHandler,
      }),
    [mx, room, linkifyOpts, spoilerClickHandler, mentionClickHandler, useAuthentication]
  );
  const parseMemberEvent = useMemberEventParser();

  const [timeline, setTimeline] = useState<Timeline>(() =>
    eventId ? getEmptyTimeline() : getInitialTimeline(room, timelinePageLimit)
  );
  const eventsLength = getTimelinesEventsCount(timeline.linkedTimelines);
  const timelineVersion = timeline.linkedTimelines.map(timelineToEventsCount).join(':');
  const timelineIndex = useMemo(
    () => buildTimelineIndex(timeline.linkedTimelines, timelineVersion),
    [timeline.linkedTimelines, timelineVersion]
  );
  const liveTimeline = getLiveTimeline(room);

  useEffect(() => {
    if (!room.hasEncryptionStateEvent()) return;
    prioritizeRoomDecryption(mx, room);
  }, [liveTimeline, mx, room]);

  const liveTimelineLinked =
    timeline.linkedTimelines[timeline.linkedTimelines.length - 1] === liveTimeline;
  const imageViewerItems = useMemo(
    () => getTimelineImageViewerItemsInRange(timelineIndex, timeline.range),
    [timelineIndex, timeline.range]
  );
  const latestRenderedEventId = useRoomLatestRenderedEvent(room)?.getId();
  const canPaginateBack =
    typeof timeline.linkedTimelines[0]?.getPaginationToken(Direction.Backward) === 'string';
  const rangeAtStart = timeline.range.start === 0;
  const rangeAtEnd = timeline.range.end === eventsLength;
  const getScrollElement = useCallback(() => scrollRef.current, []);
  const atLiveEndRef = useRef(liveTimelineLinked && rangeAtEnd);
  atLiveEndRef.current = liveTimelineLinked && rangeAtEnd;

  const isScrolledToLiveBottom = useCallback((): boolean => {
    const scrollElement = getScrollElement();
    return Boolean(scrollElement && atLiveEndRef.current && isScrollAtBottom(scrollElement));
  }, [getScrollElement]);

  const syncAtBottomState = useCallback((): boolean => {
    const nextAtBottom = isScrolledToLiveBottom();
    setAtBottom((current) => (current === nextAtBottom ? current : nextAtBottom));
    return nextAtBottom;
  }, [isScrolledToLiveBottom]);

  const handleTimelinePagination = useTimelinePagination(
    mx,
    timeline,
    setTimeline,
    timelinePageLimit
  );

  const { getItems, scrollToItem, scrollToElement, observeBackAnchor, observeFrontAnchor } =
    useVirtualPaginator({
      count: eventsLength,
      limit: timelinePageLimit,
      range: timeline.range,
      onRangeChange: useCallback((r) => setTimeline((cs) => ({ ...cs, range: r })), []),
      getScrollElement,
      getItemElement: useCallback(
        (index: number) =>
          (scrollRef.current?.querySelector(`[data-message-item="${index}"]`) as HTMLElement) ??
          undefined,
        []
      ),
      onEnd: handleTimelinePagination,
    });
  const visibleItems = getItems();
  const privateReceipt = !sendReadReceipts;
  const syncUnreadInfo = useCallback(() => {
    setUnreadInfo((current) => {
      if (!unread) return undefined;

      const nextUnreadInfo = getRoomUnreadInfo(room, current?.scrollTo ?? false);
      if (!nextUnreadInfo) return undefined;

      const nextScrollTo = current?.scrollTo ?? nextUnreadInfo.scrollTo;
      if (
        current?.readUptoEventId === nextUnreadInfo.readUptoEventId &&
        current?.inLiveTimeline === nextUnreadInfo.inLiveTimeline &&
        current?.scrollTo === nextScrollTo
      ) {
        return current;
      }

      return {
        ...nextUnreadInfo,
        scrollTo: nextScrollTo,
      };
    });
  }, [room, unread]);

  const messageReadReceipts = useMemo(() => {
    const myUserId = mx.getUserId();
    if (!myUserId) return new Map<string, string[]>();

    const visibleMessages = visibleItems.reduce<
      Array<{
        eventId: string;
        event: MatrixEvent;
      }>
    >((messages, item) => {
      const event = getTimelineIndexEntry(timelineIndex, item)?.event;
      const targetEventId = event?.getId();
      const senderId = event?.getSender();

      if (!event || !targetEventId) return messages;
      if (senderId && ignoredUsersSet.has(senderId)) return messages;
      if (!RECEIPT_MESSAGE_TYPES.has(event.getType())) return messages;
      if (reactionOrEditEvent(event)) return messages;

      messages.push({
        eventId: targetEventId,
        event,
      });

      return messages;
    }, []);

    const receiptMap = new Map<string, string[]>();
    const assignedUsers = new Set<string>();

    for (let index = visibleMessages.length - 1; index >= 0; index -= 1) {
      const target = visibleMessages[index];
      const readers = Array.from(new Set(room.getUsersReadUpTo(target.event))).filter(
        (readerId) =>
          readerId !== myUserId && !assignedUsers.has(readerId) && !ignoredUsersSet.has(readerId)
      );

      if (readers.length === 0) continue;

      readers.sort((a, b) => {
        const aTs = getReceiptTimestamp(room, a) ?? 0;
        const bTs = getReceiptTimestamp(room, b) ?? 0;
        return bTs - aTs;
      });

      receiptMap.set(target.eventId, readers);
      readers.forEach((readerId) => assignedUsers.add(readerId));
    }

    return receiptMap;
    // Read receipts mutate inside matrix-js-sdk without changing the Room object. receiptTick is
    // the explicit React invalidation signal for this memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ignoredUsersSet, mx, receiptTick, room, timelineIndex, visibleItems]);

  const getInlineReadReceiptUserIds = useCallback(
    (targetEventId: string): string[] | undefined => {
      if (screenSize !== ScreenSize.Mobile && latestRenderedEventId === targetEventId) {
        return undefined;
      }

      return messageReadReceipts.get(targetEventId);
    },
    [latestRenderedEventId, messageReadReceipts, screenSize]
  );

  const loadEventTimeline = useEventTimelineLoader(
    mx,
    room,
    useCallback(
      (evtId, lTimelines, evtAbsIndex) => {
        if (!alive()) return;
        const evLength = getTimelinesEventsCount(lTimelines);

        setFocusItem({
          index: evtAbsIndex,
          scrollTo: true,
          highlight: evtId !== readUptoEventIdRef.current,
        });
        setTimeline({
          linkedTimelines: lTimelines,
          range: {
            start: Math.max(evtAbsIndex - timelinePageLimit, 0),
            end: Math.min(evtAbsIndex + timelinePageLimit, evLength),
          },
        });
      },
      [alive, timelinePageLimit]
    ),
    useCallback(() => {
      if (!alive()) return;
      setTimeline(getInitialTimeline(room, timelinePageLimit));
      scrollToBottomRef.current.count += 1;
      scrollToBottomRef.current.smooth = false;
    }, [alive, room, timelinePageLimit])
  );

  useEffect(() => {
    const handleLocalEchoUpdated: RoomEventHandlerMap[RoomEvent.LocalEchoUpdated] = (
      _event,
      eventRoom
    ) => {
      if (eventRoom?.roomId !== room.roomId) return;

      // Local echo status/id changes do not always emit a fresh timeline event,
      // so we trigger a lightweight rerender here to keep send states accurate.
      setTimeline((currentTimeline) => ({ ...currentTimeline }));
    };

    room.on(RoomEvent.LocalEchoUpdated, handleLocalEchoUpdated);
    return () => {
      room.removeListener(RoomEvent.LocalEchoUpdated, handleLocalEchoUpdated);
    };
  }, [room]);

  useLiveEventArrive(
    room,
    useCallback(
      (mEvt: MatrixEvent) => {
        if (mEvt.isEncrypted() || mEvt.isDecryptionFailure()) {
          const handleDecrypted = () => {
            mEvt.removeListener(MatrixEventEvent.Decrypted, handleDecrypted);
            setTimeline((current) => ({ ...current }));
          };
          mEvt.on(MatrixEventEvent.Decrypted, handleDecrypted);
        }

        if (reactionOrEditEvent(mEvt)) {
          setTimeline((current) => ({ ...current }));
          return;
        }

        if (isOwnMessageEvent(mx, mEvt) && (!atBottomRef.current || !atLiveEndRef.current)) {
          if (eventId) {
            navigateRoom(room.roomId, undefined, { replace: true });
          }

          if (document.hasFocus()) {
            requestAnimationFrame(() => markAsRead(mx, mEvt.getRoomId()!, privateReceipt));
          }

          setUnreadInfo(undefined);
          setAtBottom(true);
          scrollToBottomRef.current.count += 1;
          scrollToBottomRef.current.smooth = true;
          setTimeline(getInitialTimeline(room, timelinePageLimit));
          return;
        }

        // if user is at bottom of timeline
        // keep paginating timeline and conditionally mark as read
        // otherwise we update timeline without paginating
        // so timeline can be updated with evt like: edits, reactions etc
        if (atBottomRef.current) {
          if (document.hasFocus()) {
            // Following the live timeline means the newly-arrived event is visible. Always advance
            // the read marker, even when an older unread divider is still waiting for server sync.
            requestAnimationFrame(() => markAsRead(mx, mEvt.getRoomId()!, privateReceipt));
          }

          if (!document.hasFocus() && !unreadInfo) {
            setUnreadInfo(getRoomUnreadInfo(room));
          }

          scrollToBottomRef.current.count += 1;
          scrollToBottomRef.current.smooth = true;

          setTimeline((ct) => ({
            ...ct,
            range: {
              start: ct.range.start + 1,
              end: ct.range.end + 1,
            },
          }));
          return;
        }
        setTimeline((ct) => ({ ...ct }));
        if (!unreadInfo) {
          setUnreadInfo(getRoomUnreadInfo(room));
        }
      },
      [eventId, mx, navigateRoom, room, timelinePageLimit, unreadInfo, privateReceipt]
    ),
    useCallback(() => setTimeline((current) => ({ ...current })), [])
  );

  useEffect(() => {
    const handleReceipt: RoomEventHandlerMap[RoomEvent.Receipt] = (_, eventRoom) => {
      if (eventRoom?.roomId !== room.roomId) return;
      setReceiptTick((state) => state + 1);
      syncUnreadInfo();
    };

    room.on(RoomEvent.Receipt, handleReceipt);
    return () => {
      room.removeListener(RoomEvent.Receipt, handleReceipt);
    };
  }, [room, syncUnreadInfo]);

  useEffect(() => {
    const handleRoomAccountData: RoomEventHandlerMap[RoomEvent.AccountData] = (
      mEvent,
      eventRoom
    ) => {
      if (eventRoom?.roomId !== room.roomId) return;
      if (mEvent.getType() !== 'm.fully_read') return;
      syncUnreadInfo();
    };

    room.on(RoomEvent.AccountData, handleRoomAccountData);
    return () => {
      room.removeListener(RoomEvent.AccountData, handleRoomAccountData);
    };
  }, [room, syncUnreadInfo]);

  useEffect(() => {
    const trackedEvents = new Set<MatrixEvent>();
    const disposers: Array<() => void> = [];

    timeline.linkedTimelines.forEach((linkedTimeline) => {
      linkedTimeline.getEvents().forEach((event) => {
        if (trackedEvents.has(event)) return;
        trackedEvents.add(event);

        if (!event.isEncrypted() && !event.isDecryptionFailure()) return;

        const handleDecrypted = () => {
          setTimeline((current) => ({ ...current }));
        };

        event.on(MatrixEventEvent.Decrypted, handleDecrypted);
        disposers.push(() => event.removeListener(MatrixEventEvent.Decrypted, handleDecrypted));
      });
    });

    return () => {
      disposers.forEach((dispose) => dispose());
    };
  }, [timeline.linkedTimelines]);

  const handleOpenEvent = useCallback(
    async (
      evtId: string,
      highlight = true,
      onScroll: ((scrolled: boolean) => void) | undefined = undefined
    ) => {
      const evtTimeline = getEventTimeline(room, evtId);
      const absoluteIndex =
        evtTimeline && getEventIdAbsoluteIndexFromTimelineIndex(timelineIndex, evtTimeline, evtId);

      if (typeof absoluteIndex === 'number') {
        const scrolled = scrollToItem(absoluteIndex, {
          behavior: 'smooth',
          align: 'center',
          stopInView: true,
        });
        if (onScroll) onScroll(scrolled);
        setFocusItem({
          index: absoluteIndex,
          scrollTo: false,
          highlight,
        });
      } else {
        setTimeline(getEmptyTimeline());
        loadEventTimeline(evtId);
      }
    },
    [room, timelineIndex, scrollToItem, loadEventTimeline]
  );

  useLiveTimelineRefresh(
    room,
    useCallback(() => {
      if (liveTimelineLinked) {
        setTimeline(getInitialTimeline(room, timelinePageLimit));
      }
      syncUnreadInfo();
    }, [room, liveTimelineLinked, timelinePageLimit, syncUnreadInfo])
  );

  // Stay at bottom when room editor resize
  useResizeObserver(
    useMemo(() => {
      let mounted = false;
      return (entries) => {
        if (!mounted) {
          // skip initial mounting call
          mounted = true;
          return;
        }
        if (!roomInputRef.current) return;
        const editorBaseEntry = getResizeObserverEntry(roomInputRef.current, entries);
        const scrollElement = getScrollElement();
        if (!editorBaseEntry || !scrollElement) return;

        if (atBottomRef.current || composerViewportAnchorUntilRef.current > Date.now()) {
          scrollToBottom(scrollElement);
          setAtBottom(true);
        }
      };
    }, [getScrollElement, roomInputRef]),
    useCallback(() => roomInputRef.current, [roomInputRef])
  );

  useEffect(() => {
    if (screenSize !== ScreenSize.Mobile || typeof window === 'undefined') return undefined;

    const viewport = window.visualViewport;
    const pendingFrames = new Set<number>();
    const pendingTimers = new Set<number>();

    const keepLatestVisible = () => {
      if (composerViewportAnchorUntilRef.current <= Date.now()) return;
      const scrollElement = getScrollElement();
      if (!scrollElement || !atLiveEndRef.current) return;

      scrollToBottom(scrollElement);
      setAtBottom(true);
    };

    const scheduleKeepLatestVisible = () => {
      const frame = window.requestAnimationFrame(() => {
        pendingFrames.delete(frame);
        keepLatestVisible();
      });
      pendingFrames.add(frame);

      // Mobile keyboards animate through several viewport sizes. Following a few settled frames
      // prevents the final resize from hiding the newest message again.
      [80, 240, 480].forEach((delay) => {
        const timer = window.setTimeout(() => {
          pendingTimers.delete(timer);
          keepLatestVisible();
        }, delay);
        pendingTimers.add(timer);
      });
    };

    const handleComposerViewportChange = (evt: Event) => {
      const customEvent = evt as CustomEvent<{ roomId?: string }>;
      if (customEvent.detail?.roomId !== room.roomId) return;
      if (
        !atLiveEndRef.current ||
        (!atBottomRef.current && composerViewportAnchorUntilRef.current <= Date.now())
      ) {
        return;
      }

      composerViewportAnchorUntilRef.current = Date.now() + COMPOSER_VIEWPORT_ANCHOR_DURATION_MS;
      scheduleKeepLatestVisible();
    };

    const handleViewportResize = () => {
      if (composerViewportAnchorUntilRef.current > Date.now()) {
        scheduleKeepLatestVisible();
      }
    };

    window.addEventListener(ROOM_COMPOSER_VIEWPORT_CHANGE, handleComposerViewportChange);
    window.addEventListener('resize', handleViewportResize, { passive: true });
    viewport?.addEventListener('resize', handleViewportResize, { passive: true });

    return () => {
      window.removeEventListener(ROOM_COMPOSER_VIEWPORT_CHANGE, handleComposerViewportChange);
      window.removeEventListener('resize', handleViewportResize);
      viewport?.removeEventListener('resize', handleViewportResize);
      pendingFrames.forEach((frame) => window.cancelAnimationFrame(frame));
      pendingTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [getScrollElement, room.roomId, screenSize]);

  const tryAutoMarkAsRead = useCallback(() => {
    if (eventId && atLiveEndRef.current) {
      navigateRoom(room.roomId, undefined, { replace: true });
    }

    // Every caller verifies that the user is focused at the bottom of the live timeline.
    // An old marker may live in a detached/paginated timeline; it must not block advancing to live.
    requestAnimationFrame(() => markAsRead(mx, room.roomId, privateReceipt));
  }, [eventId, mx, navigateRoom, room, privateReceipt]);

  const tryAutoMarkAsReadAtLiveBottom = useCallback(() => {
    const scrollElement = getScrollElement();

    if (!scrollElement) return;
    if (!document.hasFocus()) return;
    if (!latestRenderedEventId) return;
    if (!liveTimelineLinked || !rangeAtEnd) return;
    if (!isScrollAtBottom(scrollElement)) return;

    tryAutoMarkAsRead();
  }, [getScrollElement, latestRenderedEventId, liveTimelineLinked, rangeAtEnd, tryAutoMarkAsRead]);

  useEffect(() => {
    const scrollElement = getScrollElement();
    if (!scrollElement) return undefined;

    let animationFrame = 0;
    const handleScroll = () => {
      if (animationFrame) return;

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const nextAtBottom = syncAtBottomState();
        if (nextAtBottom && document.hasFocus()) {
          tryAutoMarkAsRead();
        }
      });
    };

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      scrollElement.removeEventListener('scroll', handleScroll);
    };
  }, [getScrollElement, syncAtBottomState, tryAutoMarkAsRead]);

  const debounceSyncAtBottom = useDebounce(
    useCallback(() => {
      syncAtBottomState();
    }, [syncAtBottomState]),
    { wait: 1000 }
  );
  useIntersectionObserver(
    useCallback(
      (entries) => {
        const target = atBottomAnchorRef.current;
        if (!target) return;
        const targetEntry = getIntersectionObserverEntry(target, entries);
        if (!targetEntry) return;
        if (targetEntry?.isIntersecting && atLiveEndRef.current) {
          setAtBottom(true);
          if (document.hasFocus()) {
            tryAutoMarkAsRead();
          }
          return;
        }
        debounceSyncAtBottom();
      },
      [debounceSyncAtBottom, tryAutoMarkAsRead]
    ),
    useCallback(
      () => ({
        root: getScrollElement(),
        rootMargin: '100px',
      }),
      [getScrollElement]
    ),
    useCallback(() => atBottomAnchorRef.current, [])
  );

  useDocumentFocusChange(
    useCallback(
      (inFocus) => {
        if (inFocus && atBottomRef.current) {
          tryAutoMarkAsRead();
        }
      },
      [tryAutoMarkAsRead]
    )
  );

  useSyncState(
    mx,
    useCallback(
      (state, prevState) => {
        if (state && UNREAD_SYNC_STATES.has(state) && state !== prevState) {
          syncUnreadInfo();
        }
      },
      [syncUnreadInfo]
    )
  );

  useEffect(() => {
    if (!document.hasFocus() || !atBottomRef.current) return;
    tryAutoMarkAsRead();
  }, [privateReceipt, tryAutoMarkAsRead]);

  useEffect(() => {
    tryAutoMarkAsReadAtLiveBottom();
  }, [tryAutoMarkAsReadAtLiveBottom, unreadInfo]);

  // Handle up arrow edit
  useKeyDown(
    window,
    useCallback(
      (evt) => {
        if (
          isKeyHotkey('arrowup', evt) &&
          editableActiveElement() &&
          document.activeElement?.getAttribute('data-editable-name') === 'RoomInput' &&
          isEmptyEditor(editor)
        ) {
          const editableEvt = getLatestEditableEvt(room.getLiveTimeline(), (mEvt) =>
            canEditEvent(mx, mEvt)
          );
          const editableEvtId = editableEvt?.getId();
          if (!editableEvtId) return;
          setEditId(editableEvtId);
          evt.preventDefault();
        }
      },
      [mx, room, editor]
    )
  );

  useEffect(() => {
    if (eventId) {
      setTimeline(getEmptyTimeline());
      loadEventTimeline(eventId);
    }
  }, [eventId, loadEventTimeline]);

  // Scroll to bottom on initial timeline load
  useLayoutEffect(() => {
    const scrollEl = scrollRef.current;
    if (scrollEl) {
      scrollToBottom(scrollEl);
      window.requestAnimationFrame(syncAtBottomState);
    }
  }, [syncAtBottomState]);

  // if live timeline is linked and unreadInfo change
  // Scroll to last read message
  useLayoutEffect(() => {
    const { readUptoEventId, inLiveTimeline, scrollTo } = unreadInfo ?? {};
    if (readUptoEventId && inLiveTimeline && scrollTo) {
      const linkedTimelines = getLinkedTimelines(getLiveTimeline(room));
      const evtTimeline = getEventTimeline(room, readUptoEventId);
      const absoluteIndex =
        evtTimeline && getEventIdAbsoluteIndex(linkedTimelines, evtTimeline, readUptoEventId);
      if (typeof absoluteIndex === 'number') {
        scrollToItem(absoluteIndex, {
          behavior: 'instant',
          align: 'start',
          stopInView: true,
        });
      }
    }
  }, [room, unreadInfo, scrollToItem]);

  // scroll to focused message
  useLayoutEffect(() => {
    if (focusItem && focusItem.scrollTo) {
      scrollToItem(focusItem.index, {
        behavior: 'instant',
        align: 'center',
        stopInView: true,
      });
    }

    setTimeout(() => {
      if (!alive()) return;
      setFocusItem((currentItem) => {
        if (currentItem === focusItem) return undefined;
        return currentItem;
      });
    }, 2000);
  }, [alive, focusItem, scrollToItem]);

  // scroll to bottom of timeline
  const scrollToBottomCount = scrollToBottomRef.current.count;
  useLayoutEffect(() => {
    if (scrollToBottomCount > 0) {
      const scrollEl = scrollRef.current;
      if (scrollEl) {
        scrollToBottom(scrollEl, scrollToBottomRef.current.smooth ? 'smooth' : 'instant');
        window.requestAnimationFrame(syncAtBottomState);
      }
    }
  }, [scrollToBottomCount, syncAtBottomState]);

  useEffect(() => {
    syncUnreadInfo();
  }, [syncUnreadInfo]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleOptimisticRead = (evt: Event) => {
      const customEvent = evt as CustomEvent<{ roomId?: string }>;
      if (customEvent.detail?.roomId !== room.roomId) return;
      syncUnreadInfo();
    };

    window.addEventListener(ROOM_MARKED_AS_READ, handleOptimisticRead);
    return () => {
      window.removeEventListener(ROOM_MARKED_AS_READ, handleOptimisticRead);
    };
  }, [room.roomId, syncUnreadInfo]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleFollowLatest = (evt: Event) => {
      const customEvent = evt as CustomEvent<{ roomId?: string }>;
      if (customEvent.detail?.roomId !== room.roomId) return;

      if (eventId) {
        navigateRoom(room.roomId, undefined, { replace: true });
      }

      if (document.hasFocus()) {
        requestAnimationFrame(() => markAsRead(mx, room.roomId, privateReceipt));
      }

      setUnreadInfo(undefined);
      setAtBottom(true);
      setTimeline(getInitialTimeline(room, timelinePageLimit));
      scrollToBottomRef.current.count += 1;
      scrollToBottomRef.current.smooth = true;
    };

    window.addEventListener(ROOM_FOLLOW_LATEST, handleFollowLatest);
    return () => {
      window.removeEventListener(ROOM_FOLLOW_LATEST, handleFollowLatest);
    };
  }, [eventId, mx, navigateRoom, privateReceipt, room, timelinePageLimit]);

  // scroll out of view msg editor in view.
  useEffect(() => {
    if (editId) {
      const editMsgElement =
        (scrollRef.current?.querySelector(`[data-message-id="${editId}"]`) as HTMLElement) ??
        undefined;
      if (editMsgElement) {
        scrollToElement(editMsgElement, {
          align: 'center',
          behavior: 'smooth',
          stopInView: true,
        });
      }
    }
  }, [scrollToElement, editId]);

  const handleJumpToLatest = () => {
    if (eventId) {
      navigateRoom(room.roomId, undefined, { replace: true });
    }
    setUnreadInfo(undefined);
    setAtBottom(true);
    setTimeline(getInitialTimeline(room, timelinePageLimit));
    scrollToBottomRef.current.count += 1;
    scrollToBottomRef.current.smooth = false;

    if (document.hasFocus()) {
      requestAnimationFrame(() => markAsRead(mx, room.roomId, privateReceipt));
    }
  };

  const handleJumpToUnread = () => {
    if (unreadInfo?.readUptoEventId) {
      setTimeline(getEmptyTimeline());
      loadEventTimeline(unreadInfo.readUptoEventId);
    }
  };

  const handleMarkAsRead = () => {
    setUnreadInfo(undefined);
    markAsRead(mx, room.roomId, privateReceipt);
  };

  const handleOpenReply: MouseEventHandler = useCallback(
    async (evt) => {
      const targetId = evt.currentTarget.getAttribute('data-event-id');
      if (!targetId) return;
      handleOpenEvent(targetId);
    },
    [handleOpenEvent]
  );
  const handleOpenThread: MouseEventHandler = useCallback((evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    const targetId = evt.currentTarget.getAttribute('data-event-id');
    if (!targetId) return;
    setThreadDialogRootId(targetId);
  }, []);

  const handleUserClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const userId = evt.currentTarget.getAttribute('data-user-id');
      if (!userId) {
        console.warn('Button should have "data-user-id" attribute!');
        return;
      }
      openUserRoomProfile(
        room.roomId,
        space?.roomId,
        userId,
        evt.currentTarget.getBoundingClientRect()
      );
    },
    [room, space, openUserRoomProfile]
  );
  const handleUsernameClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      evt.preventDefault();
      const userId = evt.currentTarget.getAttribute('data-user-id');
      if (!userId) {
        console.warn('Button should have "data-user-id" attribute!');
        return;
      }
      const name = getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId;
      editor.insertNode(
        createMentionElement(
          userId,
          name.startsWith('@') ? name : `@${name}`,
          userId === mx.getUserId()
        )
      );
      ReactEditor.focus(editor);
      moveCursor(editor);
    },
    [mx, room, editor]
  );

  const handleReplyClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt, startThread = false) => {
      const replyId = evt.currentTarget.getAttribute('data-event-id');
      if (!replyId) {
        console.warn('Button should have "data-event-id" attribute!');
        return;
      }
      const replyEvt = room.findEventById(replyId);
      if (!replyEvt) return;
      const editedReply = getEditedEvent(replyId, replyEvt, room.getUnfilteredTimelineSet());
      const content: IContent = editedReply?.getContent()['m.new_content'] ?? replyEvt.getContent();
      const { body, formatted_body: formattedBody } = content;
      const replyBody =
        typeof body === 'string' && body.trim()
          ? body
          : replyEvt.getType() === MessageEvent.Sticker
          ? '[\u8d34\u7eb8]'
          : body;
      const { 'm.relates_to': relation } = startThread
        ? { 'm.relates_to': { rel_type: 'm.thread', event_id: replyId } }
        : replyEvt.getWireContent();
      const senderId = replyEvt.getSender();
      if (senderId && typeof replyBody === 'string') {
        setReplyDraft({
          userId: senderId,
          eventId: replyId,
          body: replyBody,
          formattedBody,
          relation,
        });
        setTimeout(() => ReactEditor.focus(editor), 100);
      }
    },
    [room, setReplyDraft, editor]
  );

  const handleReactionToggle = useCallback(
    (targetEventId: string, key: string, shortcode?: string) => {
      const relations = getEventReactions(room.getUnfilteredTimelineSet(), targetEventId);
      const allReactions = relations?.getSortedAnnotationsByKey() ?? [];
      const [, reactionsSet] = allReactions.find(([k]) => k === key) ?? [];
      const reactions = reactionsSet ? Array.from(reactionsSet) : [];
      const myReaction = reactions.find(factoryEventSentBy(mx.getUserId()!));

      if (myReaction && !!myReaction?.isRelation()) {
        mx.redactEvent(room.roomId, myReaction.getId()!);
        return;
      }
      const rShortcode =
        shortcode ||
        (reactions.find(eventWithShortcode)?.getContent().shortcode as string | undefined);
      mx.sendEvent(
        room.roomId,
        MessageEvent.Reaction as any,
        getReactionContent(targetEventId, key, rShortcode)
      );
    },
    [mx, room]
  );
  const handleEdit = useCallback(
    (editEvtId?: string) => {
      if (editEvtId) {
        setEditId(editEvtId);
        return;
      }
      setEditId(undefined);
      ReactEditor.focus(editor);
    },
    [editor]
  );
  const handleToggleForwardSelection = useCallback((message: ForwardableMessage) => {
    setForwardMessages((current) => {
      const next = { ...current };

      if (next[message.eventId]) {
        delete next[message.eventId];
      } else {
        next[message.eventId] = message;
      }

      return next;
    });
  }, []);
  const selectedForwardCount = Object.keys(forwardMessages).length;
  const { t } = useTranslation();
  const renderPollStartEvent = (
    mEventId: string,
    mEvent: MatrixEvent,
    item: number,
    timelineSet: EventTimelineSet,
    collapse: boolean
  ) => {
    const reactionRelations = getEventReactions(timelineSet, mEventId);
    const reactions = reactionRelations && reactionRelations.getSortedAnnotationsByKey();
    const hasReactions = reactions && reactions.length > 0;
    const { replyEventId, threadRootId } = getTimelineReplyRelation(mEvent);
    const highlighted = focusItem?.index === item && focusItem.highlight;
    const senderId = mEvent.getSender() ?? '';
    const senderDisplayName =
      getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? senderId;
    const forwardContent = mEvent.getContent();
    const forwardSource = isForwardableMessage(mEvent.getType(), forwardContent)
      ? {
          eventId: mEventId,
          roomId: room.roomId,
          eventType: mEvent.getType(),
          content: forwardContent,
          senderId,
          senderName: senderDisplayName,
          timestamp: mEvent.getTs(),
        }
      : undefined;

    return (
      <Message
        key={mEvent.getId()}
        data-message-item={item}
        data-message-id={mEventId}
        room={room}
        mEvent={mEvent}
        forwardSource={forwardSource}
        forwardSelectionMode={selectedForwardCount > 0}
        forwardSelected={!!forwardMessages[mEventId]}
        onToggleForwardSelection={handleToggleForwardSelection}
        messageSpacing={messageSpacing}
        messageLayout={messageLayout}
        collapse={collapse}
        highlight={highlighted}
        canDelete={canRedact || (canDeleteOwn && mEvent.getSender() === mx.getUserId())}
        canSendReaction={canSendReaction}
        canPinEvent={canPinEvent}
        imagePackRooms={imagePackRooms}
        relations={hasReactions ? reactionRelations : undefined}
        onUserClick={handleUserClick}
        onUsernameClick={handleUsernameClick}
        onReplyClick={handleReplyClick}
        onReactionToggle={handleReactionToggle}
        onEditId={handleEdit}
        reply={
          replyEventId && (
            <Reply
              room={room}
              timelineSet={timelineSet}
              replyEventId={replyEventId}
              threadRootId={threadRootId}
              onClick={handleOpenReply}
              onThreadClick={handleOpenThread}
              getMemberPowerTag={getMemberPowerTag}
              accessibleTagColors={accessiblePowerTagColors}
              legacyUsernameColor={legacyUsernameColor || direct}
            />
          )
        }
        reactions={
          reactionRelations && (
            <Reactions
              style={{ marginTop: config.space.S200 }}
              room={room}
              relations={reactionRelations}
              mEventId={mEventId}
              canSendReaction={canSendReaction}
              onReactionToggle={handleReactionToggle}
            />
          )
        }
        hideReadReceipts={false}
        showDeveloperTools={showDeveloperTools}
        memberPowerTag={getMemberPowerTag(senderId)}
        accessibleTagColors={accessiblePowerTagColors}
        legacyUsernameColor={legacyUsernameColor || direct}
        hour24Clock={hour24Clock}
        dateFormatString={dateFormatString}
        readReceiptUserIds={getInlineReadReceiptUserIds(mEventId)}
      >
        {mEvent.isRedacted() ? (
          <RedactedContent reason={mEvent.getUnsigned().redacted_because?.content.reason} />
        ) : (
          <RenderMessageContent
            displayName={senderDisplayName}
            msgType={mEvent.getContent().msgtype ?? ''}
            eventType={mEvent.getType()}
            ts={mEvent.getTs()}
            getContent={(() => mEvent.getContent()) as GetContentCallback}
            mediaAutoLoad={mediaAutoLoad}
            urlPreview={showUrlPreview}
            htmlReactParserOptions={htmlReactParserOptions}
            linkifyOpts={linkifyOpts}
            outlineAttachment={messageLayout === MessageLayout.Bubble}
            room={room}
            eventId={mEventId}
            imageViewerItems={imageViewerItems}
          />
        )}
      </Message>
    );
  };

  const renderMatrixEvent = useMatrixEventRenderer<
    [string, MatrixEvent, number, EventTimelineSet, boolean]
  >(
    {
      [POLL_START_EVENT_TYPE]: renderPollStartEvent,
      [UNSTABLE_POLL_START_EVENT_TYPE]: renderPollStartEvent,
      [MessageEvent.RoomMessage]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const reactionRelations = getEventReactions(timelineSet, mEventId);
        const reactions = reactionRelations && reactionRelations.getSortedAnnotationsByKey();
        const hasReactions = reactions && reactions.length > 0;
        const { replyEventId, threadRootId } = getTimelineReplyRelation(mEvent);
        const highlighted = focusItem?.index === item && focusItem.highlight;

        const editedEvent = getEditedEvent(mEventId, mEvent, timelineSet);
        const getContent = (() =>
          editedEvent?.getContent()['m.new_content'] ?? mEvent.getContent()) as GetContentCallback;

        const senderId = mEvent.getSender() ?? '';
        const senderDisplayName =
          getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? senderId;
        const forwardContent = getContent<IContent>();
        const forwardSource = isForwardableMessage(MessageEvent.RoomMessage, forwardContent)
          ? {
              eventId: mEventId,
              roomId: room.roomId,
              eventType: MessageEvent.RoomMessage,
              content: forwardContent,
              senderId,
              senderName: senderDisplayName,
              timestamp: mEvent.getTs(),
            }
          : undefined;

        return (
          <Message
            key={mEvent.getId()}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            forwardSource={forwardSource}
            forwardSelectionMode={selectedForwardCount > 0}
            forwardSelected={!!forwardMessages[mEventId]}
            onToggleForwardSelection={handleToggleForwardSelection}
            messageSpacing={messageSpacing}
            messageLayout={messageLayout}
            collapse={collapse}
            highlight={highlighted}
            edit={editId === mEventId}
            canDelete={canRedact || (canDeleteOwn && mEvent.getSender() === mx.getUserId())}
            canSendReaction={canSendReaction}
            canPinEvent={canPinEvent}
            imagePackRooms={imagePackRooms}
            relations={hasReactions ? reactionRelations : undefined}
            onUserClick={handleUserClick}
            onUsernameClick={handleUsernameClick}
            onReplyClick={handleReplyClick}
            onReactionToggle={handleReactionToggle}
            onEditId={handleEdit}
            reply={
              replyEventId && (
                <Reply
                  room={room}
                  timelineSet={timelineSet}
                  replyEventId={replyEventId}
                  threadRootId={threadRootId}
                  onClick={handleOpenReply}
                  onThreadClick={handleOpenThread}
                  getMemberPowerTag={getMemberPowerTag}
                  accessibleTagColors={accessiblePowerTagColors}
                  legacyUsernameColor={legacyUsernameColor || direct}
                />
              )
            }
            reactions={
              reactionRelations && (
                <Reactions
                  style={{ marginTop: config.space.S200 }}
                  room={room}
                  relations={reactionRelations}
                  mEventId={mEventId}
                  canSendReaction={canSendReaction}
                  onReactionToggle={handleReactionToggle}
                />
              )
            }
            hideReadReceipts={false}
            showDeveloperTools={showDeveloperTools}
            memberPowerTag={getMemberPowerTag(senderId)}
            accessibleTagColors={accessiblePowerTagColors}
            legacyUsernameColor={legacyUsernameColor || direct}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
            readReceiptUserIds={getInlineReadReceiptUserIds(mEventId)}
          >
            {mEvent.isRedacted() ? (
              <RedactedContent reason={mEvent.getUnsigned().redacted_because?.content.reason} />
            ) : (
              <RenderMessageContent
                displayName={senderDisplayName}
                msgType={mEvent.getContent().msgtype ?? ''}
                eventType={mEvent.getType()}
                ts={mEvent.getTs()}
                edited={!!editedEvent}
                getContent={getContent}
                mediaAutoLoad={mediaAutoLoad}
                urlPreview={showUrlPreview}
                htmlReactParserOptions={htmlReactParserOptions}
                linkifyOpts={linkifyOpts}
                outlineAttachment={messageLayout === MessageLayout.Bubble}
                room={room}
                eventId={mEventId}
                imageViewerItems={imageViewerItems}
              />
            )}
          </Message>
        );
      },
      [MessageEvent.RoomMessageEncrypted]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const reactionRelations = getEventReactions(timelineSet, mEventId);
        const reactions = reactionRelations && reactionRelations.getSortedAnnotationsByKey();
        const hasReactions = reactions && reactions.length > 0;
        const { replyEventId, threadRootId } = getTimelineReplyRelation(mEvent);
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = mEvent.getSender() ?? '';
        const senderDisplayName =
          getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? senderId;
        const forwardSource = isForwardableMessage(mEvent.getType(), mEvent.getContent())
          ? {
              eventId: mEventId,
              roomId: room.roomId,
              eventType: mEvent.getType(),
              content: mEvent.getContent(),
              senderId,
              senderName: senderDisplayName,
              timestamp: mEvent.getTs(),
            }
          : undefined;

        return (
          <Message
            key={mEvent.getId()}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            forwardSource={forwardSource}
            forwardSelectionMode={selectedForwardCount > 0}
            forwardSelected={!!forwardMessages[mEventId]}
            onToggleForwardSelection={handleToggleForwardSelection}
            messageSpacing={messageSpacing}
            messageLayout={messageLayout}
            collapse={collapse}
            highlight={highlighted}
            edit={editId === mEventId}
            canDelete={canRedact || (canDeleteOwn && mEvent.getSender() === mx.getUserId())}
            canSendReaction={canSendReaction}
            canPinEvent={canPinEvent}
            imagePackRooms={imagePackRooms}
            relations={hasReactions ? reactionRelations : undefined}
            onUserClick={handleUserClick}
            onUsernameClick={handleUsernameClick}
            onReplyClick={handleReplyClick}
            onReactionToggle={handleReactionToggle}
            onEditId={handleEdit}
            reply={
              replyEventId && (
                <Reply
                  room={room}
                  timelineSet={timelineSet}
                  replyEventId={replyEventId}
                  threadRootId={threadRootId}
                  onClick={handleOpenReply}
                  onThreadClick={handleOpenThread}
                  getMemberPowerTag={getMemberPowerTag}
                  accessibleTagColors={accessiblePowerTagColors}
                  legacyUsernameColor={legacyUsernameColor || direct}
                />
              )
            }
            reactions={
              reactionRelations && (
                <Reactions
                  style={{ marginTop: config.space.S200 }}
                  room={room}
                  relations={reactionRelations}
                  mEventId={mEventId}
                  canSendReaction={canSendReaction}
                  onReactionToggle={handleReactionToggle}
                />
              )
            }
            hideReadReceipts={false}
            showDeveloperTools={showDeveloperTools}
            memberPowerTag={getMemberPowerTag(mEvent.getSender() ?? '')}
            accessibleTagColors={accessiblePowerTagColors}
            legacyUsernameColor={legacyUsernameColor || direct}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
            readReceiptUserIds={getInlineReadReceiptUserIds(mEventId)}
          >
            <EncryptedContent mEvent={mEvent}>
              {() => {
                if (mEvent.isRedacted()) return <RedactedContent />;
                if (reactionOrEditEvent(mEvent)) return null;
                if (mEvent.getType() === MessageEvent.Sticker)
                  return (
                    <MSticker
                      content={mEvent.getContent()}
                      renderImageContent={(props) => (
                        <ImageContent
                          {...props}
                          autoPlay={mediaAutoLoad}
                          previewMediaStrategy="stable"
                          viewerItems={imageViewerItems}
                          viewerItemId={mEventId}
                          renderImage={(p) => (
                            <Image
                              {...p}
                              loading={mediaAutoLoad ? 'eager' : 'lazy'}
                              decoding="async"
                            />
                          )}
                          renderViewer={(p) => <ImageViewer {...p} />}
                        />
                      )}
                    />
                  );
                if (
                  mEvent.getType() === MessageEvent.PollStart ||
                  mEvent.getType() === UNSTABLE_POLL_START_EVENT_TYPE
                ) {
                  const senderId = mEvent.getSender() ?? '';
                  const senderDisplayName =
                    getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? senderId;
                  return (
                    <RenderMessageContent
                      displayName={senderDisplayName}
                      msgType={mEvent.getContent().msgtype ?? ''}
                      eventType={mEvent.getType()}
                      ts={mEvent.getTs()}
                      getContent={(() => mEvent.getContent()) as GetContentCallback}
                      mediaAutoLoad={mediaAutoLoad}
                      urlPreview={showUrlPreview}
                      htmlReactParserOptions={htmlReactParserOptions}
                      linkifyOpts={linkifyOpts}
                      outlineAttachment={messageLayout === MessageLayout.Bubble}
                      room={room}
                      eventId={mEventId}
                      imageViewerItems={imageViewerItems}
                    />
                  );
                }
                if (mEvent.getType() === MessageEvent.RoomMessage) {
                  const editedEvent = getEditedEvent(mEventId, mEvent, timelineSet);
                  const getContent = (() =>
                    editedEvent?.getContent()['m.new_content'] ??
                    mEvent.getContent()) as GetContentCallback;

                  const senderId = mEvent.getSender() ?? '';
                  const senderDisplayName =
                    getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? senderId;
                  return (
                    <RenderMessageContent
                      displayName={senderDisplayName}
                      msgType={mEvent.getContent().msgtype ?? ''}
                      eventType={mEvent.getType()}
                      ts={mEvent.getTs()}
                      edited={!!editedEvent}
                      getContent={getContent}
                      mediaAutoLoad={mediaAutoLoad}
                      urlPreview={showUrlPreview}
                      htmlReactParserOptions={htmlReactParserOptions}
                      linkifyOpts={linkifyOpts}
                      outlineAttachment={messageLayout === MessageLayout.Bubble}
                      room={room}
                      eventId={mEventId}
                      imageViewerItems={imageViewerItems}
                    />
                  );
                }
                if (mEvent.getType() === MessageEvent.RoomMessageEncrypted)
                  return (
                    <Text>
                      <MessageNotDecryptedContent />
                    </Text>
                  );
                return (
                  <Text>
                    <MessageUnsupportedContent />
                  </Text>
                );
              }}
            </EncryptedContent>
          </Message>
        );
      },
      [MessageEvent.Sticker]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const reactionRelations = getEventReactions(timelineSet, mEventId);
        const reactions = reactionRelations && reactionRelations.getSortedAnnotationsByKey();
        const hasReactions = reactions && reactions.length > 0;
        const { replyEventId, threadRootId } = getTimelineReplyRelation(mEvent);
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = mEvent.getSender() ?? '';
        const senderDisplayName =
          getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? senderId;
        const forwardSource = isForwardableMessage(MessageEvent.Sticker, mEvent.getContent())
          ? {
              eventId: mEventId,
              roomId: room.roomId,
              eventType: MessageEvent.Sticker,
              content: mEvent.getContent(),
              senderId,
              senderName: senderDisplayName,
              timestamp: mEvent.getTs(),
            }
          : undefined;

        return (
          <Message
            key={mEvent.getId()}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            forwardSource={forwardSource}
            forwardSelectionMode={selectedForwardCount > 0}
            forwardSelected={!!forwardMessages[mEventId]}
            onToggleForwardSelection={handleToggleForwardSelection}
            messageSpacing={messageSpacing}
            messageLayout={messageLayout}
            collapse={collapse}
            highlight={highlighted}
            canDelete={canRedact || (canDeleteOwn && mEvent.getSender() === mx.getUserId())}
            canSendReaction={canSendReaction}
            canPinEvent={canPinEvent}
            imagePackRooms={imagePackRooms}
            relations={hasReactions ? reactionRelations : undefined}
            onUserClick={handleUserClick}
            onUsernameClick={handleUsernameClick}
            onReplyClick={handleReplyClick}
            onReactionToggle={handleReactionToggle}
            reply={
              replyEventId && (
                <Reply
                  room={room}
                  timelineSet={timelineSet}
                  replyEventId={replyEventId}
                  threadRootId={threadRootId}
                  onClick={handleOpenReply}
                  onThreadClick={handleOpenThread}
                  getMemberPowerTag={getMemberPowerTag}
                  accessibleTagColors={accessiblePowerTagColors}
                  legacyUsernameColor={legacyUsernameColor || direct}
                />
              )
            }
            reactions={
              reactionRelations && (
                <Reactions
                  style={{ marginTop: config.space.S200 }}
                  room={room}
                  relations={reactionRelations}
                  mEventId={mEventId}
                  canSendReaction={canSendReaction}
                  onReactionToggle={handleReactionToggle}
                />
              )
            }
            hideReadReceipts={false}
            showDeveloperTools={showDeveloperTools}
            memberPowerTag={getMemberPowerTag(mEvent.getSender() ?? '')}
            accessibleTagColors={accessiblePowerTagColors}
            legacyUsernameColor={legacyUsernameColor || direct}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
            readReceiptUserIds={getInlineReadReceiptUserIds(mEventId)}
          >
            {mEvent.isRedacted() ? (
              <RedactedContent reason={mEvent.getUnsigned().redacted_because?.content.reason} />
            ) : (
              <MSticker
                content={mEvent.getContent()}
                renderImageContent={(props) => (
                  <ImageContent
                    {...props}
                    autoPlay={mediaAutoLoad}
                    previewMediaStrategy="stable"
                    viewerItems={imageViewerItems}
                    viewerItemId={mEventId}
                    renderImage={(p) => (
                      <Image {...p} loading={mediaAutoLoad ? 'eager' : 'lazy'} decoding="async" />
                    )}
                    renderViewer={(p) => <ImageViewer {...p} />}
                  />
                )}
              />
            )}
          </Message>
        );
      },
      [StateEvent.RoomMember]: (mEventId, mEvent, item) => {
        const membershipChanged = isMembershipChanged(mEvent);
        if (membershipChanged && hideMembershipEvents) return null;
        if (!membershipChanged && hideNickAvatarEvents) return null;

        const highlighted = focusItem?.index === item && focusItem.highlight;
        const parsed = parseMemberEvent(mEvent);

        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={mEvent.getId()}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            messageSpacing={messageSpacing}
            canDelete={canRedact || mEvent.getSender() === mx.getUserId()}
            hideReadReceipts={false}
            showDeveloperTools={showDeveloperTools}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={parsed.icon}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    {parsed.body}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [StateEvent.RoomName]: (mEventId, mEvent, item) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = mEvent.getSender() ?? '';
        const senderName = getMemberDisplayName(room, senderId) || getMxIdLocalPart(senderId);

        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={mEvent.getId()}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            messageSpacing={messageSpacing}
            canDelete={canRedact || mEvent.getSender() === mx.getUserId()}
            hideReadReceipts={false}
            showDeveloperTools={showDeveloperTools}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={Icons.Hash}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <b>{senderName}</b>
                    {t('Organisms.RoomCommon.changed_room_name')}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [StateEvent.RoomTopic]: (mEventId, mEvent, item) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = mEvent.getSender() ?? '';
        const senderName = getMemberDisplayName(room, senderId) || getMxIdLocalPart(senderId);

        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={mEvent.getId()}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            messageSpacing={messageSpacing}
            canDelete={canRedact || mEvent.getSender() === mx.getUserId()}
            hideReadReceipts={false}
            showDeveloperTools={showDeveloperTools}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={Icons.Hash}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <b>{senderName}</b>
                    {' \u4fee\u6539\u4e86\u623f\u95f4\u8bdd\u9898'}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [StateEvent.RoomAvatar]: (mEventId, mEvent, item) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = mEvent.getSender() ?? '';
        const senderName = getMemberDisplayName(room, senderId) || getMxIdLocalPart(senderId);

        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={mEvent.getId()}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            messageSpacing={messageSpacing}
            canDelete={canRedact || mEvent.getSender() === mx.getUserId()}
            hideReadReceipts={false}
            showDeveloperTools={showDeveloperTools}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={Icons.Hash}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <b>{senderName}</b>
                    {' \u4fee\u6539\u4e86\u623f\u95f4\u5934\u50cf'}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [StateEvent.GroupCallMemberPrefix]: (mEventId, mEvent, item) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = mEvent.getSender() ?? '';
        const senderName = getMemberDisplayName(room, senderId) || getMxIdLocalPart(senderId);

        const content = mEvent.getContent<SessionMembershipData>();
        const prevContent = mEvent.getPrevContent();

        const callJoined = content.application;
        if (callJoined && 'application' in prevContent) {
          return null;
        }

        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={mEvent.getId()}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            messageSpacing={messageSpacing}
            canDelete={canRedact || mEvent.getSender() === mx.getUserId()}
            hideReadReceipts={false}
            showDeveloperTools={showDeveloperTools}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={callJoined ? Icons.Phone : Icons.PhoneDown}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <b>{senderName}</b>
                    {callJoined
                      ? ' \u52a0\u5165\u4e86\u8bed\u97f3/\u89c6\u9891\u901a\u8bdd'
                      : ' \u7ed3\u675f\u4e86\u8bed\u97f3/\u89c6\u9891\u901a\u8bdd'}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
    },
    (mEventId, mEvent, item) => {
      if (!showHiddenEvents) return null;
      const highlighted = focusItem?.index === item && focusItem.highlight;
      const senderId = mEvent.getSender() ?? '';
      const senderName = getMemberDisplayName(room, senderId) || getMxIdLocalPart(senderId);

      const timeJSX = (
        <Time
          ts={mEvent.getTs()}
          compact={messageLayout === MessageLayout.Compact}
          hour24Clock={hour24Clock}
          dateFormatString={dateFormatString}
        />
      );

      return (
        <Event
          key={mEvent.getId()}
          data-message-item={item}
          data-message-id={mEventId}
          room={room}
          mEvent={mEvent}
          highlight={highlighted}
          messageSpacing={messageSpacing}
          canDelete={canRedact || mEvent.getSender() === mx.getUserId()}
          hideReadReceipts={false}
          showDeveloperTools={showDeveloperTools}
        >
          <EventContent
            messageLayout={messageLayout}
            time={timeJSX}
            iconSrc={Icons.Code}
            content={
              <Box grow="Yes" direction="Column">
                <Text size="T300" priority="300">
                  <b>{senderName}</b>
                  {' \u53d1\u9001\u4e86 '}
                  <code className={customHtmlCss.Code}>{mEvent.getType()}</code>
                  {' \u72b6\u6001\u4e8b\u4ef6'}
                </Text>
              </Box>
            }
          />
        </Event>
      );
    },
    (mEventId, mEvent, item) => {
      if (!showHiddenEvents) return null;
      if (Object.keys(mEvent.getContent()).length === 0) return null;
      if (mEvent.getRelation()) return null;
      if (mEvent.isRedaction()) return null;

      const highlighted = focusItem?.index === item && focusItem.highlight;
      const senderId = mEvent.getSender() ?? '';
      const senderName = getMemberDisplayName(room, senderId) || getMxIdLocalPart(senderId);

      const timeJSX = (
        <Time
          ts={mEvent.getTs()}
          compact={messageLayout === MessageLayout.Compact}
          hour24Clock={hour24Clock}
          dateFormatString={dateFormatString}
        />
      );

      return (
        <Event
          key={mEvent.getId()}
          data-message-item={item}
          data-message-id={mEventId}
          room={room}
          mEvent={mEvent}
          highlight={highlighted}
          messageSpacing={messageSpacing}
          canDelete={canRedact || mEvent.getSender() === mx.getUserId()}
          hideReadReceipts={false}
          showDeveloperTools={showDeveloperTools}
        >
          <EventContent
            messageLayout={messageLayout}
            time={timeJSX}
            iconSrc={Icons.Code}
            content={
              <Box grow="Yes" direction="Column">
                <Text size="T300" priority="300">
                  <b>{senderName}</b>
                  {' \u53d1\u9001\u4e86 '}
                  <code className={customHtmlCss.Code}>{mEvent.getType()}</code>
                  {' \u4e8b\u4ef6'}
                </Text>
              </Box>
            }
          />
        </Event>
      );
    }
  );

  let prevEvent: MatrixEvent | undefined;
  let isPrevRendered = false;
  let newDivider = false;
  let dayDivider = false;
  const eventRenderer = (item: number) => {
    const timelineEntry = getTimelineIndexEntry(timelineIndex, item);
    if (!timelineEntry) return null;
    const { event: mEvent, timelineSet } = timelineEntry;
    const mEventId = mEvent?.getId();

    if (!mEvent || !mEventId) return null;

    const eventSender = mEvent.getSender();
    if (eventSender && ignoredUsersSet.has(eventSender)) {
      return null;
    }
    if (mEvent.isRedacted() && !showHiddenEvents) {
      return null;
    }

    if (!newDivider && readUptoEventIdRef.current) {
      newDivider = prevEvent?.getId() === readUptoEventIdRef.current;
    }
    if (!dayDivider) {
      dayDivider = prevEvent ? !inSameDay(prevEvent.getTs(), mEvent.getTs()) : false;
    }

    const collapsed =
      isPrevRendered &&
      !dayDivider &&
      (!newDivider || eventSender === mx.getUserId()) &&
      prevEvent !== undefined &&
      prevEvent.getSender() === eventSender &&
      prevEvent.getType() === mEvent.getType() &&
      minuteDifference(prevEvent.getTs(), mEvent.getTs()) < 2;

    const eventJSX = reactionOrEditEvent(mEvent)
      ? null
      : renderMatrixEvent(
          mEvent.getType(),
          typeof mEvent.getStateKey() === 'string',
          mEventId,
          mEvent,
          item,
          timelineSet,
          collapsed
        );
    prevEvent = mEvent;
    isPrevRendered = !!eventJSX;

    const newDividerJSX =
      newDivider && eventJSX && eventSender !== mx.getUserId() ? (
        <MessageBase space={messageSpacing}>
          <TimelineDivider style={{ color: color.Success.Main }} variant="Inherit">
            <Badge as="span" size="500" variant="Success" fill="Solid" radii="300">
              <Text size="L400">{'\u65b0\u6d88\u606f'}</Text>
            </Badge>
          </TimelineDivider>
        </MessageBase>
      ) : null;

    const dayDividerJSX =
      dayDivider && eventJSX ? (
        <MessageBase space={messageSpacing}>
          <TimelineDivider variant="Surface">
            <Badge as="span" size="500" variant="Secondary" fill="None" radii="300">
              <Text size="L400">
                {(() => {
                  if (today(mEvent.getTs())) return '\u4eca\u5929';
                  if (yesterday(mEvent.getTs())) return '\u6628\u5929';
                  return timeDayMonthYear(mEvent.getTs());
                })()}
              </Text>
            </Badge>
          </TimelineDivider>
        </MessageBase>
      ) : null;

    if (eventJSX && (newDividerJSX || dayDividerJSX)) {
      if (newDividerJSX) newDivider = false;
      if (dayDividerJSX) dayDivider = false;

      return (
        <React.Fragment key={mEventId}>
          {newDividerJSX}
          {dayDividerJSX}
          {eventJSX}
        </React.Fragment>
      );
    }

    return eventJSX;
  };

  return (
    <Box grow="Yes" style={{ position: 'relative', minHeight: 0 }}>
      {forwardDialog && selectedForwardCount > 0 && (
        <ForwardMessagesModal
          messages={Object.values(forwardMessages)}
          requestClose={() => setForwardDialog(false)}
          onComplete={() => {
            setForwardDialog(false);
            setForwardMessages({});
          }}
        />
      )}
      {threadDialogRootId && (
        <ThreadDialog
          room={room}
          timelineSet={room.getUnfilteredTimelineSet()}
          rootEventId={threadDialogRootId}
          requestClose={() => setThreadDialogRootId(undefined)}
          onOpenEvent={handleOpenEvent}
          mediaAutoLoad={mediaAutoLoad}
          urlPreview={showUrlPreview}
          htmlReactParserOptions={htmlReactParserOptions}
          linkifyOpts={linkifyOpts}
          getMemberPowerTag={getMemberPowerTag}
          accessibleTagColors={accessiblePowerTagColors}
          legacyUsernameColor={legacyUsernameColor || direct}
          hour24Clock={hour24Clock}
          dateFormatString={dateFormatString}
        />
      )}
      {unreadInfo?.readUptoEventId && !unreadInfo?.inLiveTimeline && (
        <TimelineFloat position="Top">
          <Chip
            variant="Primary"
            radii="Pill"
            outlined
            before={<Icon size="50" src={Icons.MessageUnread} />}
            onClick={handleJumpToUnread}
          >
            <Text size="L400">{'\u8df3\u8f6c\u5230\u672a\u8bfb'}</Text>
          </Chip>

          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            before={<Icon size="50" src={Icons.CheckTwice} />}
            onClick={handleMarkAsRead}
          >
            <Text size="L400">{'\u6807\u8bb0\u4e3a\u5df2\u8bfb'}</Text>
          </Chip>
        </TimelineFloat>
      )}
      <Scroll ref={scrollRef} visibility="Hover">
        <Box
          direction="Column"
          justifyContent="End"
          style={{ minHeight: '100%', padding: `${timelinePaddingY} 0` }}
        >
          {!canPaginateBack && rangeAtStart && visibleItems.length > 0 && (
            <div
              style={{
                padding: `${config.space.S700} ${config.space.S400} ${config.space.S600} ${
                  messageLayout === MessageLayout.Compact ? config.space.S400 : toRem(64)
                }`,
              }}
            >
              <RoomIntro room={room} />
            </div>
          )}
          {(canPaginateBack || !rangeAtStart) &&
            (messageLayout === MessageLayout.Compact ? (
              <>
                <MessageBase>
                  <CompactPlaceholder key={visibleItems.length} />
                </MessageBase>
                <MessageBase>
                  <CompactPlaceholder key={visibleItems.length} />
                </MessageBase>
                <MessageBase>
                  <CompactPlaceholder key={visibleItems.length} />
                </MessageBase>
                <MessageBase>
                  <CompactPlaceholder key={visibleItems.length} />
                </MessageBase>
                <MessageBase ref={observeBackAnchor}>
                  <CompactPlaceholder key={visibleItems.length} />
                </MessageBase>
              </>
            ) : (
              <>
                <MessageBase>
                  <DefaultPlaceholder key={visibleItems.length} />
                </MessageBase>
                <MessageBase>
                  <DefaultPlaceholder key={visibleItems.length} />
                </MessageBase>
                <MessageBase ref={observeBackAnchor}>
                  <DefaultPlaceholder key={visibleItems.length} />
                </MessageBase>
              </>
            ))}

          {visibleItems.map(eventRenderer)}

          {(!liveTimelineLinked || !rangeAtEnd) &&
            (messageLayout === MessageLayout.Compact ? (
              <>
                <MessageBase ref={observeFrontAnchor}>
                  <CompactPlaceholder key={visibleItems.length} />
                </MessageBase>
                <MessageBase>
                  <CompactPlaceholder key={visibleItems.length} />
                </MessageBase>
                <MessageBase>
                  <CompactPlaceholder key={visibleItems.length} />
                </MessageBase>
                <MessageBase>
                  <CompactPlaceholder key={visibleItems.length} />
                </MessageBase>
                <MessageBase>
                  <CompactPlaceholder key={visibleItems.length} />
                </MessageBase>
              </>
            ) : (
              <>
                <MessageBase ref={observeFrontAnchor}>
                  <DefaultPlaceholder key={visibleItems.length} />
                </MessageBase>
                <MessageBase>
                  <DefaultPlaceholder key={visibleItems.length} />
                </MessageBase>
                <MessageBase>
                  <DefaultPlaceholder key={visibleItems.length} />
                </MessageBase>
              </>
            ))}
          <span ref={atBottomAnchorRef} />
        </Box>
      </Scroll>
      {selectedForwardCount > 0 && (
        <TimelineFloat position="Bottom">
          <Chip variant="Primary" radii="Pill" outlined>
            <Text size="L400">{`\u5df2\u9009\u62e9 ${selectedForwardCount} \u6761\u6d88\u606f`}</Text>
          </Chip>
          <Chip
            variant="Success"
            radii="Pill"
            outlined
            before={<Icon size="50" src={Icons.ArrowGoRight} />}
            onClick={() => setForwardDialog(true)}
          >
            <Text size="L400">{'\u9009\u62e9\u8f6c\u53d1\u76ee\u6807'}</Text>
          </Chip>
          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            before={<Icon size="50" src={Icons.Cross} />}
            onClick={() => {
              setForwardDialog(false);
              setForwardMessages({});
            }}
          >
            <Text size="L400">{'\u6e05\u7a7a\u9009\u62e9'}</Text>
          </Chip>
        </TimelineFloat>
      )}
      {!atBottom && selectedForwardCount === 0 && (
        <TimelineFloat position="Bottom">
          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            before={<Icon size="50" src={Icons.ArrowBottom} />}
            onClick={handleJumpToLatest}
          >
            <Text size="L400">{'\u8df3\u8f6c\u5230\u6700\u65b0'}</Text>
          </Chip>
        </TimelineFloat>
      )}
    </Box>
  );
}
