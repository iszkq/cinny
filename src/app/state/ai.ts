import { atom } from 'jotai';
import {
  CinnyAISettingsContent,
  CinnyAISettingsSkillContent,
} from '../../types/matrix/accountData';
import {
  AIHUBMIX_PREFERRED_BASE_URL,
  AIHUBMIX_PREFERRED_MODELS_API_URL,
  getAihubmixUrlCandidates,
} from '../constants/aihubmix';

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
  baseUrl: AIHUBMIX_PREFERRED_BASE_URL,
  modelsApiUrl: AIHUBMIX_PREFERRED_MODELS_API_URL,
  models: [],
  skills: [],
};

const getTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;

  const trimmedValue = value.trim();
  return trimmedValue || undefined;
};

const normalizeSkillId = (
  inputId: string | undefined,
  inputName: string,
  inputCommand: string
): string => {
  if (inputId) return inputId;

  const fallbackId = `skill_${inputCommand || inputName || 'assistant'}`;
  return fallbackId.replace(/[^\w-]+/g, '_');
};

const normalizeAISkill = (
  skill: AISkill | CinnyAISettingsSkillContent | Partial<AISkill>
): AISkill | undefined => {
  const name = getTrimmedString(skill.name);
  const command = getTrimmedString(skill.command);
  const model = getTrimmedString(skill.model);
  const systemPrompt = getTrimmedString(skill.systemPrompt);

  if (!name || !command || !model || !systemPrompt) {
    return undefined;
  }

  return {
    id: normalizeSkillId(getTrimmedString(skill.id), name, command),
    name,
    command,
    model,
    systemPrompt,
    includeRoomContext:
      typeof skill.includeRoomContext === 'boolean' ? skill.includeRoomContext : true,
    maxEvents:
      typeof skill.maxEvents === 'number' && Number.isFinite(skill.maxEvents) && skill.maxEvents > 0
        ? Math.round(skill.maxEvents)
        : 40,
  };
};

const normalizeAIModel = (model: AIModel): AIModel | undefined => {
  const id = getTrimmedString(model.id);
  const name = getTrimmedString(model.name);

  if (!id || !name) return undefined;

  return {
    ...model,
    id,
    name,
    description: getTrimmedString(model.description),
    type: getTrimmedString(model.type),
    provider: getTrimmedString(model.provider),
  };
};

const getAISettingsSyncShape = (
  settings: Partial<AISettings> | CinnyAISettingsContent
): Omit<CinnyAISettingsContent, 'version' | 'updatedAt'> => {
  const configuredBaseUrl = getTrimmedString(settings.baseUrl) ?? defaultAISettings.baseUrl;
  const baseUrl = getAihubmixUrlCandidates(configuredBaseUrl)[0] ?? defaultAISettings.baseUrl;
  const modelsApiUrl = getTrimmedString(settings.modelsApiUrl);
  const normalizedModelsApiUrl =
    !modelsApiUrl || modelsApiUrl === LEGACY_MODELS_API_URL
      ? defaultAISettings.modelsApiUrl
      : getAihubmixUrlCandidates(modelsApiUrl)[0] ?? modelsApiUrl;

  return {
    provider: 'aihubmix',
    apiKey: getTrimmedString(settings.apiKey) ?? '',
    baseUrl,
    modelsApiUrl: normalizedModelsApiUrl,
    skills: Array.isArray(settings.skills)
      ? settings.skills
          .map((skill) => normalizeAISkill(skill))
          .filter((skill): skill is AISkill => !!skill)
      : [],
  };
};

export const normalizeAISettings = (settings: Partial<AISettings>): AISettings => {
  const syncShape = getAISettingsSyncShape(settings);

  return {
    ...defaultAISettings,
    ...settings,
    ...syncShape,
    models: Array.isArray(settings.models)
      ? settings.models
          .map((model) => normalizeAIModel(model))
          .filter((model): model is AIModel => !!model)
      : defaultAISettings.models,
  };
};

export const getAISettingsAccountDataContent = (settings: AISettings): CinnyAISettingsContent => ({
  version: 1,
  updatedAt: Date.now(),
  ...getAISettingsSyncShape(settings),
});

export const getAISettingsAccountDataSignature = (
  settings: AISettings | CinnyAISettingsContent
): string => JSON.stringify(getAISettingsSyncShape(settings));

export const applyAISettingsAccountData = (
  currentSettings: AISettings,
  content?: CinnyAISettingsContent
): AISettings => {
  if (!content) return currentSettings;

  return normalizeAISettings({
    ...currentSettings,
    ...getAISettingsSyncShape(content),
    models: currentSettings.models,
  });
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
