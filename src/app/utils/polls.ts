import { IContent, MatrixEvent, Room } from 'matrix-js-sdk';

export const POLL_MSGTYPE = 'io.cinny.poll';
export const POLL_DATA_KEY = 'io.cinny.poll';
export const POLL_START_EVENT_TYPE = 'm.poll.start';
export const POLL_START_CONTENT_KEY = 'm.poll.start';
export const POLL_RESPONSE_EVENT_TYPE = 'm.poll.response';
export const POLL_RESPONSE_CONTENT_KEY = 'm.poll.response';
export const POLL_END_EVENT_TYPE = 'm.poll.end';
export const POLL_END_CONTENT_KEY = 'm.poll.end';
export const POLL_REFERENCE_REL_TYPE = 'm.reference';
export const POLL_DISCLOSED_KIND = 'm.poll.disclosed';
export const POLL_UNDISCLOSED_KIND = 'm.poll.undisclosed';
export const UNSTABLE_POLL_START_EVENT_TYPE = 'org.matrix.msc3381.poll.start';
export const UNSTABLE_POLL_START_CONTENT_KEY = 'org.matrix.msc3381.poll.start';
export const UNSTABLE_POLL_RESPONSE_EVENT_TYPE = 'org.matrix.msc3381.poll.response';
export const UNSTABLE_POLL_RESPONSE_CONTENT_KEY = 'org.matrix.msc3381.poll.response';
export const UNSTABLE_POLL_END_EVENT_TYPE = 'org.matrix.msc3381.poll.end';
export const UNSTABLE_POLL_END_CONTENT_KEY = 'org.matrix.msc3381.poll.end';
export const UNSTABLE_POLL_DISCLOSED_KIND = 'org.matrix.msc3381.poll.disclosed';
export const UNSTABLE_POLL_UNDISCLOSED_KIND = 'org.matrix.msc3381.poll.undisclosed';
export const LEGACY_POLL_RESPONSE_EVENT_TYPE = 'io.cinny.poll.response';
export const POLL_RESPONSE_DATA_KEY = 'io.cinny.poll.response';
export const POLL_RESPONSE_REL_TYPE = 'io.cinny.poll.response';
export const POLL_MAX_OPTIONS = 10;
const MATRIX_TEXT_KEY = 'm.text';
const UNSTABLE_MATRIX_TEXT_KEY = 'org.matrix.msc1767.text';
const POLL_RESPONSE_EVENT_TYPES = [
  POLL_RESPONSE_EVENT_TYPE,
  UNSTABLE_POLL_RESPONSE_EVENT_TYPE,
  LEGACY_POLL_RESPONSE_EVENT_TYPE,
] as const;
const POLL_END_EVENT_TYPES = [POLL_END_EVENT_TYPE, UNSTABLE_POLL_END_EVENT_TYPE] as const;
export const POLL_SUMMARY_SNAPSHOT_KEY = 'io.cinny.poll.summary';
const POLL_SUMMARY_STORAGE_PREFIX = 'cinny_poll_summary';

export type PollMode = 'single' | 'multiple' | 'pk';
export type CreatePollMode = 'single' | 'multiple';

// Most deployed Matrix rooms and clients still interoperate better with MSC3381 poll events.
export const OUTGOING_POLL_START_EVENT_TYPE = UNSTABLE_POLL_START_EVENT_TYPE;
export const OUTGOING_POLL_RESPONSE_EVENT_TYPE = UNSTABLE_POLL_RESPONSE_EVENT_TYPE;
export const OUTGOING_POLL_END_EVENT_TYPE = UNSTABLE_POLL_END_EVENT_TYPE;

export type PollOption = {
  id: string;
  text: string;
};

export type PollData = {
  version: 1;
  title: string;
  description?: string;
  mode: PollMode;
  options: PollOption[];
  maxSelections: number;
  showVoters: boolean;
  expiresAt?: number;
};

export type CreatePollInput = {
  title: string;
  description?: string;
  mode: CreatePollMode;
  options: string[];
  maxSelections?: number;
  showVoters: boolean;
};

