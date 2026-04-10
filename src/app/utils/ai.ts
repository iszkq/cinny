import { MatrixEvent, MsgType, Room } from 'matrix-js-sdk';
import { AIModel, AISettings, AISkill } from '../state/ai';
import { trimTrailingSlash } from './common';
import { getMemberDisplayName } from './room';
import { MessageEvent } from '../../types/matrix/room';
import { getMxIdLocalPart } from './matrix';

type OpenAIModelsResponse = {
  data?: unknown;
  models?: unknown;
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

const uniqById = (models: AIModel[]): AIModel[] => {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
};

const getStringValue = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (trimmedValue) return trimmedValue;
    }
  }
  return undefined;
};

const getNumberValue = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    if (typeof value === 'string') {
      const parsedValue = Number(value);
      if (Number.isFinite(parsedValue)) return parsedValue;
    }
  }
  return undefined;
};

const flattenModelPayload = (payload: unknown): Array<Record<string, unknown> | string> => {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => flattenModelPayload(item));
  }

  if (typeof payload === 'string') {
    return [payload];
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;

    if (
      typeof record.id === 'string' ||
      typeof record.model_id === 'string' ||
      typeof record.model === 'string'
    ) {
      return [record];
    }

    return Object.values(record).flatMap((value) => flattenModelPayload(value));
  }

  return [];
};

const toAIModel = (item: Record<string, unknown> | string): AIModel | undefined => {
  if (typeof item === 'string') {
    return {
      id: item,
      name: item,
    };
  }

  const id = getStringValue(item.id, item.model_id, item.model, item.name);
  if (!id) return undefined;

  return {
    id,
    name:
      getStringValue(item.name, item.display_name, item.model_name, item.model_id, item.model) ??
      id,
    description: getStringValue(item.description, item.desc, item.summary),
    contextWindow: getNumberValue(
      item.context_length,
      item.max_context_tokens,
      item.max_input_tokens,
      item.context_window
    ),
  };
};

export const fetchAihubmixModels = async (
  modelsApiUrl: string,
  apiKey?: string
): Promise<AIModel[]> => {
  const trimmedApiKey = apiKey?.trim();
  const response = await fetch(modelsApiUrl, {
    headers: {
      Accept: 'application/json',
      ...(trimmedApiKey ? { Authorization: `Bearer ${trimmedApiKey}` } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }

  const data = (await response.json()) as OpenAIModelsResponse;
  const rawModels = flattenModelPayload(data.data ?? data.models ?? data);

  return uniqById(
    rawModels
      .map((item) => toAIModel(item))
      .filter((item): item is AIModel => !!item)
  );
};

const eventToContextLine = (room: Room, event: MatrixEvent) => {
  const senderId = event.getSender() ?? '';
  const senderName = getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? senderId;

  if (event.getType() === MessageEvent.Sticker) {
    const label = event.getContent().body ?? 'Sticker';
    return `[${senderName}] [sticker] ${label}`;
  }

  if (event.getType() !== MessageEvent.RoomMessage) return undefined;

  const content = event.getContent();
  const msgType = content.msgtype ?? MsgType.Text;
  const body = typeof content.body === 'string' ? content.body : '';

  if (
    !body &&
    msgType !== MsgType.Image &&
    msgType !== MsgType.Video &&
    msgType !== MsgType.Audio
  ) {
    return undefined;
  }

  if (msgType === MsgType.Image) return `[${senderName}] [image] ${body || 'Image'}`;
  if (msgType === MsgType.Video) return `[${senderName}] [video] ${body || 'Video'}`;
  if (msgType === MsgType.Audio) return `[${senderName}] [audio] ${body || 'Audio'}`;
  if (msgType === MsgType.File) return `[${senderName}] [file] ${body || 'File'}`;
  return `[${senderName}] ${body}`;
};

const buildSkillPrompt = (room: Room, skill: AISkill, payload: string): string => {
  const liveEvents = room
    .getUnfilteredTimelineSet()
    .getLiveTimeline()
    .getEvents()
    .filter((event) => !event.isRedacted())
    .slice(-skill.maxEvents);

  const uniqueUsers = new Set(liveEvents.map((event) => event.getSender()).filter(Boolean));
  const timelineContext = liveEvents
    .map((event) => eventToContextLine(room, event))
    .filter((line): line is string => !!line)
    .join('\n');

  const roomName = room.name || room.roomId;
  const contextPrefix = skill.includeRoomContext
    ? [
        `Room: ${roomName}`,
        `Active users in recent context: ${uniqueUsers.size}`,
        'Recent room context:',
        timelineContext || '[No recent message context loaded in the client]',
      ].join('\n')
    : `Room: ${roomName}`;

  return `${contextPrefix}\n\nUser request:\n${payload.trim()}`;
};

const extractChatText = (response: OpenAIChatResponse): string => {
  const first = response.choices?.[0]?.message?.content;
  if (typeof first === 'string') return first.trim();
  if (Array.isArray(first)) {
    return first
      .map((item) => (typeof item.text === 'string' ? item.text : ''))
      .join('\n')
      .trim();
  }
  throw new Error('The AI response did not contain any text.');
};

export const runAISkill = async (
  room: Room,
  settings: AISettings,
  skill: AISkill,
  payload: string
): Promise<string> => {
  if (!settings.apiKey.trim()) {
    throw new Error('Please configure your AIHubMix API key first.');
  }

  if (!payload.trim()) {
    throw new Error('Please describe what you want the assistant to do.');
  }

  const endpoint = `${trimTrailingSlash(settings.baseUrl)}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: skill.model,
      messages: [
        {
          role: 'system',
          content: skill.systemPrompt,
        },
        {
          role: 'user',
          content: buildSkillPrompt(room, skill, payload),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status}`);
  }

  const data = (await response.json()) as OpenAIChatResponse;
  return extractChatText(data);
};
