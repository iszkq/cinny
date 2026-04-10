import { Direction, IContent, MatrixEvent, Room } from 'matrix-js-sdk';

export const POLL_MSGTYPE = 'io.cinny.poll';
export const POLL_DATA_KEY = 'io.cinny.poll';
export const POLL_RESPONSE_EVENT_TYPE = 'io.cinny.poll.response';
export const POLL_RESPONSE_DATA_KEY = 'io.cinny.poll.response';
export const POLL_RESPONSE_REL_TYPE = 'io.cinny.poll.response';
export const POLL_MAX_OPTIONS = 10;

export type PollMode = 'single' | 'multiple' | 'pk';

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
  mode: PollMode;
  options: string[];
  maxSelections?: number;
  showVoters: boolean;
  expiresAt?: number;
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

const getPollMaxSelections = (mode: PollMode, optionsLength: number, rawMaxSelections?: number): number => {
  if (mode === 'single' || mode === 'pk') return 1;

  const parsedMaxSelections =
    typeof rawMaxSelections === 'number' && Number.isFinite(rawMaxSelections)
      ? Math.round(rawMaxSelections)
      : 2;

  return Math.min(optionsLength, Math.max(1, parsedMaxSelections));
};

export const getPollModeLabel = (mode: PollMode): string => {
  if (mode === 'multiple') return '多选投票';
  if (mode === 'pk') return 'PK 投票';
  return '单选投票';
};

const buildPollFallbackBody = (data: PollData): string => {
  const lines = [`[投票] ${data.title}`];

  if (data.description) {
    lines.push(data.description);
  }

  data.options.forEach((option, index) => {
    lines.push(`${index + 1}. ${option.text}`);
  });

  lines.push(`类型: ${getPollModeLabel(data.mode)}`);

  if (data.mode === 'multiple') {
    lines.push(`最多可选: ${data.maxSelections} 项`);
  }

  if (typeof data.expiresAt === 'number') {
    lines.push(`截止时间: ${new Date(data.expiresAt).toLocaleString()}`);
  }

  lines.push(`投票昵称: ${data.showVoters ? '可见' : '隐藏'}`);

  return lines.join('\n');
};

export const createPollMessageContent = (input: CreatePollInput): IContent => {
  const mode: PollMode = input.mode === 'multiple' || input.mode === 'pk' ? input.mode : 'single';
  const options = sanitizePollOptions(input.options);
  const title = input.title.trim();
  const description = sanitizeText(input.description);
  const expiresAt =
    typeof input.expiresAt === 'number' && Number.isFinite(input.expiresAt) && input.expiresAt > Date.now()
      ? input.expiresAt
      : undefined;

  const data: PollData = {
    version: 1,
    title,
    description,
    mode,
    options,
    maxSelections: getPollMaxSelections(mode, options.length, input.maxSelections),
    showVoters: input.showVoters,
    expiresAt,
  };

  return {
    msgtype: POLL_MSGTYPE,
    body: buildPollFallbackBody(data),
    [POLL_DATA_KEY]: data,
  };
};

export const parsePollData = (content: IContent): PollData | undefined => {
  if (content.msgtype !== POLL_MSGTYPE) return undefined;
  if (!content[POLL_DATA_KEY] || typeof content[POLL_DATA_KEY] !== 'object') return undefined;

  const rawData = content[POLL_DATA_KEY] as Record<string, unknown>;
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
    typeof rawData.expiresAt === 'number' && Number.isFinite(rawData.expiresAt) ? rawData.expiresAt : undefined;

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
};

export const isPollMessage = (content: IContent): boolean => !!parsePollData(content);

export const createPollResponseContent = (pollEventId: string, answers: string[]): IContent => {
  const uniqueAnswers = Array.from(new Set(answers));

  return {
    'm.relates_to': {
      rel_type: POLL_RESPONSE_REL_TYPE,
      event_id: pollEventId,
    },
    [POLL_RESPONSE_DATA_KEY]: {
      version: 1,
      pollEventId,
      answers: uniqueAnswers,
      answeredAt: Date.now(),
    } satisfies PollResponseData,
  };
};