export type PollResponseData = {
  version: 1;
  pollEventId: string;
  answers: string[];
  answeredAt: number;
};

export type PollSummary = {
  optionToUserIds: Map<string, string[]>;
  myAnswers: string[];
  myResponseEventIds: string[];
  myResponseEvents: MatrixEvent[];
  totalSelections: number;
  totalVoters: number;
  endedAt?: number;
};

type PollRelationCacheEntry = {
  events: MatrixEvent[];
};

export type PollSummarySnapshot = {
  version: 1;
  updatedAt: number;
  endedAt?: number;
  optionToUserIds: Record<string, string[]>;
  myAnswers: string[];
  myResponseEventIds: string[];
  totalSelections: number;
  totalVoters: number;
};

const sanitizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmedValue = value.trim();
  return trimmedValue || undefined;
};

const sanitizePollOptions = (options: string[]): PollOption[] =>
  options
    .map((option, index) => ({
      id: `option_${index + 1}`,
      text: option.trim(),
    }))
    .filter((option) => option.text.length > 0)
    .slice(0, POLL_MAX_OPTIONS);

const getRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;

const isDefined = <T>(value: T | undefined | null): value is T => value !== undefined && value !== null;

const pollRelationEventsCache = new Map<string, PollRelationCacheEntry>();
const pollSummarySnapshotCache = new Map<string, PollSummarySnapshot>();

const getPollRelationCacheKey = (roomId: string, pollEventId: string): string =>
  `${roomId}\u0000${pollEventId}`;

const getOrCreatePollRelationCacheEntry = (
  roomId: string,
  pollEventId: string
): PollRelationCacheEntry => {
  const cacheKey = getPollRelationCacheKey(roomId, pollEventId);
  const cachedEntry = pollRelationEventsCache.get(cacheKey);
  if (cachedEntry) return cachedEntry;

  const nextEntry: PollRelationCacheEntry = {
    events: [],
  };
  pollRelationEventsCache.set(cacheKey, nextEntry);
  return nextEntry;
};

const getLocalStorage = (): Storage | undefined => {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return undefined;
    }
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const getPollSummaryStorageKey = (roomId: string, pollEventId: string): string => {
  const storage = getLocalStorage();
  const baseUrl = storage?.getItem('cinny_hs_base_url') ?? 'unknown_base';
  const userId = storage?.getItem('cinny_user_id') ?? 'unknown_user';

  return `${POLL_SUMMARY_STORAGE_PREFIX}::${baseUrl}::${userId}::${roomId}::${pollEventId}`;
};

const mergeRelationEvents = (
  existingEvents: MatrixEvent[],
  incomingEvents: MatrixEvent[],
  preferIncoming: boolean
): MatrixEvent[] => {
  const eventMap = new Map<string, MatrixEvent>();
  const primaryEvents = preferIncoming ? existingEvents : incomingEvents;
  const secondaryEvents = preferIncoming ? incomingEvents : existingEvents;

  primaryEvents.forEach((event) => {
    const eventId = event.getId();
    if (!eventId) return;
    eventMap.set(eventId, event);
  });

  secondaryEvents.forEach((event) => {
    const eventId = event.getId();
    if (!eventId) return;
    eventMap.set(eventId, event);
  });

  return Array.from(eventMap.values());
};

const updatePollRelationEventsCache = (
  roomId: string,
  pollEventId: string,
  incomingEvents: MatrixEvent[],
  preferIncoming: boolean
): MatrixEvent[] => {
  const cacheEntry = getOrCreatePollRelationCacheEntry(roomId, pollEventId);
  cacheEntry.events = mergeRelationEvents(cacheEntry.events, incomingEvents, preferIncoming);
  return cacheEntry.events;
};

const sanitizeStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const getPollSummarySnapshotRecord = (value: unknown): PollSummarySnapshot | undefined => {
  const record = getRecord(value);
  if (!record) return undefined;

  const rawOptionToUserIds = getRecord(record.optionToUserIds);
  if (!rawOptionToUserIds) return undefined;

  const optionToUserIds = Object.fromEntries(
    Object.entries(rawOptionToUserIds).map(([optionId, userIds]) => [
      optionId,
      Array.from(new Set(sanitizeStringArray(userIds))),
    ])
  );

  const totalSelections = Object.values(optionToUserIds).reduce(
    (count, userIds) => count + userIds.length,
    0
  );
  const totalVoters = Object.values(optionToUserIds).reduce((userIds, optionUserIds) => {
    optionUserIds.forEach((userId) => userIds.add(userId));
    return userIds;
  }, new Set<string>()).size;

  return {
    version: 1,
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0,
    endedAt: typeof record.endedAt === 'number' ? record.endedAt : undefined,
    optionToUserIds,
    myAnswers: Array.from(new Set(sanitizeStringArray(record.myAnswers))),
    myResponseEventIds: Array.from(new Set(sanitizeStringArray(record.myResponseEventIds))),
    totalSelections:
      typeof record.totalSelections === 'number' ? record.totalSelections : totalSelections,
    totalVoters: typeof record.totalVoters === 'number' ? record.totalVoters : totalVoters,
  };
};

const getSummaryUserAnswers = (summary: PollSummary): Map<string, string[]> => {
  const userAnswers = new Map<string, string[]>();

  summary.optionToUserIds.forEach((userIds, optionId) => {
    userIds.forEach((userId) => {
      const currentAnswers = userAnswers.get(userId) ?? [];
      if (!currentAnswers.includes(optionId)) {
        currentAnswers.push(optionId);
      }
      userAnswers.set(userId, currentAnswers);
    });
  });

  return userAnswers;
};

export const pollSummaryFromSnapshot = (
  snapshot: PollSummarySnapshot,
  optionIds: string[]
): PollSummary => {
  const optionToUserIds = new Map<string, string[]>();

  optionIds.forEach((optionId) => {
    optionToUserIds.set(optionId, []);
  });

  Object.entries(snapshot.optionToUserIds).forEach(([optionId, userIds]) => {
    optionToUserIds.set(optionId, Array.from(new Set(userIds)));
  });

  return {
    optionToUserIds,
    myAnswers: snapshot.myAnswers,
    myResponseEventIds: snapshot.myResponseEventIds,
    myResponseEvents: [],
    totalSelections: snapshot.totalSelections,
    totalVoters: snapshot.totalVoters,
    endedAt: snapshot.endedAt,
  };
};

export const combinePollSummaries = (
  baseSummary: PollSummary,
  overlaySummary: PollSummary
): PollSummary => {
  const optionIds = Array.from(
    new Set([...baseSummary.optionToUserIds.keys(), ...overlaySummary.optionToUserIds.keys()])
  );
  const userAnswers = getSummaryUserAnswers(baseSummary);

  getSummaryUserAnswers(overlaySummary).forEach((answers, userId) => {
    userAnswers.set(userId, answers);
  });

  const optionToUserIds = new Map<string, string[]>();
  optionIds.forEach((optionId) => optionToUserIds.set(optionId, []));

  let totalSelections = 0;
  userAnswers.forEach((answers, userId) => {
    totalSelections += answers.length;
    answers.forEach((answer) => {
      optionToUserIds.set(answer, [...(optionToUserIds.get(answer) ?? []), userId]);
    });
  });

  const overlayHasOwnState =
    overlaySummary.myAnswers.length > 0 ||
    overlaySummary.myResponseEventIds.length > 0 ||
    overlaySummary.myResponseEvents.length > 0;

  return {
    optionToUserIds,
    myAnswers: overlayHasOwnState ? overlaySummary.myAnswers : baseSummary.myAnswers,
    myResponseEventIds: overlayHasOwnState
      ? overlaySummary.myResponseEventIds
      : baseSummary.myResponseEventIds,
    myResponseEvents: overlayHasOwnState
      ? overlaySummary.myResponseEvents
      : baseSummary.myResponseEvents,
    totalSelections,
    totalVoters: userAnswers.size,
    endedAt: overlaySummary.endedAt ?? baseSummary.endedAt,
  };
};

