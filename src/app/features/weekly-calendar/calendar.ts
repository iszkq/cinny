import { Direction, IEvent, MatrixClient, MatrixEvent, RelationType } from 'matrix-js-sdk';
import { CryptoBackend } from 'matrix-js-sdk/lib/common-crypto/CryptoBackend';
import { AccountDataEvent } from '../../../types/matrix/accountData';
import { MessageEvent } from '../../../types/matrix/room';
import {
  ParsedMeeting,
  WEEKLY_CALENDAR_VERSION,
  WeeklyCalendarContent,
  WeeklyCalendarMeeting,
} from './types';

const PAGE_SIZE = 50;
const MAX_SYNC_PAGES = 80;
const UNNAMED_MEETING = '未命名会议';

type FieldKind = 'when' | 'what' | 'where';

const FIELD_ALIASES: Array<[string, FieldKind]> = [
  ['zoom meeting id', 'where'],
  ['meeting title', 'what'],
  ['meeting date', 'when'],
  ['meeting time', 'when'],
  ['meeting id', 'where'],
  ['会议时间', 'when'],
  ['开会时间', 'when'],
  ['会议名称', 'what'],
  ['会议主题', 'what'],
  ['会议地点', 'where'],
  ['会议号', 'where'],
  ['location', 'where'],
  ['subject', 'what'],
  ['where', 'where'],
  ['when', 'when'],
  ['topic', 'what'],
  ['zoom id', 'where'],
  ['meeting', 'what'],
  ['日期', 'when'],
  ['时间', 'when'],
  ['何时', 'when'],
  ['事项', 'what'],
  ['主题', 'what'],
  ['何事', 'what'],
  ['地点', 'where'],
  ['何地', 'where'],
  ['zoom', 'where'],
  ['date', 'when'],
  ['time', 'when'],
  ['what', 'what'],
];

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const WEEKDAYS: Record<string, number> = {
  一: 0,
  二: 1,
  三: 2,
  四: 3,
  五: 4,
  六: 5,
  日: 6,
  天: 6,
  monday: 0,
  mon: 0,
  tuesday: 1,
  tue: 1,
  tues: 1,
  wednesday: 2,
  wed: 2,
  thursday: 3,
  thu: 3,
  thur: 3,
  thurs: 3,
  friday: 4,
  fri: 4,
  saturday: 5,
  sat: 5,
  sunday: 6,
  sun: 6,
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const FIELD_PATTERN = FIELD_ALIASES.map(([alias]) =>
  escapeRegExp(alias).replace(/\\ /g, '\\s+')
).join('|');
const FIELD_REGEX = new RegExp(`(${FIELD_PATTERN})\\s*[:：]\\s*`, 'giu');

const LOCATION_HINT_REGEX =
  /(?:小圆|球队通密|球闪通密|通密|zoom|会议号|meeting\s*id|webinar|⏱|⏲|⏰|◷|🕐|🕒|🕔|🕘)/iu;

const normalizeAlias = (value: string): string =>
  value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();

const ALIAS_TO_KIND = new Map<FieldKind | string, FieldKind>(
  FIELD_ALIASES.map(([alias, kind]) => [normalizeAlias(alias), kind])
);

const formatNumber = (value: number): string => String(value).padStart(2, '0');

export const formatLocalDate = (date: Date): string =>
  `${date.getFullYear()}-${formatNumber(date.getMonth() + 1)}-${formatNumber(date.getDate())}`;

export const getStartOfDay = (timestamp = Date.now()): Date => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date;
};

export const getStartOfWeek = (timestamp = Date.now()): Date => {
  const date = getStartOfDay(timestamp);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
};

export const getEndOfWeek = (timestamp = Date.now()): Date => {
  const date = getStartOfWeek(timestamp);
  date.setDate(date.getDate() + 6);
  date.setHours(23, 59, 59, 999);
  return date;
};

export const getCalendarWeekStartKey = (timestamp = Date.now()): string =>
  formatLocalDate(getStartOfWeek(timestamp));

