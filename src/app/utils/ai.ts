import { MatrixEvent, MsgType, Room } from 'matrix-js-sdk';
import { AIModel, AISettings, AISkill } from '../state/ai';
import { trimTrailingSlash } from './common';
import { getMemberDisplayName } from './room';
import { MessageEvent } from '../../types/matrix/room';
import { fetchMediaWithAuth, getMxIdLocalPart } from './matrix';
import { isAndroidApp } from './nativePlatform';
import {
  AIHUBMIX_PREFERRED_BASE_URL,
  getAihubmixEndpointCandidates,
  getAihubmixUrlCandidates,
} from '../constants/aihubmix';

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
export const AIHUBMIX_IMAGE_OCR_MODEL = 'glm-ocr';

export type AihubmixImageOcrConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

const DATA_URL_RE = /^data:/i;
const RETRYABLE_AIHUBMIX_STATUSES = new Set([408, 425, 502, 503, 504]);

const shouldRetryAihubmixStatus = (status: number): boolean =>
  RETRYABLE_AIHUBMIX_STATUSES.has(status) || status >= 500;

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
  const tokens = [id, name, type ?? '', ...(capabilities ?? []), ...(modalities ?? [])].map(
    normalizeModelToken
  );

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

type AihubmixModelsAttempt = {
  models?: AIModel[];
  retryableError?: string;
  terminalStatus?: number;
};

const fetchAihubmixModelsFromEndpoint = async (
  endpoint: string,
  apiKey?: string
): Promise<AihubmixModelsAttempt> => {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    });
  } catch (error) {
    return {
      retryableError: `${endpoint}: ${
        error instanceof Error && error.message ? error.message : 'network error'
      }`,
    };
  }

  if (!response.ok) {
    if (!shouldRetryAihubmixStatus(response.status)) {
      return { terminalStatus: response.status };
    }
    return { retryableError: `${new URL(endpoint).host}: HTTP ${response.status}` };
  }

  try {
    const data = (await response.json()) as OpenAIModelsResponse;
    const rawModels = flattenModelPayload(data.data ?? data.models ?? data);

    return {
      models: uniqById(
        rawModels.map((item) => toAIModel(item)).filter((item): item is AIModel => !!item)
      ),
    };
  } catch (error) {
    return {
      retryableError: `${new URL(endpoint).host}: invalid models response (${
        error instanceof Error && error.message ? error.message : 'parse error'
      })`,
    };
  }
};

export const fetchAihubmixModels = async (
  modelsApiUrl: string,
  apiKey?: string
): Promise<AIModel[]> => {
  const trimmedApiKey = apiKey?.trim();
  const errors: string[] = [];

  // Official routes are attempted sequentially so an HTTP result is never raced or duplicated.
  // eslint-disable-next-line no-restricted-syntax
  for (const endpoint of getAihubmixUrlCandidates(modelsApiUrl)) {
    // eslint-disable-next-line no-await-in-loop
    const attempt = await fetchAihubmixModelsFromEndpoint(endpoint, trimmedApiKey);
    if (attempt.models) return attempt.models;
    if (attempt.terminalStatus) {
      throw new Error(`Failed to fetch models: ${attempt.terminalStatus}`);
    }
    if (attempt.retryableError) errors.push(attempt.retryableError);
  }

  throw new Error(
    `Failed to fetch AIHubMix models from all available routes. ${errors.join(' | ')}`
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

const sanitizeImageOcrText = (value: string): string => {
  const decodedText = decodeEscapedText(value);

  return decodedText
    .replace(/```[\w-]*\s*/g, '')
    .replace(/```/g, '')
    .replace(/!\[[^\]\n]*\]\([^)]*\bbbox\s*=\s*\[[^\]\n]+\][^)]*\)/gi, '')
    .replace(/^\s*(?:page\s*=\s*\d+\s*,\s*)?bbox\s*=\s*\[[^\]\n]+\]\s*$/gim, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<\/div\s*>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to serialize image.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image.'));
    reader.readAsDataURL(blob);
  });

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const dataUrl = await blobToDataUrl(blob);
  const separatorIndex = dataUrl.indexOf(',');
  return separatorIndex >= 0 ? dataUrl.slice(separatorIndex + 1) : dataUrl;
};