export const createPollSummarySnapshot = (
  summary: PollSummary,
  includeOwnVoteState = true
): PollSummarySnapshot => ({
  version: 1,
  updatedAt: Date.now(),
  endedAt: summary.endedAt,
  optionToUserIds: Object.fromEntries(
    Array.from(summary.optionToUserIds.entries()).map(([optionId, userIds]) => [
      optionId,
      Array.from(new Set(userIds)),
    ])
  ),
  myAnswers: includeOwnVoteState ? Array.from(new Set(summary.myAnswers)) : [],
  myResponseEventIds: includeOwnVoteState ? Array.from(new Set(summary.myResponseEventIds)) : [],
  totalSelections: summary.totalSelections,
  totalVoters: summary.totalVoters,
});

export const attachPollSummarySnapshot = (
  content: IContent,
  snapshot: PollSummarySnapshot
): IContent => ({
  ...content,
  [POLL_SUMMARY_SNAPSHOT_KEY]: snapshot,
});

export const getPollSummarySnapshot = (content: IContent): PollSummarySnapshot | undefined =>
  getPollSummarySnapshotRecord(content[POLL_SUMMARY_SNAPSHOT_KEY]);

export const getPersistedPollSummarySnapshot = (
  roomId: string,
  pollEventId: string
): PollSummarySnapshot | undefined => {
  const storageKey = getPollSummaryStorageKey(roomId, pollEventId);
  const cachedSnapshot = pollSummarySnapshotCache.get(storageKey);
  if (cachedSnapshot) return cachedSnapshot;

  const storage = getLocalStorage();
  if (!storage) return undefined;

  try {
    const rawSnapshot = storage.getItem(storageKey);
    if (!rawSnapshot) return undefined;

    const snapshot = getPollSummarySnapshotRecord(JSON.parse(rawSnapshot));
    if (!snapshot) return undefined;

    pollSummarySnapshotCache.set(storageKey, snapshot);
    return snapshot;
  } catch {
    return undefined;
  }
};

export const persistPollSummarySnapshot = (
  roomId: string,
  pollEventId: string,
  snapshot: PollSummarySnapshot
): void => {
  const storageKey = getPollSummaryStorageKey(roomId, pollEventId);
  pollSummarySnapshotCache.set(storageKey, snapshot);

  const storage = getLocalStorage();
  if (!storage) return;

  try {
    storage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    // Ignore quota or storage availability errors; in-memory cache still helps this session.
  }
};

const getTextFromMatrixText = (value: unknown): string | undefined => {
  const text = sanitizeText(value);
  if (text) return text;

  const record = getRecord(value);
  if (!record) return undefined;

  return sanitizeText(record[MATRIX_TEXT_KEY]) ?? sanitizeText(record[UNSTABLE_MATRIX_TEXT_KEY]);
};

const getPollStartRecord = (content: IContent): Record<string, unknown> | undefined =>
  getRecord(content[POLL_START_CONTENT_KEY]) ?? getRecord(content[UNSTABLE_POLL_START_CONTENT_KEY]);

const getLegacyPollRecord = (content: IContent): Record<string, unknown> | undefined =>
  getRecord(content[POLL_DATA_KEY]);

const getPollResponseRecord = (content: IContent): Record<string, unknown> | undefined =>
  getRecord(content[POLL_RESPONSE_CONTENT_KEY]) ??
  getRecord(content[UNSTABLE_POLL_RESPONSE_CONTENT_KEY]) ??
  getRecord(content[POLL_RESPONSE_DATA_KEY]);

const getRelationEventId = (event: MatrixEvent): string | undefined => {
  const relation = event.getRelation();
  if (typeof relation?.event_id === 'string') return relation.event_id;

  const rawRelation = getRecord(event.getContent<IContent>()['m.relates_to']);
  return typeof rawRelation?.event_id === 'string' ? rawRelation.event_id : undefined;
};

const getRelationType = (event: MatrixEvent): string | undefined => {
  const relation = event.getRelation();
  if (typeof relation?.rel_type === 'string') return relation.rel_type;

  const rawRelation = getRecord(event.getContent<IContent>()['m.relates_to']);
  return typeof rawRelation?.rel_type === 'string' ? rawRelation.rel_type : undefined;
};