export const getWeekDates = (timestamp = Date.now()): Date[] => {
  const start = getStartOfWeek(timestamp);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

export const createEmptyWeeklyCalendar = (
  roomId?: string,
  timestamp = Date.now()
): WeeklyCalendarContent => ({
  version: WEEKLY_CALENDAR_VERSION,
  weekStart: getCalendarWeekStartKey(timestamp),
  roomId,
  meetings: [],
  initialScanCompleted: false,
  updatedAt: timestamp,
});

const isMeeting = (value: unknown): value is WeeklyCalendarMeeting => {
  if (!value || typeof value !== 'object') return false;
  const meeting = value as Partial<WeeklyCalendarMeeting>;
  return (
    typeof meeting.id === 'string' &&
    typeof meeting.sourceEventId === 'string' &&
    typeof meeting.sourceTimestamp === 'number' &&
    typeof meeting.title === 'string' &&
    typeof meeting.date === 'string' &&
    typeof meeting.zoomMeetingId === 'string' &&
    typeof meeting.locationText === 'string' &&
    typeof meeting.createdAt === 'number' &&
    typeof meeting.updatedAt === 'number' &&
    (meeting.startTime === undefined || typeof meeting.startTime === 'string') &&
    (meeting.endTime === undefined || typeof meeting.endTime === 'string')
  );
};

export const normalizeWeeklyCalendarContent = (
  value: unknown,
  timestamp = Date.now()
): WeeklyCalendarContent => {
  if (!value || typeof value !== 'object') return createEmptyWeeklyCalendar(undefined, timestamp);
  const content = value as Partial<WeeklyCalendarContent>;
  if (content.version !== WEEKLY_CALENDAR_VERSION) {
    return createEmptyWeeklyCalendar(
      typeof content.roomId === 'string' ? content.roomId : undefined,
      timestamp
    );
  }

  return {
    version: WEEKLY_CALENDAR_VERSION,
    weekStart:
      typeof content.weekStart === 'string'
        ? content.weekStart
        : getCalendarWeekStartKey(timestamp),
    roomId: typeof content.roomId === 'string' ? content.roomId : undefined,
    meetings: Array.isArray(content.meetings) ? content.meetings.filter(isMeeting) : [],
    initialScanCompleted: content.initialScanCompleted === true,
    lastProcessedAt:
      typeof content.lastProcessedAt === 'number' ? content.lastProcessedAt : undefined,
    lastSyncedAt: typeof content.lastSyncedAt === 'number' ? content.lastSyncedAt : undefined,
    lastManualSyncedAt:
      typeof content.lastManualSyncedAt === 'number' ? content.lastManualSyncedAt : undefined,
    updatedAt: typeof content.updatedAt === 'number' ? content.updatedAt : timestamp,
  };
};

export const getWeeklyCalendarContent = (
  mx: MatrixClient,
  timestamp = Date.now()
): WeeklyCalendarContent => {
  const content = mx
    .getAccountData(AccountDataEvent.CinnyWeeklyCalendar)
    ?.getContent<WeeklyCalendarContent>();
  const normalized = normalizeWeeklyCalendarContent(content, timestamp);
  const currentWeek = getCalendarWeekStartKey(timestamp);
  if (normalized.weekStart !== currentWeek) {
    return createEmptyWeeklyCalendar(normalized.roomId, timestamp);
  }
  return normalized;
};

const extractFields = (body: string): Partial<Record<FieldKind, string>> => {
  const normalizedBody = body.normalize('NFKC').replace(/\r\n?/g, '\n');
  const matches = Array.from(normalizedBody.matchAll(FIELD_REGEX));
  const fields: Partial<Record<FieldKind, string>> = {};

  matches.forEach((match, index) => {
    const label = normalizeAlias(match[1] ?? '');
    const kind = ALIAS_TO_KIND.get(label);
    if (!kind || fields[kind] !== undefined || match.index === undefined) return;
    const contentStart = match.index + match[0].length;
    const lineEnd = normalizedBody.indexOf('\n', contentStart);
    const contentEnd = Math.min(
      matches[index + 1]?.index ?? normalizedBody.length,
      lineEnd < 0 ? normalizedBody.length : lineEnd
    );
    const fieldValue = normalizedBody.slice(contentStart, contentEnd).trim();
    if (fieldValue) fields[kind] = fieldValue;
  });

  return fields;
};

const validDate = (year: number, month: number, day: number): Date | undefined => {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  date.setHours(0, 0, 0, 0);
  return date;
};

const dateWithinCurrentWeek = (date: Date, now: number): boolean =>
  date.getTime() >= getStartOfWeek(now).getTime() && date.getTime() <= getEndOfWeek(now).getTime();

const parseMeetingDate = (
  value: string,
  sourceTimestamp: number,
  now: number
): Date | undefined => {
  const text = value.normalize('NFKC').toLocaleLowerCase();
  const reference = getStartOfDay(sourceTimestamp);
  let date: Date | undefined;

  if (/今天|今日|\btoday\b/i.test(text)) {
    date = reference;
  } else if (/明天|明日|\btomorrow\b/i.test(text)) {
    date = new Date(reference);
    date.setDate(date.getDate() + 1);
  }

  if (!date) {
    const chineseFull = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
    const separatedFull = text.match(/(\d{4})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{1,2})/);
    const match = chineseFull ?? separatedFull;
    if (match) date = validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  if (!date) {
    const chineseShort = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
    const separatedShort = text.match(/(^|\D)(\d{1,2})\s*[/.\-]\s*(\d{1,2})(?!\d)/);
    if (chineseShort) {
      date = validDate(reference.getFullYear(), Number(chineseShort[1]), Number(chineseShort[2]));
    } else if (separatedShort) {
      date = validDate(
        reference.getFullYear(),
        Number(separatedShort[2]),
        Number(separatedShort[3])
      );
    }
  }

  if (!date) {
    const monthNames = Object.keys(MONTHS).join('|');
    const monthFirst = text.match(
      new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:,?\\s*(\\d{4}))?\\b`, 'i')
    );
    const dayFirst = text.match(
      new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})(?:,?\\s*(\\d{4}))?\\b`, 'i')
    );
    if (monthFirst) {
      date = validDate(
        Number(monthFirst[3] ?? reference.getFullYear()),
        MONTHS[monthFirst[1].toLocaleLowerCase()],
        Number(monthFirst[2])
      );
    } else if (dayFirst) {
      date = validDate(
        Number(dayFirst[3] ?? reference.getFullYear()),
        MONTHS[dayFirst[2].toLocaleLowerCase()],
        Number(dayFirst[1])
      );
    }
  }

  if (!date) {
    const chineseWeekday = text.match(/(?:本周|星期|周)([一二三四五六日天])/);
    const englishWeekday = Object.keys(WEEKDAYS)
      .filter((key) => /^[a-z]/.test(key))
      .find((key) => new RegExp(`\\b${key}\\b`, 'i').test(text));
    const weekday = chineseWeekday?.[1] ?? englishWeekday;
    if (weekday !== undefined) {
      date = getStartOfWeek(sourceTimestamp);
      date.setDate(date.getDate() + WEEKDAYS[weekday.toLocaleLowerCase()]);
    }
  }

  if (!date || !dateWithinCurrentWeek(date, now)) return undefined;
  return date;
};

