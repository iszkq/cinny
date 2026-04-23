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

type OpenAIAudioTranscriptionResponse = {
  text?: unknown;
  error?: {
    message?: unknown;
  };
};

export const AIHUBMIX_AUDIO_TRANSCRIPTION_MODEL = 'whisper-large-v3-turbo';
export const AIHUBMIX_AUDIO_TRANSCRIPTION_MAX_FILE_SIZE = 25 * 1024 * 1024;

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

const normalizeModelToken = (value: string): string => value.trim().toLowerCase();

const getStringArray = (...values: unknown[]): string[] => {
  const items: string[] = [];

  values.forEach((value) => {
    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (trimmedValue) items.push(trimmedValue);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === 'string') {
          const trimmedValue = item.trim();
          if (trimmedValue) items.push(trimmedValue);
          return;
        }

        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          const nestedString = getStringValue(
            record.type,
            record.name,
            record.id,
            record.value,
            record.label
          );
          if (nestedString) items.push(nestedString);
        }
      });
      return;
    }

    if (value && typeof value === 'object') {
      Object.values(value).forEach((nestedValue) => {
        items.push(...getStringArray(nestedValue));
      });
    }
  });

  return Array.from(new Set(items));
};

const hasToken = (tokens: string[], ...patterns: string[]): boolean =>
  patterns.some((pattern) => tokens.some((token) => token.includes(pattern)));

const inferSupportsChat = (
  id: string,
  name: string,
  type?: string,
  capabilities?: string[],
  modalities?: string[]
): boolean => {
  const tokens = [
    id,
    name,
    type ?? '',
    ...(capabilities ?? []),
    ...(modalities ?? []),
  ].map(normalizeModelToken);

  const chatSignals = [
    'chat',
    'conversation',
    'llm',
    'text',
    'reason',
    'completion',
    'assistant',
    'instruct',
    'vision',
    'multimodal',
  ];
  const nonChatOnlySignals = [
    'embedding',
    'rerank',
    'tts',
    'speech',
    'stt',
    'transcription',
    'audio-to-text',
    'image-generation',
    'images',
    'image',
    'video-generation',
    'video',
  ];

  if (hasToken(tokens, ...chatSignals)) return true;
  if (hasToken(tokens, ...nonChatOnlySignals)) return false;
  return true;
};

export const isChatModel = (model: AIModel): boolean => model.supportsChat !== false;

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
      supportsChat: true,
    };
  }

  const id = getStringValue(item.id, item.model_id, item.model, item.name);
  if (!id) return undefined;

  const name =
    getStringValue(item.name, item.display_name, item.model_name, item.model_id, item.model) ?? id;
  const type = getStringValue(item.type, item.model_type, item.category, item.object);
  const capabilities = getStringArray(
    item.capabilities,
    item.features,
    item.tags,
    item.tasks,
    item.abilities
  );
  const modalities = getStringArray(
    item.modalities,
    item.input_modalities,
    item.output_modalities,
    item.modality,
    item.input_types,
    item.output_types
  );

  return {
    id,
    name,
    description: getStringValue(item.description, item.desc, item.summary),
    contextWindow: getNumberValue(
      item.context_length,
      item.max_context_tokens,
      item.max_input_tokens,
      item.context_window
    ),
    type,
    provider: getStringValue(item.owned_by, item.provider, item.vendor),
    capabilities: capabilities.length > 0 ? capabilities : undefined,
    modalities: modalities.length > 0 ? modalities : undefined,
    supportsChat: inferSupportsChat(id, name, type, capabilities, modalities),
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

const extractOpenAICompatibleError = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== 'object') return undefined;

  const record = payload as Record<string, unknown>;
  const message = record.error;

  if (message && typeof message === 'object') {
    const errorRecord = message as Record<string, unknown>;
    if (typeof errorRecord.message === 'string' && errorRecord.message.trim()) {
      return errorRecord.message.trim();
    }
  }

  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message.trim();
  }

  return undefined;
};

const decodeEscapedText = (value: string): string => {
  let nextValue = value;

  for (let index = 0; index < 3; index += 1) {
    if (!/\\[nrt"\\/]|\\u[0-9a-fA-F]{4}/.test(nextValue)) {
      break;
    }

    try {
      const decodedValue = JSON.parse(
        `"${nextValue.replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`
      ) as string;

      if (decodedValue === nextValue) {
        break;
      }

      nextValue = decodedValue;
    } catch {
      break;
    }
  }

  return nextValue.trim();
};

const normalizeAihubmixText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;

  const trimmedValue = value.trim();
  if (!trimmedValue) return undefined;

  return decodeEscapedText(trimmedValue);
};

export const getAihubmixAudioTranscriptionApiKey = (
  settings: Pick<AISettings, 'apiKey'>,
  defaultApiKey?: string
): string => {
  const sharedApiKey = defaultApiKey?.trim();
  if (sharedApiKey) return sharedApiKey;

  return settings.apiKey.trim();
};

type TranscribeAudioWithAihubmixOptions = {
  model?: string;
  language?: string;
  temperature?: number;
  filename?: string;
  mimeType?: string;
  apiKey?: string;
};

export const transcribeAudioWithAihubmix = async (
  settings: AISettings,
  audioBlob: Blob,
  options: TranscribeAudioWithAihubmixOptions = {}
): Promise<string> => {
  const apiKey = getAihubmixAudioTranscriptionApiKey(settings, options.apiKey);

  if (!apiKey) {
    throw new Error('Please configure your AIHubMix API key first.');
  }

  if (audioBlob.size > AIHUBMIX_AUDIO_TRANSCRIPTION_MAX_FILE_SIZE) {
    throw new Error('AIHubMix audio transcription currently supports files up to 25MB.');
  }

  const endpoint = `${trimTrailingSlash(settings.baseUrl)}/audio/transcriptions`;
  const formData = new FormData();
  const fileName = options.filename?.trim() || 'voice-message.webm';
  const model = options.model?.trim() || AIHUBMIX_AUDIO_TRANSCRIPTION_MODEL;

  const uploadFile =
    audioBlob instanceof File
      ? audioBlob
      : new File([audioBlob], fileName, {
          type: options.mimeType?.trim() || audioBlob.type || 'audio/webm',
        });

  formData.append('model', model);
  formData.append('file', uploadFile);
  formData.append('language', options.language?.trim() || 'zh');
  formData.append('temperature', `${options.temperature ?? 0.2}`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const rawText = await response.text();
  let payload: OpenAIAudioTranscriptionResponse | undefined;
  try {
    payload = rawText ? (JSON.parse(rawText) as OpenAIAudioTranscriptionResponse) : undefined;
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    throw new Error(
      normalizeAihubmixText(extractOpenAICompatibleError(payload)) ??
        `AI audio transcription failed: ${response.status}`
    );
  }

  const transcriptionText = normalizeAihubmixText(payload?.text);

  if (!transcriptionText) {
    throw new Error('The audio transcription response did not contain any text.');
  }

  return transcriptionText;
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