const getPollRelationCollections = (
  room: Room,
  pollEventId: string,
  eventTypes: readonly string[]
) =>
  eventTypes
    .map((eventType) =>
      room
        .getUnfilteredTimelineSet()
        .relations.getChildEventsForEvent(pollEventId, POLL_REFERENCE_REL_TYPE, eventType)
    )
    .filter(isDefined);

const collectUniqueEvents = (events: MatrixEvent[]): MatrixEvent[] => {
  const relatedEvents = new Map<string, MatrixEvent>();

  events.forEach((event) => {
    const eventId = event.getId();
    if (!eventId) return;
    relatedEvents.set(eventId, event);
  });

  return Array.from(relatedEvents.values());
};

const collectPollRelationEvents = (
  room: Room,
  pollEventId: string,
  eventTypes: readonly string[]
): MatrixEvent[] =>
  collectUniqueEvents(
    getPollRelationCollections(room, pollEventId, eventTypes).flatMap((relations) =>
      relations.getRelations()
    )
  );

const collectLivePollEvents = (
  room: Room,
  pollEventId: string,
  eventTypes: readonly string[]
): MatrixEvent[] =>
  collectUniqueEvents(
    room
      .getLiveTimeline()
      .getEvents()
      .filter((event) => {
        const eventType = event.getType();
        return (
          typeof eventType === 'string' &&
          eventTypes.includes(eventType) &&
          getRelationType(event) === POLL_REFERENCE_REL_TYPE &&
          getRelationEventId(event) === pollEventId
        );
      })
  );

const collectKnownPollRelationEvents = (room: Room, pollEventId: string): MatrixEvent[] =>
  collectUniqueEvents([
    ...collectPollRelationEvents(room, pollEventId, POLL_RESPONSE_EVENT_TYPES),
    ...collectPollRelationEvents(room, pollEventId, POLL_END_EVENT_TYPES),
    ...collectLivePollEvents(room, pollEventId, [...POLL_RESPONSE_EVENT_TYPES, ...POLL_END_EVENT_TYPES]),
  ]);

export const getCachedPollRelationEvents = (roomId: string, pollEventId: string): MatrixEvent[] =>
  getOrCreatePollRelationCacheEntry(roomId, pollEventId).events;

export const primePollRelationEventsCache = (room: Room, pollEventId: string): MatrixEvent[] =>
  updatePollRelationEventsCache(
    room.roomId,
    pollEventId,
    collectKnownPollRelationEvents(room, pollEventId),
    true
  );

export const getPollResponseRelationCollections = (room: Room, pollEventId: string) =>
  getPollRelationCollections(room, pollEventId, POLL_RESPONSE_EVENT_TYPES);

export const getPollEndRelationCollections = (room: Room, pollEventId: string) =>
  getPollRelationCollections(room, pollEventId, POLL_END_EVENT_TYPES);

export const isPollStartEventType = (eventType?: string): boolean =>
  eventType === POLL_START_EVENT_TYPE || eventType === UNSTABLE_POLL_START_EVENT_TYPE;

export const isPollResponseEventType = (eventType?: string): boolean =>
  eventType === POLL_RESPONSE_EVENT_TYPE ||
  eventType === UNSTABLE_POLL_RESPONSE_EVENT_TYPE ||
  eventType === LEGACY_POLL_RESPONSE_EVENT_TYPE;

export const isPollEndEventType = (eventType?: string): boolean =>
  eventType === POLL_END_EVENT_TYPE || eventType === UNSTABLE_POLL_END_EVENT_TYPE;

const getPollMaxSelections = (
  mode: PollMode,
  optionsLength: number,
  rawMaxSelections?: number
): number => {
  if (mode === 'single' || mode === 'pk') return 1;

  const parsedMaxSelections =
    typeof rawMaxSelections === 'number' && Number.isFinite(rawMaxSelections)
      ? Math.round(rawMaxSelections)
      : 2;

  return Math.min(optionsLength, Math.max(1, parsedMaxSelections));
};