const parseClock = (
  hourText: string,
  minuteText: string | undefined,
  period?: string
): string | undefined => {
  let hour = Number(hourText);
  const minute = Number(minuteText ?? 0);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return undefined;
  }

  const normalizedPeriod = period?.toLocaleLowerCase();
  if (['下午', '晚上', 'pm'].includes(normalizedPeriod ?? '') && hour < 12) hour += 12;
  if (['上午', '早上', '凌晨', 'am'].includes(normalizedPeriod ?? '') && hour === 12) hour = 0;
  if (normalizedPeriod === '中午' && hour < 11) hour += 12;
  if (hour < 0 || hour > 23) return undefined;
  return `${formatNumber(hour)}:${formatNumber(minute)}`;
};

const parseMeetingTimes = (value: string): { startTime?: string; endTime?: string } => {
  const text = value.normalize('NFKC').toLocaleLowerCase();
  const clockRegex =
    /(?:(早上|上午|中午|下午|晚上|凌晨|am|pm)\s*)?(\d{1,2})(?::(\d{1,2})|点(?:(\d{1,2})分?)?)\s*(am|pm)?/giu;
  const matches = Array.from(text.matchAll(clockRegex))
    .filter((match) => !!(match[1] || match[3] || match[4] || match[5]))
    .slice(0, 2);
  if (matches.length === 0) return {};

  const firstPeriod = matches[0][1] ?? matches[0][5];
  const startTime = parseClock(matches[0][2], matches[0][3] ?? matches[0][4], firstPeriod);
  if (!startTime || matches.length === 1) return { startTime };

  const firstEnd = (matches[0].index ?? 0) + matches[0][0].length;
  const secondStart = matches[1].index ?? firstEnd;
  const separator = text.slice(firstEnd, secondStart);
  if (!/[-–—~～至到]/u.test(separator)) return { startTime };

  const secondPeriod = matches[1][1] ?? matches[1][5] ?? firstPeriod;
  const endTime = parseClock(matches[1][2], matches[1][3] ?? matches[1][4], secondPeriod);
  return { startTime, endTime };
};