const getLinkedTimelines = (room: Room, eventId: string): MatrixEvent[] => {
  const baseTimeline = room.getTimelineForEvent(eventId) ?? room.getLiveTimeline();
  let firstTimeline = baseTimeline;
  let previousTimeline = firstTimeline.getNeighbouringTimeline(Direction.Backward);

  while (previousTimeline) {
    firstTimeline = previousTimeline;
    previousTimeline = firstTimeline.getNeighbouringTimeline(Direction.Backward);
  }

  const events: MatrixEvent[] = [];
  const seen = new Set<string>();
  let currentTimeline: typeof firstTimeline | null = firstTimeline;

  while (currentTimeline) {
    currentTimeline.getEvents().forEach((event) => {
      const eventIdValue = event.getId();
      if (!eventIdValue || seen.has(eventIdValue)) return;

      seen.add(eventIdValue);
      events.push(event);
    });

    currentTimeline = currentTimeline.getNeighbouringTimeline(Direction.Forward);
  }

  return events;
};

export const isPollResponseEvent = (event: MatrixEvent, pollEventId?: string): boolean => {
  if (event.getType() !== POLL_RESPONSE_EVENT_TYPE) return false;

  const relation = event.getRelation();
  const content = event.getContent<IContent>();
  const rawData =
    content[POLL_RESPONSE_DATA_KEY] && typeof content[POLL_RESPONSE_DATA_KEY] === 'object'
      ? (content[POLL_RESPONSE_DATA_KEY] as Record<string, unknown>)
      : undefined;

  const responsePollEventId =
    relation?.event_id ?? (typeof rawData?.pollEventId === 'string' ? rawData.pollEventId : undefined);

  if (!responsePollEventId) return false;
  if (pollEventId) return responsePollEventId === pollEventId;
  return true;
};

export const parsePollResponseData = (event: MatrixEvent, poll: PollData): PollResponseData | undefined => {
  if (!isPollResponseEvent(event)) return undefined;

  const content = event.getContent<IContent>();
  const rawData =
    content[POLL_RESPONSE_DATA_KEY] && typeof content[POLL_RESPONSE_DATA_KEY] === 'object'
      ? (content[POLL_RESPONSE_DATA_KEY] as Record<string, unknown>)
      : undefined;

  const answers = Array.isArray(rawData?.answers)
    ? rawData?.answers
        .filter((answer): answer is string => typeof answer === 'string')
        .filter((answer, index, array) => array.indexOf(answer) === index)
        .filter((answer) => poll.options.find((option) => option.id === answer))
    : [];

  if (answers.length === 0) return undefined;

  const relation = event.getRelation();
  const pollEventId =
    relation?.event_id ?? (typeof rawData?.pollEventId === 'string' ? rawData.pollEventId : undefined);
  if (!pollEventId) return undefined;

  return {
    version: 1,
    pollEventId,
    answers,
    answeredAt: typeof rawData?.answeredAt === 'number' ? rawData.answeredAt : event.getTs(),
  };
};

export const hasPollEnded = (poll: PollData): boolean =>
  typeof poll.expiresAt === 'number' ? poll.expiresAt <= Date.now() : false;

export const summarizePoll = (
  room: Room,
  pollEventId: string,
  poll: PollData,
  currentUserId?: string
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

  getLinkedTimelines(room, pollEventId).forEach((event) => {
    if (event.isRedacted()) return;
    if (!isPollResponseEvent(event, pollEventId)) return;

    const senderId = event.getSender();
    const eventId = event.getId();
    if (!senderId || !eventId) return;

    const response = parsePollResponseData(event, poll);
    if (!response) return;

    const currentIds = responseEventIdsBySender.get(senderId) ?? [];
    currentIds.push(eventId);
    responseEventIdsBySender.set(senderId, currentIds);

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
    totalSelections,
    totalVoters: latestBySender.size,
  };
};