export const getPollModeLabel = (mode: PollMode): string => {
  if (mode === 'multiple') return '\u591a\u9009\u6295\u7968';
  if (mode === 'pk') return 'PK \u6295\u7968';
  return '\u5355\u9009\u6295\u7968';
};

const buildPollFallbackBody = (data: PollData): string => {
  const lines = [`[\u6295\u7968] ${data.title}`];

  if (data.description) {
    lines.push(data.description);
  }

  data.options.forEach((option, index) => {
    lines.push(`${index + 1}. ${option.text}`);
  });

  lines.push(`\u7c7b\u578b: ${getPollModeLabel(data.mode)}`);

  if (data.mode === 'multiple') {
    lines.push(`\u6700\u591a\u53ef\u9009: ${data.maxSelections} \u9879`);
  }

  if (typeof data.expiresAt === 'number') {
    lines.push(`\u622a\u6b62\u65f6\u95f4: ${new Date(data.expiresAt).toLocaleString()}`);
  }

  lines.push(`\u6295\u7968\u663e\u540d: ${data.showVoters ? '\u53ef\u89c1' : '\u9690\u85cf'}`);

  return lines.join('\n');
};

const buildMatrixText = (text: string): Record<string, string> => ({
  [MATRIX_TEXT_KEY]: text,
  [UNSTABLE_MATRIX_TEXT_KEY]: text,
});

const buildStandardPollStart = (data: PollData, unstable = false): Record<string, unknown> => ({
  question: buildMatrixText(data.title),
  kind: data.showVoters
    ? unstable
      ? UNSTABLE_POLL_DISCLOSED_KIND
      : POLL_DISCLOSED_KIND
    : unstable
      ? UNSTABLE_POLL_UNDISCLOSED_KIND
      : POLL_UNDISCLOSED_KIND,
  max_selections: data.maxSelections,
  answers: data.options.map((option) => ({
    id: option.id,
    ...buildMatrixText(option.text),
  })),
});

export const createPollMessageContent = (input: CreatePollInput): IContent => {
  const mode: PollMode = input.mode === 'multiple' ? 'multiple' : 'single';
  const options = sanitizePollOptions(input.options);
  const title = input.title.trim();
  const description = sanitizeText(input.description);

  const data: PollData = {
    version: 1,
    title,
    description,
    mode,
    options,
    maxSelections: getPollMaxSelections(mode, options.length, input.maxSelections),
    showVoters: input.showVoters,
  };

  return {
    body: buildPollFallbackBody(data),
    [MATRIX_TEXT_KEY]: buildPollFallbackBody(data),
    [UNSTABLE_MATRIX_TEXT_KEY]: buildPollFallbackBody(data),
    [POLL_START_CONTENT_KEY]: buildStandardPollStart(data),
    [UNSTABLE_POLL_START_CONTENT_KEY]: buildStandardPollStart(data, true),
    [POLL_DATA_KEY]: data,
  };
};