const extractZoomMeetingId = (value: string): string | undefined => {
  const candidates = value.normalize('NFKC').match(/\d[\d\s-]{7,28}\d/g) ?? [];
  return candidates
    .map((candidate) => candidate.replace(/\D/g, ''))
    .find((candidate) => candidate.length >= 9 && candidate.length <= 11);
};

const extractMeetingLocation = (
  body: string,
  explicitLocation?: string
): { zoomMeetingId: string; locationText: string } | undefined => {
  if (explicitLocation) {
    const zoomMeetingId = extractZoomMeetingId(explicitLocation);
    if (zoomMeetingId) return { zoomMeetingId, locationText: explicitLocation };
  }

  const locationLine = body
    .normalize('NFKC')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => LOCATION_HINT_REGEX.test(line) && extractZoomMeetingId(line));
  const fallbackLine =
    locationLine ??
    body
      .normalize('NFKC')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => extractZoomMeetingId(line));
  if (!fallbackLine) return undefined;

  const zoomMeetingId = extractZoomMeetingId(fallbackLine);
  return zoomMeetingId ? { zoomMeetingId, locationText: fallbackLine } : undefined;
};

const normalizeTitle = (value: string): string =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s\p{P}]+/gu, '');

const getMessageBody = (event: MatrixEvent): { body?: string; sourceEventId?: string } => {
  if (event.getType() !== MessageEvent.RoomMessage || event.isRedacted()) return {};
  const content = event.getContent<Record<string, any>>();
  const relation = content['m.relates_to'];
  if (relation?.rel_type === RelationType.Replace && typeof relation.event_id === 'string') {
    const newContent = content['m.new_content'];
    return {
      body: typeof newContent?.body === 'string' ? newContent.body : undefined,
      sourceEventId: relation.event_id,
    };
  }

  return {
    body: typeof content.body === 'string' ? content.body : undefined,
    sourceEventId: event.getId() ?? undefined,
  };
};

export const parseMeetingBody = (
  body: string,
  sourceEventId: string,
  sourceTimestamp: number,
  now = Date.now()
): ParsedMeeting | undefined => {
  const fields = extractFields(body);
  const location = extractMeetingLocation(body, fields.where);
  if (!location) return undefined;

  const meetingDate = [fields.when, fields.what, body]
    .filter((value): value is string => !!value)
    .map((value) => parseMeetingDate(value, sourceTimestamp, now))
    .find((value): value is Date => !!value);
  if (!meetingDate) return undefined;
  const title = fields.what?.replace(/\s+/g, ' ').trim() || UNNAMED_MEETING;
  const times = parseMeetingTimes(fields.when ?? body);

  return {
    sourceEventId,
    sourceTimestamp,
    title,
    date: formatLocalDate(meetingDate),
    ...times,
    ...location,
  };
};

export const parseMeetingEvent = (
  event: MatrixEvent,
  now = Date.now()
): ParsedMeeting | undefined => {
  const { body, sourceEventId } = getMessageBody(event);
  if (!body || !sourceEventId) return undefined;
  return parseMeetingBody(body, sourceEventId, event.getTs() || now, now);
};

const sameMeetingDetails = (a: WeeklyCalendarMeeting, b: ParsedMeeting): boolean =>
  a.sourceEventId === b.sourceEventId &&
  a.sourceTimestamp === b.sourceTimestamp &&
  a.title === b.title &&
  a.date === b.date &&
  a.startTime === b.startTime &&
  a.endTime === b.endTime &&
  a.zoomMeetingId === b.zoomMeetingId &&
  a.locationText === b.locationText;

