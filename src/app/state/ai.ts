import { atom } from 'jotai';

const STORAGE_KEY = 'ai-settings';
const LEGACY_MODELS_API_URL = 'https://aihubmix.com/api/v1/models?type=llm';

export type AIModel = {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  type?: string;
  provider?: string;
  modalities?: string[];
  capabilities?: string[];
  supportsChat?: boolean;
};

export type AISkill = {
  id: string;
  name: string;
  command: string;
  model: string;
  systemPrompt: string;
  includeRoomContext: boolean;
  maxEvents: number;
};

export type AISettings = {
  provider: 'aihubmix';
  apiKey: string;
  baseUrl: string;
  modelsApiUrl: string;
  models: AIModel[];
  skills: AISkill[];
};

const defaultAISettings: AISettings = {
  provider: 'aihubmix',
  apiKey: '',
  baseUrl: 'https://aihubmix.com/v1',
  modelsApiUrl: 'https://aihubmix.com/api/v1/models',
  models: [],
  skills: [],
};

const normalizeAISettings = (settings: Partial<AISettings>): AISettings => {
  const nextModelsApiUrl = settings.modelsApiUrl?.trim();

  return {
    ...defaultAISettings,
    ...settings,
    modelsApiUrl:
      !nextModelsApiUrl || nextModelsApiUrl === LEGACY_MODELS_API_URL
        ? defaultAISettings.modelsApiUrl
        : nextModelsApiUrl,
  };
};

export const getAISettings = (): AISettings => {
  const settings = localStorage.getItem(STORAGE_KEY);
  if (settings === null) return defaultAISettings;

  try {
    return normalizeAISettings(JSON.parse(settings) as Partial<AISettings>);
  } catch {
    return defaultAISettings;
  }
};

export const setAISettings = (settings: AISettings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

const baseAISettings = atom<AISettings>(getAISettings());
export const aiSettingsAtom = atom<AISettings, [AISettings], undefined>(
  (get) => get(baseAISettings),
  (get, set, update) => {
    set(baseAISettings, update);
    setAISettings(update);
  }
);