export const parsePollData = (content: IContent): PollData | undefined => {
  const rawData = getLegacyPollRecord(content);
  if (rawData) {
    const title = sanitizeText(rawData.title);
    if (!title) return undefined;

    const rawMode = rawData.mode;
    const mode: PollMode =
      rawMode === 'multiple' || rawMode === 'pk' || rawMode === 'single' ? rawMode : 'single';

    const options = Array.isArray(rawData.options)
      ? rawData.options
          .map((option, index) => {
            if (!option || typeof option !== 'object') return undefined;
            const record = option as Record<string, unknown>;
            const text = sanitizeText(record.text);
            if (!text) return undefined;
            const id = sanitizeText(record.id) ?? `option_${index + 1}`;

            return { id, text } satisfies PollOption;
          })
          .filter((option): option is PollOption => !!option)
          .slice(0, POLL_MAX_OPTIONS)
      : [];

    if (options.length < 2) return undefined;
    if (mode === 'pk' && options.length !== 2) return undefined;

    const expiresAt =
      typeof rawData.expiresAt === 'number' && Number.isFinite(rawData.expiresAt)
        ? rawData.expiresAt
        : undefined;

    return {
      version: 1,
      title,
      description: sanitizeText(rawData.description),
      mode,
      options,
      maxSelections: getPollMaxSelections(
        mode,
        options.length,
        typeof rawData.maxSelections === 'number' ? rawData.maxSelections : undefined
      ),
      showVoters: Boolean(rawData.showVoters),
      expiresAt,
    };
  }

  const pollStart = getPollStartRecord(content);
  if (!pollStart) return undefined;

  const title = getTextFromMatrixText(pollStart.question) ?? sanitizeText(content.body);
  if (!title) return undefined;

  const answers = Array.isArray(pollStart.answers)
    ? pollStart.answers
        .map((answer, index) => {
          const record = getRecord(answer);
          if (!record) return undefined;
          const text = getTextFromMatrixText(record);
          if (!text) return undefined;
          const id = sanitizeText(record.id) ?? `option_${index + 1}`;
          return { id, text } satisfies PollOption;
        })
        .filter((option): option is PollOption => !!option)
        .slice(0, POLL_MAX_OPTIONS)
    : [];
  if (answers.length < 2) return undefined;

  const maxSelections = getPollMaxSelections(
    typeof pollStart.max_selections === 'number' && pollStart.max_selections > 1
      ? 'multiple'
      : 'single',
    answers.length,
    typeof pollStart.max_selections === 'number' ? pollStart.max_selections : undefined
  );
  const legacyData = getLegacyPollRecord(content);
  const legacyMode = legacyData?.mode;
  const legacyShowVoters = legacyData?.showVoters;
  const legacyExpiresAt = legacyData?.expiresAt;
  const mode: PollMode =
    legacyMode === 'pk'
      ? 'pk'
      : maxSelections > 1
        ? 'multiple'
        : 'single';

  return {
    version: 1,
    title,
    description: sanitizeText(legacyData?.description),
    mode,
    options: answers,
    maxSelections,
    showVoters:
      typeof legacyShowVoters === 'boolean'
        ? legacyShowVoters
        : pollStart.kind !== POLL_UNDISCLOSED_KIND &&
          pollStart.kind !== UNSTABLE_POLL_UNDISCLOSED_KIND,
    expiresAt:
      typeof legacyExpiresAt === 'number' && Number.isFinite(legacyExpiresAt)
        ? legacyExpiresAt
        : undefined,
  };
};

export const isPollMessage = (content: IContent): boolean => !!parsePollData(content);

export const createPollResponseContent = (pollEventId: string, answers: string[]): IContent => {
  const uniqueAnswers = Array.from(new Set(answers));

  return {
    'm.relates_to': {
      rel_type: POLL_REFERENCE_REL_TYPE,
      event_id: pollEventId,
    },
    [POLL_RESPONSE_CONTENT_KEY]: {
      answers: uniqueAnswers,
    },
    [UNSTABLE_POLL_RESPONSE_CONTENT_KEY]: {
      answers: uniqueAnswers,
    },
    [POLL_RESPONSE_DATA_KEY]: {
      version: 1,
      pollEventId,
      answers: uniqueAnswers,
      answeredAt: Date.now(),
    } satisfies PollResponseData,
  };
};

export const createPollEndContent = (pollEventId: string): IContent => ({
  'm.relates_to': {
    rel_type: POLL_REFERENCE_REL_TYPE,
    event_id: pollEventId,
  },
  [POLL_END_CONTENT_KEY]: {},
  [UNSTABLE_POLL_END_CONTENT_KEY]: {},
});

export const isPollResponseEvent = (event: MatrixEvent, pollEventId?: string): boolean => {
  const eventType = event.getType();
  if (!isPollResponseEventType(eventType)) {
    return false;
  }

  const content = event.getContent<IContent>();
  const rawData = getPollResponseRecord(content);
  const responsePollEventId = getRelationEventId(event) ?? sanitizeText(rawData?.pollEventId);

  if (!responsePollEventId) return false;
  if (pollEventId) return responsePollEventId === pollEventId;
  return true;
};

