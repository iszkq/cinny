import {
  Direction,
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
import { getLinkedTimelines, getLiveTimeline } from '../room/RoomTimeline';
import { decryptAllTimelineEvent } from '../../utils/room';

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

type LocalResultItem = {
  rank: number;
  event: IEventWithRoomId;
  ts: number;
};

type LocalSearchCache = {
  key: string;
  highlights: string[];
  items: LocalResultItem[];
};

const LOCAL_SEARCH_PAGE_LIMIT = 20;
const LOCAL_HISTORY_PAGINATION_LIMIT = 100;
const MAX_LOCAL_HISTORY_PAGES_PER_ROOM = 250;

const emptyResult = (): SearchResult => ({
  highlights: [],
  groups: [],
});

const unique = <T,>(items: T[]): T[] => Array.from(new Set(items));

const normalizeSearchText = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, ' ').trim();

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
  });

const resolveTargetRooms = (mx: MatrixClient, roomIds?: string[]): Room[] => {
  if (roomIds && roomIds.length > 0) {
    return roomIds
      .map((roomId) => mx.getRoom(roomId))
      .filter((room): room is Room => !!room);
  }

  return mx.getRooms();
};

const paginateLocalRoomHistory = async (mx: MatrixClient, room: Room) => {
  let timeline = getLiveTimeline(room);
  let pageCount = 0;

  if (room.hasEncryptionStateEvent()) {
    await decryptAllTimelineEvent(mx, timeline);
  }

  while (
    timeline.getPaginationToken(Direction.Backward) &&
    pageCount < MAX_LOCAL_HISTORY_PAGES_PER_ROOM
  ) {
    const paginated = await mx.paginateEventTimeline(timeline, {
      backwards: true,
      limit: LOCAL_HISTORY_PAGINATION_LIMIT,
    });
    if (!paginated) break;

    const previousTimeline = timeline.getNeighbouringTimeline(Direction.Backward);
    if (!previousTimeline || previousTimeline === timeline) break;

    timeline = previousTimeline;
    pageCount += 1;

    if (room.hasEncryptionStateEvent()) {
      await decryptAllTimelineEvent(mx, timeline);
    }
  }
};

const searchLocalRoomHistory = async (
  mx: MatrixClient,
  params: MessageSearchParams
): Promise<LocalSearchCache> => {
  const { term, order, rooms, senders } = params;
  const searchKey = createCacheKey(params);
  const searchTerm = term?.trim();

  if (!searchTerm) {
    return {
      key: searchKey,
      highlights: [],
      items: [],
    };
  }

  const terms = getSearchTerms(searchTerm);
  const targetSenders = senders ? new Set(senders) : undefined;
  const targetRooms = resolveTargetRooms(mx, rooms);

  if (targetRooms.length === 0) {
    return {
      key: searchKey,
      highlights: terms,
      items: [],
    };
  }

  const results: LocalResultItem[] = [];
  for (const room of targetRooms) {
    await paginateLocalRoomHistory(mx, room);

    const seenEventIds = new Set<string>();
    const timelines = getLinkedTimelines(getLiveTimeline(room));
    timelines.forEach((timeline) => {
      timeline.getEvents().forEach((matrixEvent) => {
        const eventId = matrixEvent.getId();
        if (!eventId || seenEventIds.has(eventId)) return;
        seenEventIds.add(eventId);

        const sender = matrixEvent.getSender();
        if (targetSenders && (!sender || !targetSenders.has(sender))) return;

        const body = eventToSearchBody(matrixEvent);
        if (!body) return;

        const normalizedBody = normalizeSearchText(body);
        const matched = terms.every((token) => normalizedBody.includes(token));
        if (!matched) return;

        results.push({
          rank: calculateLocalRank(body, terms),
          event: toSearchEvent(matrixEvent, room.roomId),
          ts: matrixEvent.getTs(),
        });
      });
    });
  }

  results.sort((a, b) => {
    if (order === SearchOrderBy.Rank) {
      if (b.rank !== a.rank) return b.rank - a.rank;
      return b.ts - a.ts;
    }
    return b.ts - a.ts;
  });

  return {
    key: searchKey,
    highlights: terms,
    items: results,
  };
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

export type MessageSearchParams = {
  term?: string;
  order?: string;
  rooms?: string[];
  senders?: string[];
};
export const useMessageSearch = (params: MessageSearchParams) => {
  const mx = useMatrixClient();
  const { term, order, rooms, senders } = params;
  const localCacheRef = useRef<LocalSearchCache>();

  const searchLocalFallback = useCallback(
    async (nextBatch?: string): Promise<SearchResult> => {
      const cacheKey = createCacheKey(params);
      if (localCacheRef.current?.key !== cacheKey) {
        localCacheRef.current = await searchLocalRoomHistory(mx, params);
      }

      const offset = nextBatch ? Number(nextBatch) || 0 : 0;
      const items = localCacheRef.current.items.slice(offset, offset + LOCAL_SEARCH_PAGE_LIMIT);

      return {
        nextToken:
          offset + LOCAL_SEARCH_PAGE_LIMIT < localCacheRef.current.items.length
            ? String(offset + LOCAL_SEARCH_PAGE_LIMIT)
            : undefined,
        highlights: localCacheRef.current.highlights,
        groups: groupLocalResults(items),
      };
    },
    [mx, params]
  );

  const searchMessages = useCallback(
    async (nextBatch?: string) => {
      if (!term) return emptyResult();

      const limit = LOCAL_SEARCH_PAGE_LIMIT;
      const shouldUseLocalHistory =
        !!rooms &&
        rooms.length > 0 &&
        rooms.some((roomId) => mx.getRoom(roomId)?.hasEncryptionStateEvent());

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
    [mx, order, rooms, senders, term, searchLocalFallback]
  );

  return searchMessages;
};
