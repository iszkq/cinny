import {
  Direction,
  EventTimeline,
  EventType,
  IEventWithRoomId,
  IResultContext,
  ISearchRequestBody,
  ISearchResponse,
  ISearchResult,
  MatrixClient,
  MatrixEvent,
  MsgType,
  Room,
  SearchOrderBy,
} from 'matrix-js-sdk';
import { useCallback, useRef } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { getFirstLinkedTimeline, getLinkedTimelines, getLiveTimeline } from '../room/RoomTimeline';
import { decryptAllTimelineEvent, trimReplyFromBody, trimReplyFromFormattedBody } from '../../utils/room';
import {
  parsePollData,
  POLL_START_EVENT_TYPE,
  UNSTABLE_POLL_START_EVENT_TYPE,
} from '../../utils/polls';

export type SearchMessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'sticker' | 'poll';
export const SEARCH_MESSAGE_TYPES: SearchMessageType[] = [
  'text',
  'image',
  'video',
  'audio',
  'file',
  'sticker',
  'poll',
];

export type ResultItem = {
  rank: number;
  event: IEventWithRoomId;
  context: IResultContext;
};

export type ResultGroup = {
  roomId: string;
  items: ResultItem[];
};

export type SearchResult = {
  nextToken?: string;
  highlights: string[];
  groups: ResultGroup[];
};

export type MessageSearchParams = {
  term?: string;
  order?: string;
  rooms?: string[];
  senders?: string[];
  senderQuery?: string;
  msgTypes?: SearchMessageType[];
  dateFrom?: string;
  dateTo?: string;
  onlyLinks?: boolean;
  includeAllMessages?: boolean;
};

type LocalResultItem = {
  rank: number;
  event: IEventWithRoomId;
  ts: number;
};

type LocalRoomSearchState = {
  exhausted: boolean;
  loadedPageCount: number;
  seenEventIds: Set<string>;
  decryptedEventCounts: WeakMap<EventTimeline, number>;
};

type LocalSearchState = {
  key: string;
  highlights: string[];
  terms: string[];
  items: LocalResultItem[];
  order?: string;
  targetRooms: Room[];
  targetSenders?: Set<string>;
  senderQuery?: string;
  msgTypes?: SearchMessageType[];
  dateFrom?: string;
  dateTo?: string;
  onlyLinks?: boolean;
  roomStates: Map<string, LocalRoomSearchState>;
  fullyLoaded: boolean;
};

const LOCAL_SEARCH_PAGE_LIMIT = 20;
const LOCAL_HISTORY_PAGINATION_LIMIT = 100;
const MAX_LOCAL_HISTORY_PAGES_PER_ROOM = 250;
const URL_SEARCH_REG = /(?:https?:\/\/|www\.|matrix\.to\/#\/|magnet:)/i;

const emptyResult = (): SearchResult => ({
  highlights: [],
  groups: [],
});

const unique = <T>(items: T[]): T[] => Array.from(new Set(items));

const normalizeSearchText = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, ' ').trim();

const normalizeSenderQuery = (value: string): string => value.toLowerCase().trim();