const getAihubmixImageOcrUrl = async (src: string): Promise<string> => {
  if (DATA_URL_RE.test(src)) return src;

  // Matrix authenticated media needs the access token on every platform.
  // In particular, iOS Safari cannot read the protected image with fetch(src).
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetchMediaWithAuth(src, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to load image for OCR: ${response.status}`);
    }

    return await blobToDataUrl(await response.blob());
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const parseAihubmixPayload = <T>(value: unknown): T | undefined => {
  if (value && typeof value === 'object') return value as T;
  if (typeof value !== 'string' || !value.trim()) return undefined;

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

const toAihubmixNetworkError = (error: unknown): Error => {
  const detail = error instanceof Error ? error.message.trim() : '';
  return new Error(
    detail
      ? `AIHubMix 优选线路和标准线路均无法连接，请检查网络后重试。(${detail})`
      : 'AIHubMix 优选线路和标准线路均无法连接，请检查网络后重试。'
  );
};

type AihubmixRequestResult<T> = {
  status: number;
  ok: boolean;
  payload?: T;
};

type AihubmixBrowserRequest = {
  endpoint: string;
  headers: Record<string, string>;
  body: XMLHttpRequestBodyInit;
  timeoutMs: number;
};

const getErrorDetail = (error: unknown): string =>
  error instanceof Error && error.message.trim() ? error.message.trim() : 'unknown error';

const requestAihubmixWithXhr = <T>({
  endpoint,
  headers,
  body,
  timeoutMs,
}: AihubmixBrowserRequest): Promise<AihubmixRequestResult<T>> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);
    xhr.timeout = timeoutMs;
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));

    xhr.onload = () => {
      if (xhr.status === 0) {
        reject(new Error('XMLHttpRequest returned status 0.'));
        return;
      }
      resolve({
        status: xhr.status,
        ok: xhr.status >= 200 && xhr.status < 300,
        payload: parseAihubmixPayload<T>(xhr.responseText),
      });
    };
    xhr.onerror = () => reject(new Error('XMLHttpRequest network error.'));
    xhr.ontimeout = () => reject(new Error('XMLHttpRequest timed out.'));
    xhr.onabort = () => reject(new Error('XMLHttpRequest was aborted.'));
    xhr.send(body);
  });

const requestAihubmixInBrowser = async <T>(
  request: AihubmixBrowserRequest
): Promise<AihubmixRequestResult<T>> => {
  const controller = new AbortController();
  const fetchTimeoutMs = Math.min(request.timeoutMs, 45_000);
  const timeoutId = window.setTimeout(() => controller.abort(), fetchTimeoutMs);

  try {
    const response = await fetch(request.endpoint, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    return {
      status: response.status,
      ok: response.ok,
      payload: parseAihubmixPayload<T>(await response.text()),
    };
  } catch (fetchError) {
    try {
      return await requestAihubmixWithXhr<T>(request);
    } catch (xhrError) {
      throw new Error(`fetch: ${getErrorDetail(fetchError)}; xhr: ${getErrorDetail(xhrError)}`);
    }
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const getAndroidNativeHeaders = (headers: Record<string, string>): Record<string, string> => ({
  Accept: 'application/json',
  Origin: window.location.origin,
  'User-Agent': navigator.userAgent,
  ...headers,
});

type AihubmixRouteRequest<T> = {
  endpoints: string[];
  browserRequest: (endpoint: string) => Promise<AihubmixRequestResult<T>>;
  nativeRequest?: (endpoint: string) => Promise<AihubmixRequestResult<T>>;
};

const requestAihubmixAcrossRoutes = async <T>({
  endpoints,
  browserRequest,
  nativeRequest,
}: AihubmixRouteRequest<T>): Promise<AihubmixRequestResult<T>> => {
  const errors: string[] = [];
  let lastRetryableResponse: AihubmixRequestResult<T> | undefined;

  // Keep route and transport attempts sequential to avoid duplicate billable AI requests.
  // eslint-disable-next-line no-restricted-syntax
  for (const endpoint of endpoints) {
    let browserFailed = false;

    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await browserRequest(endpoint);
      if (response.ok || !shouldRetryAihubmixStatus(response.status)) return response;

      lastRetryableResponse = response;
      errors.push(`${new URL(endpoint).host}: HTTP ${response.status}`);
    } catch (error) {
      browserFailed = true;
      errors.push(`${new URL(endpoint).host} browser: ${getErrorDetail(error)}`);
    }

    if (browserFailed && isAndroidApp() && nativeRequest) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const response = await nativeRequest(endpoint);
        if (response.ok || !shouldRetryAihubmixStatus(response.status)) return response;

        lastRetryableResponse = response;
        errors.push(`${new URL(endpoint).host} native: HTTP ${response.status}`);
      } catch (error) {
        errors.push(`${new URL(endpoint).host} native: ${getErrorDetail(error)}`);
      }
    }
  }

  if (lastRetryableResponse) return lastRetryableResponse;

  throw new Error(errors.join(' | ') || 'No AIHubMix route is available.');
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

  const endpoints = getAihubmixEndpointCandidates(
    settings.baseUrl || AIHUBMIX_PREFERRED_BASE_URL,
    '/audio/transcriptions'
  );
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

  let uploadBase64Promise: Promise<string> | undefined;
  const getUploadBase64 = () => {
    uploadBase64Promise ??= blobToBase64(uploadFile);
    return uploadBase64Promise;
  };

  let response: AihubmixRequestResult<OpenAIAudioTranscriptionResponse>;

  try {
    response = await requestAihubmixAcrossRoutes<OpenAIAudioTranscriptionResponse>({
      endpoints,
      browserRequest: (endpoint) =>
        requestAihubmixInBrowser<OpenAIAudioTranscriptionResponse>({
          endpoint,
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
          timeoutMs: 120000,
        }),
      nativeRequest: async (endpoint) => {
        const { CapacitorHttp } = await import('@capacitor/core');
        const nativeResponse = await CapacitorHttp.post({
          url: endpoint,
          headers: getAndroidNativeHeaders({
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'multipart/form-data',
          }),
          dataType: 'formData',
          data: [
            { key: 'model', value: model, type: 'string' },
            { key: 'language', value: options.language?.trim() || 'zh', type: 'string' },
            { key: 'temperature', value: `${options.temperature ?? 0.2}`, type: 'string' },
            {
              key: 'file',
              value: await getUploadBase64(),
              type: 'base64File',
              contentType: uploadFile.type || 'audio/webm',
              fileName: uploadFile.name,
            },
          ],
          responseType: 'json',
          connectTimeout: 30000,
          readTimeout: 120000,
        });

        return {
          status: nativeResponse.status,
          ok: nativeResponse.status >= 200 && nativeResponse.status < 300,
          payload: parseAihubmixPayload<OpenAIAudioTranscriptionResponse>(nativeResponse.data),
        };
      },
    });
  } catch (error) {
    throw toAihubmixNetworkError(error);
  }

  if (!response.ok) {
    throw new Error(
      normalizeAihubmixText(extractOpenAICompatibleError(response.payload)) ??
        `AI audio transcription failed: ${response.status}`
    );
  }

  const transcriptionText = normalizeAihubmixText(response.payload?.text);

  if (!transcriptionText) {
    throw new Error('The audio transcription response did not contain any text.');
  }

  return transcriptionText;
};

export const recognizeImageTextWithAihubmix = async (
  imageSrc: string,
  config?: AihubmixImageOcrConfig
): Promise<string> => {
  const apiKey = config?.apiKey?.trim();

  if (!apiKey) {
    throw new Error(
      '\u8bf7\u5148\u5728 config.json \u7684 imageOcr.defaultAihubmixApiKey \u914d\u7f6e AIHubMix API Key\u3002'
    );
  }

  const endpoints = getAihubmixEndpointCandidates(
    config?.baseUrl?.trim() || AIHUBMIX_PREFERRED_BASE_URL,
    '/chat/completions'
  );
  const imageUrl = await getAihubmixImageOcrUrl(imageSrc);
  const requestData = {
    model: config?.model?.trim() || AIHUBMIX_IMAGE_OCR_MODEL,
    messages: [
      {
        role: 'system',
        content:
          '\u4f60\u662f\u4e00\u4e2a\u4e25\u683c\u7684\u5168\u91cf OCR \u7eaf\u6587\u672c\u63d0\u53d6\u5668\u3002\u5fc5\u987b\u6309\u4ece\u4e0a\u5230\u4e0b\u3001\u4ece\u5de6\u5230\u53f3\u7684\u9605\u8bfb\u987a\u5e8f\uff0c\u9010\u884c\u8f93\u51fa\u56fe\u7247\u4e2d\u771f\u5b9e\u5b58\u5728\u7684\u6240\u6709\u6587\u5b57\u3002\u4e0d\u8981\u56e0\u4e3a\u6587\u5b57\u91cd\u590d\u3001\u98ce\u683c\u5316\u3001\u5b57\u4f53\u5927\u5c0f\u4e0d\u540c\u6216\u5e95\u90e8\u5c0f\u5b57\u800c\u7701\u7565\uff1b\u62ec\u53f7\u3001\u7ae0\u8282\u53f7\u3001\u65e5\u671f\u3001\u6807\u70b9\u4e5f\u8981\u4fdd\u7559\u3002\u4e0d\u8981\u89e3\u91ca\uff0c\u4e0d\u8981\u8865\u5145\uff0c\u4e0d\u8981\u751f\u6210 Markdown\u3001HTML\u3001XML\u3001JSON \u6216\u4ee3\u7801\u5757\u3002Do not output Markdown image placeholders such as ![](page=0,bbox=[...]), page labels, bbox coordinates, or layout markers.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '\u8bf7\u5bf9\u8fd9\u5f20\u56fe\u505a\u9010\u884c\u5168\u91cf OCR\u3002\u8bf7\u7279\u522b\u68c0\u67e5\u9876\u90e8\u5927\u5b57\u3001\u4e2d\u95f4\u5f69\u8272\u5927\u5b57\u3001\u5e95\u90e8\u6a2a\u5e45\u5c0f\u5b57\u548c\u62ec\u53f7\u91cc\u7684\u7ecf\u6587\u7ae0\u8282\u53f7\u3002\u8f93\u51fa\u7eaf\u6587\u672c\uff0c\u4e0d\u8981\u4f7f\u7528 #\u3001<div>\u3001</div>\u3001```\u3001![](page=0,bbox=[...]) \u6216\u4efb\u4f55\u683c\u5f0f\u5316\u3001\u5750\u6807\u3001\u7248\u9762\u6807\u8bb0\u3002',
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl,
              detail: 'high',
            },
          },
        ],
      },
    ],
    temperature: 0,
  };
  let response: AihubmixRequestResult<OpenAIChatResponse>;

  try {
    response = await requestAihubmixAcrossRoutes<OpenAIChatResponse>({
      endpoints,
      browserRequest: (endpoint) =>
        requestAihubmixInBrowser<OpenAIChatResponse>({
          endpoint,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestData),
          timeoutMs: 120000,
        }),
      nativeRequest: async (endpoint) => {
        const { CapacitorHttp } = await import('@capacitor/core');
        const nativeResponse = await CapacitorHttp.post({
          url: endpoint,
          headers: getAndroidNativeHeaders({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          }),
          data: requestData,
          responseType: 'json',
          connectTimeout: 30000,
          readTimeout: 120000,
        });

        return {
          status: nativeResponse.status,
          ok: nativeResponse.status >= 200 && nativeResponse.status < 300,
          payload: parseAihubmixPayload<OpenAIChatResponse>(nativeResponse.data),
        };
      },
    });
  } catch (error) {
    throw toAihubmixNetworkError(error);
  }

  if (!response.ok) {
    throw new Error(
      normalizeAihubmixText(extractOpenAICompatibleError(response.payload)) ??
        `\u56fe\u7247\u6587\u5b57\u8bc6\u522b\u5931\u8d25\uff1a${response.status}`
    );
  }

  if (!response.payload) {
    throw new Error('OCR \u54cd\u5e94\u91cc\u6ca1\u6709\u6587\u672c\u3002');
  }

  const recognizedText = sanitizeImageOcrText(extractChatText(response.payload));
  if (!recognizedText) {
    throw new Error('\u6ca1\u6709\u8bc6\u522b\u5230\u6587\u5b57\u3002');
  }

  return recognizedText;
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