const findMeetingIndex = (meetings: WeeklyCalendarMeeting[], incoming: ParsedMeeting): number => {
  const bySource = meetings.findIndex(
    (meeting) => meeting.sourceEventId === incoming.sourceEventId
  );
  if (bySource >= 0) return bySource;

  const incomingTitle = normalizeTitle(incoming.title);
  const named = incoming.title !== UNNAMED_MEETING;
  return meetings.findIndex((meeting) => {
    const sameDate = meeting.date === incoming.date;
    const sameZoom = meeting.zoomMeetingId === incoming.zoomMeetingId;
    if (!named) return sameDate && sameZoom;
    const sameTitle =
      meeting.title !== UNNAMED_MEETING && normalizeTitle(meeting.title) === incomingTitle;
    return (sameTitle && sameDate) || (sameTitle && sameZoom) || (sameDate && sameZoom);
  });
};

export const upsertMeeting = (
  content: WeeklyCalendarContent,
  incoming: ParsedMeeting,
  allowPast: boolean,
  now = Date.now()
): { content: WeeklyCalendarContent; changed: boolean } => {
  if (!allowPast && incoming.date < formatLocalDate(getStartOfDay(now))) {
    return { content, changed: false };
  }

  const index = findMeetingIndex(content.meetings, incoming);
  if (index < 0) {
    const meeting: WeeklyCalendarMeeting = {
      ...incoming,
      id: incoming.sourceEventId,
      createdAt: now,
      updatedAt: now,
    };
    return {
      changed: true,
      content: {
        ...content,
        meetings: [...content.meetings, meeting],
        updatedAt: now,
      },
    };
  }

  const existing = content.meetings[index];
  if (
    incoming.sourceTimestamp < existing.sourceTimestamp ||
    sameMeetingDetails(existing, incoming)
  ) {
    return { content, changed: false };
  }

  const meetings = [...content.meetings];
  meetings[index] = {
    ...existing,
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now,
  };
  return {
    changed: true,
    content: { ...content, meetings, updatedAt: now },
  };
};

const decryptEvent = async (mx: MatrixClient, event: MatrixEvent): Promise<MatrixEvent> => {
  if (!event.isEncrypted()) return event;
  const crypto = mx.getCrypto();
  if (!crypto) return event;
  try {
    await event.attemptDecryption(crypto as CryptoBackend);
  } catch {
    // A later Matrix decryption event can retry this message.
  }
  return event;
};

