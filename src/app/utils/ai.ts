import { MatrixEvent, MsgType, Room } from 'matrix-js-sdk';
import { AIModel, AISettings, AISkill } from '../state/ai';
import { trimTrailingSlash } from './common';
import { getMemberDisplayName } from './room';
import { MessageEvent } from '../../types/matrix/room';
import { getMxIdLocalPart } from './matrix';

type OpenAIModelsResponse = {
  data?: Array<Record<string, unknown>>;
  models?: Array<Record<string, unknown>>;
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

export const fetchAihubmixModels = async (modelsApiUrl: string): Promise<AIModel[]> => {
  const response = await fetch(modelsApiUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }

  const data = (await response.json()) as OpenAIModelsResponse;
  const rawModels = Array.isArray(data.data)
    ? data.data
    : Array.isArray(data.models)
      ? data.models
      : [];

  return uniqById(
    rawModels
      .map((item) => {
        const id = typeof item.id === 'string' ? item.id : undefined;
        if (!id) return undefined;

        const contextLength =
          typeof item.context_length === 'number'
            ? item.context_length
            : typeof item.max_context_tokens === 'number'
              ? item.max_context_tokens
              : undefined;

        return {
          id,
          name: typeof item.name === 'string' ? item.name : id,
          description: typeof item.description === 'string' ? item.description : undefined,
          contextWindow: contextLength,
        } satisfies AIModel;
      })
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