const isPollEndEvent = (event: MatrixEvent, pollEventId?: string): boolean => {
  const eventType = event.getType();
  if (!isPollEndEventType(eventType)) {
    return false;
  }

  const responsePollEventId = getRelationEventId(event);
  if (!responsePollEventId) return false;
  if (pollEventId) return responsePollEventId === pollEventId;
  return true;
};

export const parsePollResponseData = (
  event: MatrixEvent,
  poll: PollData
): PollResponseData | undefined => {
  if (!isPollResponseEvent(event)) return undefined;

  const rawData = getPollResponseRecord(event.getContent<IContent>());

  if (!Array.isArray(rawData?.answers)) return undefined;

  const answers = rawData.answers
    .filter((answer): answer is string => typeof answer === 'string')
    .filter((answer, index, array) => array.indexOf(answer) === index)
    .filter((answer) => poll.options.find((option) => option.id === answer));

  const pollEventId = getRelationEventId(event) ?? sanitizeText(rawData?.pollEventId);
  if (!pollEventId) return undefined;

  return {
    version: 1,
    pollEventId,
    answers,
    answeredAt: typeof rawData?.answeredAt === 'number' ? rawData.answeredAt : event.getTs(),
  };
};

export const hasPollEnded = (_poll: PollData, endedAt?: number): boolean =>
  typeof endedAt === 'number';

export const summarizePoll = (
  room: Room,
  pollEventId: string,
  poll: PollData,
  currentUserId?: string,
  extraEvents: MatrixEvent[] = []
): PollSummary => {
  const latestBySender = new Map<
    string,
    {
      eventId: string;
      ts: number;
      answers: string[];
    }
  >();
  const responseEventIdsBySender = new Map<string, string[]>();
  const responseEventsBySender = new Map<string, MatrixEvent[]>();

  const events = collectUniqueEvents([
    ...extraEvents,
    ...collectKnownPollRelationEvents(room, pollEventId),
  ]);
  const endedAt = events.reduce<number | undefined>((currentEndedAt, event) => {
    if (event.isRedacted()) return currentEndedAt;
    if (!isPollEndEvent(event, pollEventId)) return currentEndedAt;
    if (getRelationType(event) !== POLL_REFERENCE_REL_TYPE) return currentEndedAt;

    return Math.min(currentEndedAt ?? event.getTs(), event.getTs());
  }, undefined);

  events.forEach((event) => {
    if (event.isRedacted()) return;
    if (!isPollResponseEvent(event, pollEventId)) return;
    if (endedAt && event.getTs() > endedAt) return;

    const senderId = event.getSender();
    const eventId = event.getId();
    if (!senderId || !eventId) return;

    const response = parsePollResponseData(event, poll);
    if (!response) return;

    const currentIds = responseEventIdsBySender.get(senderId) ?? [];
    currentIds.push(eventId);
    responseEventIdsBySender.set(senderId, currentIds);

    const currentEvents = responseEventsBySender.get(senderId) ?? [];
    currentEvents.push(event);
    responseEventsBySender.set(senderId, currentEvents);

    const previous = latestBySender.get(senderId);
    if (!previous || previous.ts <= event.getTs()) {
      latestBySender.set(senderId, {
        eventId,
        ts: event.getTs(),
        answers: response.answers.slice(0, poll.maxSelections),
      });
    }
  });

  const optionToUserIds = new Map<string, string[]>();
  poll.options.forEach((option) => optionToUserIds.set(option.id, []));

  let totalSelections = 0;
  latestBySender.forEach((value, senderId) => {
    totalSelections += value.answers.length;
    value.answers.forEach((answer) => {
      optionToUserIds.set(answer, [...(optionToUserIds.get(answer) ?? []), senderId]);
    });
  });

  return {
    optionToUserIds,
    myAnswers: currentUserId ? latestBySender.get(currentUserId)?.answers ?? [] : [],
    myResponseEventIds: currentUserId ? responseEventIdsBySender.get(currentUserId) ?? [] : [],
    myResponseEvents: currentUserId ? responseEventsBySender.get(currentUserId) ?? [] : [],
    totalSelections,
    totalVoters: latestBySender.size,
    endedAt,
  };
};