const fetchRoomEventsSince = async (
  mx: MatrixClient,
  roomId: string,
  since: number
): Promise<MatrixEvent[]> => {
  const events: MatrixEvent[] = [];
  const seen = new Set<string>();
  let token: string | null = null;
  let page = 0;
  let reachedBoundary = false;

  while (!reachedBoundary && page < MAX_SYNC_PAGES) {
    // eslint-disable-next-line no-await-in-loop
    const response = await mx.createMessagesRequest(
      roomId,
      token,
      PAGE_SIZE,
      Direction.Backward,
      undefined
    );
    page += 1;
    token = response.end ?? null;
    if (response.chunk.length === 0) break;

    for (const rawEvent of response.chunk) {
      const timestamp = rawEvent.origin_server_ts ?? 0;
      if (timestamp < since) {
        reachedBoundary = true;
        continue;
      }
      if (seen.has(rawEvent.event_id)) continue;
      seen.add(rawEvent.event_id);
      // eslint-disable-next-line no-await-in-loop
      events.push(
        await decryptEvent(
          mx,
          new MatrixEvent({
            ...rawEvent,
            room_id: rawEvent.room_id ?? roomId,
          } as IEvent)
        )
      );
    }

    if (!token) break;
    // Keep long room histories from monopolizing the main thread.
    // eslint-disable-next-line no-await-in-loop
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  return events.sort((a, b) => a.getTs() - b.getTs());
};

type CalendarOperation = (
  content: WeeklyCalendarContent
) => Promise<WeeklyCalendarContent> | WeeklyCalendarContent;

const operationQueues = new WeakMap<MatrixClient, Promise<WeeklyCalendarContent>>();

const enqueueCalendarOperation = (
  mx: MatrixClient,
  operation: CalendarOperation
): Promise<WeeklyCalendarContent> => {
  const previous = operationQueues.get(mx) ?? Promise.resolve(getWeeklyCalendarContent(mx));
  const next = previous
    .catch(() => getWeeklyCalendarContent(mx))
    .then((queuedContent) => {
      const serverContent = getWeeklyCalendarContent(mx);
      const current =
        serverContent.updatedAt > queuedContent.updatedAt ? serverContent : queuedContent;
      return operation(current);
    });
  operationQueues.set(mx, next);
  return next;
};

const saveCalendarContent = async (
  mx: MatrixClient,
  content: WeeklyCalendarContent
): Promise<WeeklyCalendarContent> => {
  await mx.setAccountData(AccountDataEvent.CinnyWeeklyCalendar, content);
  return content;
};

export const selectWeeklyCalendarRoom = (
  mx: MatrixClient,
  roomId: string
): Promise<WeeklyCalendarContent> =>
  enqueueCalendarOperation(mx, (current) => {
    if (current.roomId === roomId) return current;
    return saveCalendarContent(mx, createEmptyWeeklyCalendar(roomId));
  });

export const resetWeeklyCalendarWeek = (mx: MatrixClient): Promise<WeeklyCalendarContent> =>
  enqueueCalendarOperation(mx, (current) => {
    const storedWeek = mx
      .getAccountData(AccountDataEvent.CinnyWeeklyCalendar)
      ?.getContent<Partial<WeeklyCalendarContent>>().weekStart;
    if (storedWeek === getCalendarWeekStartKey()) return current;
    return saveCalendarContent(mx, createEmptyWeeklyCalendar(current.roomId));
  });

export const applyLiveMeetingEvents = (
  mx: MatrixClient,
  roomId: string,
  events: MatrixEvent[]
): Promise<WeeklyCalendarContent> =>
  enqueueCalendarOperation(mx, async (current) => {
    if (current.roomId !== roomId) return current;
    let next = current;
    let changed = false;
    let lastProcessedAt = current.lastProcessedAt ?? 0;
    const now = Date.now();

    events
      .sort((a, b) => a.getTs() - b.getTs())
      .forEach((event) => {
        lastProcessedAt = Math.max(lastProcessedAt, event.getTs());
        const parsed = parseMeetingEvent(event, now);
        if (!parsed) return;
        const result = upsertMeeting(next, parsed, false, now);
        next = result.content;
        changed = changed || result.changed;
      });

    if (!changed) return current;
    return saveCalendarContent(mx, {
      ...next,
      lastProcessedAt,
      lastSyncedAt: now,
      updatedAt: now,
    });
  });

export const synchronizeWeeklyCalendar = (
  mx: MatrixClient,
  manual = false
): Promise<WeeklyCalendarContent> =>
  enqueueCalendarOperation(mx, async (current) => {
    const now = Date.now();
    const active =
      current.weekStart === getCalendarWeekStartKey(now)
        ? current
        : createEmptyWeeklyCalendar(current.roomId, now);
    if (!active.roomId || !mx.getRoom(active.roomId)) return active;

    const firstScan = !active.initialScanCompleted;
    const recoveryScan = manual && active.meetings.length === 0;
    const fullScan = firstScan || recoveryScan;
    const since = fullScan
      ? getStartOfWeek(now).getTime()
      : Math.max(getStartOfWeek(now).getTime(), (active.lastProcessedAt ?? now) - 1000);
    const events = await fetchRoomEventsSince(mx, active.roomId, since);
    let next = active;
    let lastProcessedAt = active.lastProcessedAt ?? since;

    events.forEach((event) => {
      lastProcessedAt = Math.max(lastProcessedAt, event.getTs());
      const parsed = parseMeetingEvent(event, now);
      if (!parsed) return;
      next = upsertMeeting(next, parsed, fullScan, now).content;
    });

    const saved: WeeklyCalendarContent = {
      ...next,
      initialScanCompleted: true,
      lastProcessedAt: Math.max(lastProcessedAt, now),
      lastSyncedAt: now,
      lastManualSyncedAt: manual ? now : next.lastManualSyncedAt,
      updatedAt: now,
    };
    return saveCalendarContent(mx, saved);
  });