const parseDateStart = (value?: string): number | undefined => {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00`);
  const time = parsed.getTime();
  return Number.isNaN(time) ? undefined : time;
};

const parseDateEnd = (value?: string): number | undefined => {
  if (!value) return undefined;
  const parsed = new Date(`${value}T23:59:59.999`);
  const time = parsed.getTime();
  return Number.isNaN(time) ? undefined : time;
};

const matchesDateRange = (ts: number, dateFrom?: string, dateTo?: string): boolean => {
  const start = parseDateStart(dateFrom);
  const end = parseDateEnd(dateTo);

  if (typeof start === 'number' && ts < start) return false;
  if (typeof end === 'number' && ts > end) return false;
  return true;
};

const bodyContainsUrl = (...values: Array<string | undefined>): boolean =>
  values.some((value) => typeof value === 'string' && URL_SEARCH_REG.test(value));

const getMatrixEventMessageType = (event: MatrixEvent): SearchMessageType | undefined => {
  if (event.getType() === EventType.Sticker) return 'sticker';
  if (
    event.getType() === POLL_START_EVENT_TYPE ||
    event.getType() === UNSTABLE_POLL_START_EVENT_TYPE
  ) {
    return 'poll';
  }
  if (event.getType() !== EventType.RoomMessage) return undefined;

  const msgType = event.getContent().msgtype ?? MsgType.Text;

  if (msgType === MsgType.Image) return 'image';
  if (msgType === MsgType.Video) return 'video';
  if (msgType === MsgType.Audio) return 'audio';
  if (msgType === MsgType.File) return 'file';
  return 'text';
};

const matchesMessageType = (
  messageType: SearchMessageType | undefined,
  selectedTypes?: SearchMessageType[]
): boolean => {
  if (!selectedTypes || selectedTypes.length === 0) return true;
  if (!messageType) return false;
  return selectedTypes.includes(messageType);
};

const matchesSenderFilter = (
  room: Room,
  senderId: string | undefined,
  senderQuery?: string
): boolean => {
  if (!senderQuery) return true;
  if (!senderId) return false;

  const query = normalizeSenderQuery(senderQuery);
  if (!query) return true;

  const displayName = room.getMember(senderId)?.name;
  return [senderId, displayName]
    .filter((value): value is string => !!value)
    .some((value) => value.toLowerCase().includes(query));
};

const eventMatchesLinkFilter = (
  event: MatrixEvent | IEventWithRoomId,
  messageType: SearchMessageType | undefined,
  onlyLinks?: boolean
): boolean => {
  if (!onlyLinks) return true;
  if (messageType && messageType !== 'text') return false;

  const content = 'getContent' in event ? event.getContent() : event.content;
  const body = typeof content?.body === 'string' ? trimReplyFromBody(content.body) : undefined;
  const formattedBody =
    typeof content?.formatted_body === 'string' ? content.formatted_body : undefined;
  const trimmedFormattedBody =
    typeof formattedBody === 'string' ? trimReplyFromFormattedBody(formattedBody) : undefined;

  return bodyContainsUrl(body, trimmedFormattedBody);
};

const getSearchTerms = (term: string): string[] => {
  const normalizedTerm = normalizeSearchText(term);
  const splitTerms = normalizedTerm.split(' ').filter(Boolean);

  if (!normalizedTerm) return [];
  return unique([normalizedTerm, ...splitTerms]);
};

const eventToSearchBody = (event: MatrixEvent): string | undefined => {
  if (event.isRedacted()) return undefined;

  if (event.getType() === EventType.Sticker) {
    const stickerBody = event.getContent().body;
    return typeof stickerBody === 'string' ? stickerBody : undefined;
  }

  if (
    event.getType() === POLL_START_EVENT_TYPE ||
    event.getType() === UNSTABLE_POLL_START_EVENT_TYPE
  ) {
    const poll = parsePollData(event.getContent());
    if (!poll) return undefined;
    return [poll.title, poll.description, ...poll.options.map((option) => option.text)]
      .filter((value): value is string => !!value)
      .join(' ');
  }

  if (event.getType() !== EventType.RoomMessage) return undefined;

  const content = event.getContent();
  const body = typeof content.body === 'string' ? content.body : '';
  const msgType = content.msgtype ?? MsgType.Text;

  if (body) return body;

  if (msgType === MsgType.Image) return '[image]';
  if (msgType === MsgType.Video) return '[video]';
  if (msgType === MsgType.Audio) return '[audio]';
  if (msgType === MsgType.File) return '[file]';

  return undefined;
};

const toSearchEvent = (event: MatrixEvent, roomId: string): IEventWithRoomId => {
  const rawEvent = event.event as IEventWithRoomId;

  return {
    ...rawEvent,
    room_id: rawEvent.room_id ?? roomId,
    event_id: rawEvent.event_id ?? event.getId() ?? '',
    sender: rawEvent.sender ?? event.getSender() ?? '',
    type: event.getType(),
    content: event.getContent(),
    origin_server_ts: event.getTs(),
  };
};

const calculateLocalRank = (body: string, terms: string[]): number => {
  const normalizedBody = normalizeSearchText(body);

  return terms.reduce((score, term) => {
    if (!term) return score;

    let fromIndex = 0;
    let matches = 0;
    while (fromIndex < normalizedBody.length) {
      const matchIndex = normalizedBody.indexOf(term, fromIndex);
      if (matchIndex < 0) break;
      matches += 1;
      fromIndex = matchIndex + term.length;
    }

    return score + matches * Math.max(term.length, 1);
  }, 0);
};

const makeContext = (): IResultContext => ({
  events_before: [],
  events_after: [],
  profile_info: {},
  start: '',
  end: '',
});

const groupLocalResults = (items: LocalResultItem[]): ResultGroup[] => {
  const roomToItems = new Map<string, ResultItem[]>();

  items.forEach((item) => {
    const roomId = item.event.room_id;
    const roomItems = roomToItems.get(roomId) ?? [];
    roomItems.push({
      rank: item.rank,
      event: item.event,
      context: makeContext(),
    });
    roomToItems.set(roomId, roomItems);
  });

  return Array.from(roomToItems.entries()).map(([roomId, groupedItems]) => ({
    roomId,
    items: groupedItems,
  }));
};

const createCacheKey = (params: MessageSearchParams): string =>
  JSON.stringify({
    term: params.term ?? '',
    order: params.order ?? '',
    rooms: params.rooms ?? [],
    senders: params.senders ?? [],
    senderQuery: params.senderQuery ?? '',
    msgTypes: params.msgTypes ?? [],
    dateFrom: params.dateFrom ?? '',
    dateTo: params.dateTo ?? '',
    onlyLinks: params.onlyLinks ?? false,
    includeAllMessages: params.includeAllMessages ?? false,
  });

const resolveTargetRooms = (mx: MatrixClient, roomIds?: string[]): Room[] => {
  if (roomIds && roomIds.length > 0) {
    return roomIds.map((roomId) => mx.getRoom(roomId)).filter((room): room is Room => !!room);
  }

  return mx.getRooms();
};

const sortLocalResults = (results: LocalResultItem[], order?: string) => {
  results.sort((a, b) => {
    if (order === SearchOrderBy.Rank) {
      if (b.rank !== a.rank) return b.rank - a.rank;
      return b.ts - a.ts;
    }
    return b.ts - a.ts;
  });
};

const createLocalSearchState = (mx: MatrixClient, params: MessageSearchParams): LocalSearchState => {
  const {
    term,
    order,
    rooms,
    senders,
    senderQuery,
    msgTypes,
    dateFrom,
    dateTo,
    onlyLinks,
    includeAllMessages,
  } = params;
  const searchKey = createCacheKey(params);
  const searchTerm = term?.trim();
  const hasLocalFilters =
    !!(senders && senders.length > 0) ||
    !!senderQuery ||
    !!dateFrom ||
    !!dateTo ||
    !!onlyLinks ||
    !!(msgTypes && msgTypes.length > 0);

  if (!searchTerm && !hasLocalFilters && !includeAllMessages) {
    return {
      key: searchKey,
      highlights: [],
      terms: [],
      items: [],
      order,
      targetRooms: [],
      roomStates: new Map(),
      fullyLoaded: true,
    };
  }

  const terms = searchTerm ? getSearchTerms(searchTerm) : [];
  const targetSenders = senders ? new Set(senders) : undefined;
  const targetRooms = resolveTargetRooms(mx, rooms);

  if (targetRooms.length === 0) {
    return {
      key: searchKey,
      highlights: terms,
      terms,
      items: [],
      order,
      targetRooms,
      targetSenders,
      senderQuery,
      msgTypes,
      dateFrom,
      dateTo,
      onlyLinks,
      roomStates: new Map(),
      fullyLoaded: true,
    };
  }

  return {
    key: searchKey,
    highlights: terms,
    terms,
    items: [],
    order,
    targetRooms,
    targetSenders,
    senderQuery,
    msgTypes,
    dateFrom,
    dateTo,
    onlyLinks,
    roomStates: new Map(
      targetRooms.map((room) => [
        room.roomId,
        {
          exhausted: false,
          loadedPageCount: 0,
          seenEventIds: new Set<string>(),
          decryptedEventCounts: new WeakMap<EventTimeline, number>(),
        },
      ])
    ),
    fullyLoaded: false,
  };
};

const collectLoadedRoomResults = async (
  mx: MatrixClient,
  room: Room,
  state: LocalSearchState,
  roomState: LocalRoomSearchState
) => {
  const timelines = getLinkedTimelines(getLiveTimeline(room));

  if (room.hasEncryptionStateEvent()) {
    for (const timeline of timelines) {
      const eventCount = timeline.getEvents().length;
      if (roomState.decryptedEventCounts.get(timeline) === eventCount) {
        continue;
      }

      await decryptAllTimelineEvent(mx, timeline);
      roomState.decryptedEventCounts.set(timeline, timeline.getEvents().length);
    }
  }

  let added = false;

  timelines.forEach((timeline) => {
    timeline.getEvents().forEach((matrixEvent) => {
      const eventId = matrixEvent.getId();
      if (!eventId || roomState.seenEventIds.has(eventId)) return;
      roomState.seenEventIds.add(eventId);

      const sender = matrixEvent.getSender();
      if (state.targetSenders && (!sender || !state.targetSenders.has(sender))) return;
      if (!matchesSenderFilter(room, sender ?? undefined, state.senderQuery)) return;

      const ts = matrixEvent.getTs();
      if (!matchesDateRange(ts, state.dateFrom, state.dateTo)) return;

      const messageType = getMatrixEventMessageType(matrixEvent);
      if (!matchesMessageType(messageType, state.msgTypes)) return;
      if (!eventMatchesLinkFilter(matrixEvent, messageType, state.onlyLinks)) return;

      const body = eventToSearchBody(matrixEvent);
      if (!body) return;

      if (state.terms.length > 0) {
        const normalizedBody = normalizeSearchText(body);
        const matched = state.terms.every((token) => normalizedBody.includes(token));
        if (!matched) return;
      }

      state.items.push({
        rank: state.terms.length > 0 ? calculateLocalRank(body, state.terms) : 0,
        event: toSearchEvent(matrixEvent, room.roomId),
        ts,
      });
      added = true;
    });
  });

  if (added) {
    sortLocalResults(state.items, state.order);
  }
};

const paginateLocalRoomHistoryStep = async (
  mx: MatrixClient,
  room: Room,
  roomState: LocalRoomSearchState
): Promise<boolean> => {
  const oldestTimeline = getFirstLinkedTimeline(getLiveTimeline(room), Direction.Backward);

  if (
    !oldestTimeline.getPaginationToken(Direction.Backward) ||
    roomState.loadedPageCount >= MAX_LOCAL_HISTORY_PAGES_PER_ROOM
  ) {
    roomState.exhausted = true;
    return false;
  }

  const paginated = await mx.paginateEventTimeline(oldestTimeline, {
    backwards: true,
    limit: LOCAL_HISTORY_PAGINATION_LIMIT,
  });
  roomState.loadedPageCount += 1;

  const nextOldestTimeline = getFirstLinkedTimeline(getLiveTimeline(room), Direction.Backward);
  const hasMoreBackwardPages =
    !!nextOldestTimeline.getPaginationToken(Direction.Backward) &&
    roomState.loadedPageCount < MAX_LOCAL_HISTORY_PAGES_PER_ROOM;
  roomState.exhausted = !paginated || !hasMoreBackwardPages;

  return paginated;
};

const ensureLocalResultsLoaded = async (
  mx: MatrixClient,
  state: LocalSearchState,
  requiredCount: number
) => {
  for (const room of state.targetRooms) {
    const roomState = state.roomStates.get(room.roomId);
    if (!roomState) continue;
    await collectLoadedRoomResults(mx, room, state, roomState);
  }

  while (!state.fullyLoaded && state.items.length < requiredCount) {
    const pendingRooms = state.targetRooms.filter((room) => {
      const roomState = state.roomStates.get(room.roomId);
      return !!roomState && !roomState.exhausted;
    });

    if (pendingRooms.length === 0) {
      state.fullyLoaded = true;
      break;
    }

    let paginatedAny = false;

    for (const room of pendingRooms) {
      const roomState = state.roomStates.get(room.roomId);
      if (!roomState || roomState.exhausted) continue;

      const paginated = await paginateLocalRoomHistoryStep(mx, room, roomState);
      await collectLoadedRoomResults(mx, room, state, roomState);

      paginatedAny = paginatedAny || paginated;
      if (state.items.length >= requiredCount) {
        break;
      }
    }

    if (!paginatedAny) {
      state.fullyLoaded = true;
      break;
    }
  }

  if (state.targetRooms.every((room) => state.roomStates.get(room.roomId)?.exhausted)) {
    state.fullyLoaded = true;
  }
};

const groupSearchResult = (results: ISearchResult[]): ResultGroup[] => {
  const groups: ResultGroup[] = [];

  results.forEach((item) => {
    const roomId = item.result.room_id;
    const resultItem: ResultItem = {
      rank: item.rank,
      event: item.result,
      context: item.context,
    };

    const lastAddedGroup: ResultGroup | undefined = groups[groups.length - 1];
    if (lastAddedGroup && roomId === lastAddedGroup.roomId) {
      lastAddedGroup.items.push(resultItem);
      return;
    }
    groups.push({
      roomId,
      items: [resultItem],
    });
  });

  return groups;
};

const parseSearchResult = (result: ISearchResponse): SearchResult => {
  const roomEvents = result.search_categories.room_events;

  const searchResult: SearchResult = {
    nextToken: roomEvents?.next_batch,
    highlights: roomEvents?.highlights ?? [],
    groups: groupSearchResult(roomEvents?.results ?? []),
  };

  return searchResult;
};

export const useMessageSearch = (params: MessageSearchParams) => {
  const mx = useMatrixClient();
  const {
    term,
    order,
    rooms,
    senders,
    senderQuery,
    msgTypes,
    dateFrom,
    dateTo,
    onlyLinks,
    includeAllMessages,
  } = params;
  const localCacheRef = useRef<LocalSearchState>();
  const hasLocalFilters =
    !!(senders && senders.length > 0) ||
    !!senderQuery ||
    !!dateFrom ||
    !!dateTo ||
    !!onlyLinks ||
    !!(msgTypes && msgTypes.length > 0);

  const searchLocalFallback = useCallback(
    async (nextBatch?: string): Promise<SearchResult> => {
      const cacheKey = createCacheKey(params);
      if (localCacheRef.current?.key !== cacheKey) {
        localCacheRef.current = createLocalSearchState(mx, params);
      }

      const offset = nextBatch ? Number(nextBatch) || 0 : 0;
      await ensureLocalResultsLoaded(mx, localCacheRef.current, offset + LOCAL_SEARCH_PAGE_LIMIT);
      const items = localCacheRef.current.items.slice(offset, offset + LOCAL_SEARCH_PAGE_LIMIT);
      const hasMoreLocalResults =
        offset + LOCAL_SEARCH_PAGE_LIMIT < localCacheRef.current.items.length ||
        !localCacheRef.current.fullyLoaded;

      return {
        nextToken: hasMoreLocalResults ? String(offset + LOCAL_SEARCH_PAGE_LIMIT) : undefined,
        highlights: localCacheRef.current.highlights,
        groups: groupLocalResults(items),
      };
    },
    [mx, params]
  );

  const searchMessages = useCallback(
    async (nextBatch?: string) => {
      if (!term) {
        if (hasLocalFilters || includeAllMessages) {
          return searchLocalFallback(nextBatch);
        }
        return emptyResult();
      }

      const limit = LOCAL_SEARCH_PAGE_LIMIT;
      const shouldUseLocalHistory =
        !!includeAllMessages ||
        hasLocalFilters ||
        (!!rooms &&
          rooms.length > 0 &&
          rooms.some((roomId) => mx.getRoom(roomId)?.hasEncryptionStateEvent()));

      if (shouldUseLocalHistory) {
        return searchLocalFallback(nextBatch);
      }

      const requestBody: ISearchRequestBody = {
        search_categories: {
          room_events: {
            event_context: {
              before_limit: 0,
              after_limit: 0,
              include_profile: false,
            },
            filter: {
              limit,
              rooms,
              senders,
            },
            include_state: false,
            order_by: order as SearchOrderBy.Recent,
            search_term: term,
          },
        },
      };

      try {
        const r = await mx.search({
          body: requestBody,
          next_batch: nextBatch === '' ? undefined : nextBatch,
        });
        const parsed = parseSearchResult(r);

        if (!nextBatch && parsed.groups.length === 0) {
          return searchLocalFallback();
        }

        return parsed;
      } catch (error) {
        if (!nextBatch) {
          return searchLocalFallback();
        }
        throw error;
      }
    },
    [hasLocalFilters, includeAllMessages, mx, order, rooms, searchLocalFallback, senders, term]
  );

  return searchMessages;
};
