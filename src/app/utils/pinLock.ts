import { AccountDataEvent, CinnyAccountPinPolicyContent } from '../../types/matrix/accountData';
import { isDesktopUpdaterSupported } from './desktopUpdater';

export type AccountPinConfig = {
  version: 1;
  salt: string;
  hash: string;
  iterations: number;
  updatedAt: number;
};

type AccountPinConfigMap = Record<string, AccountPinConfig>;

type ScreenLockState = {
  locked: boolean;
  accountKey?: string;
};

type AccountPinPolicyState = {
  enabled: boolean;
  updatedAt: number;
  config?: AccountPinConfig;
};

export type AccountPinLoginRequirement = 'none' | 'prompt';

const ACCOUNT_PIN_CONFIGS_KEY = 'starfire-account-pin-configs';
const SCREEN_LOCK_STATE_KEY = 'starfire-screen-lock-state';
const PIN_LOCK_CHANGE_EVENT = 'starfire-pin-lock-change';
const PIN_LOCK_ITERATIONS = 150000;
const PIN_CODE_REGEX = /^\d{4,12}$/;
const ACCOUNT_PIN_POLICY_VERSION = 1;
let recentlyVerifiedAccountKey: string | undefined;

const safeLocalStorage = (): Storage | undefined => {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage;
};

const emitPinLockChange = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PIN_LOCK_CHANGE_EVENT));
};

const readJson = <T>(key: string, fallback: T): T => {
  const storage = safeLocalStorage();
  if (!storage) return fallback;

  const value = storage.getItem(key);
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const writeJson = <T>(key: string, value: T) => {
  const storage = safeLocalStorage();
  if (!storage) return;

  storage.setItem(key, JSON.stringify(value));
  emitPinLockChange();
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const normalizeBaseUrl = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).origin.toLowerCase();
  } catch {
    return baseUrl.trim().toLowerCase();
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const ensurePinCode = (pin: string) => {
  const normalizedPin = pin.trim();
  if (!PIN_CODE_REGEX.test(normalizedPin)) {
    throw new Error('PIN \u7801\u9700\u4e3a 4 \u5230 12 \u4f4d\u6570\u5b57\u3002');
  }
  return normalizedPin;
};

const getAccountPinConfigMap = (): AccountPinConfigMap =>
  readJson<AccountPinConfigMap>(ACCOUNT_PIN_CONFIGS_KEY, {});

const setAccountPinConfigMap = (value: AccountPinConfigMap) => {
  writeJson(ACCOUNT_PIN_CONFIGS_KEY, value);
};

const getScreenLockState = (): ScreenLockState =>
  readJson<ScreenLockState>(SCREEN_LOCK_STATE_KEY, { locked: false });

const setScreenLockState = (value: ScreenLockState) => {
  writeJson(SCREEN_LOCK_STATE_KEY, value);
};

const derivePinHash = async (
  pin: string,
  saltBase64: string,
  iterations: number
): Promise<string> => {
  const normalizedPin = ensurePinCode(pin);
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(normalizedPin),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: fromBase64(saltBase64),
      iterations,
    },
    baseKey,
    256
  );

  return toBase64(new Uint8Array(derivedBits));
};

const createPinConfig = async (pin: string): Promise<AccountPinConfig> => {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const saltBase64 = toBase64(salt);
  const hash = await derivePinHash(pin, saltBase64, PIN_LOCK_ITERATIONS);

  return {
    version: 1,
    salt: saltBase64,
    hash,
    iterations: PIN_LOCK_ITERATIONS,
    updatedAt: Date.now(),
  };
};

const getConfigByAccountKey = (accountKey: string): AccountPinConfig | undefined =>
  getAccountPinConfigMap()[accountKey];

const setConfigByAccountKey = (accountKey: string, config: AccountPinConfig) => {
  const configMap = getAccountPinConfigMap();
  configMap[accountKey] = config;
  setAccountPinConfigMap(configMap);
};

const isSamePinConfig = (left?: AccountPinConfig, right?: AccountPinConfig): boolean => {
  if (!left || !right) return left === right;

  return (
    left.version === right.version &&
    left.salt === right.salt &&
    left.hash === right.hash &&
    left.iterations === right.iterations &&
    left.updatedAt === right.updatedAt
  );
};

export const getAccountPinKey = (baseUrl: string, userId: string): string =>
  `${normalizeBaseUrl(baseUrl)}::${userId.trim().toLowerCase()}`;

export const getAccountPinLabel = (baseUrl: string, userId: string): string =>
  `${userId} @ ${normalizeBaseUrl(baseUrl)}`;

export const getAccountPinConfig = (
  baseUrl: string,
  userId: string
): AccountPinConfig | undefined => getConfigByAccountKey(getAccountPinKey(baseUrl, userId));

export const supportsPinLock = (): boolean =>
  typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';

export const isDesktopPinLockSupported = (): boolean =>
  isDesktopUpdaterSupported() && supportsPinLock();

export const isPinCodeFormatValid = (pin: string): boolean => PIN_CODE_REGEX.test(pin.trim());

const buildAccountPinPolicyUrl = (baseUrl: string, userId: string): string => {
  const origin = normalizeBaseUrl(baseUrl);
  const encodedUserId = encodeURIComponent(userId.trim());
  const encodedType = encodeURIComponent(AccountDataEvent.CinnyAccountPinPolicy);

  return `${origin}/_matrix/client/v3/user/${encodedUserId}/account_data/${encodedType}`;
};

const getAccountPinPolicyState = (
  content?: CinnyAccountPinPolicyContent | unknown
): AccountPinPolicyState => {
  if (!isRecord(content)) {
    return { enabled: false, updatedAt: 0 };
  }

  const updatedAt = isFiniteNumber(content.updatedAt) ? content.updatedAt : 0;
  const config =
    isNonEmptyString(content.salt) &&
    isNonEmptyString(content.hash) &&
    isFiniteNumber(content.iterations) &&
    content.iterations > 0
      ? {
          version: 1,
          salt: content.salt,
          hash: content.hash,
          iterations: content.iterations,
          updatedAt,
        }
      : undefined;

  return {
    enabled: content.enabled === true,
    updatedAt,
    config,
  };
};

export const createAccountPinPolicyContent = (
  policy: AccountPinPolicyState
): CinnyAccountPinPolicyContent => {
  const content: CinnyAccountPinPolicyContent = {
    version: ACCOUNT_PIN_POLICY_VERSION,
    enabled: policy.enabled,
    updatedAt: policy.updatedAt,
  };

  if (policy.enabled && policy.config) {
    content.salt = policy.config.salt;
    content.hash = policy.config.hash;
    content.iterations = policy.config.iterations;
  }

  return content;
};

export const createEnabledAccountPinPolicyContent = (
  config: AccountPinConfig
): CinnyAccountPinPolicyContent =>
  createAccountPinPolicyContent({
    enabled: true,
    updatedAt: config.updatedAt,
    config,
  });

export const createDisabledAccountPinPolicyContent = (
  updatedAt = Date.now()
): CinnyAccountPinPolicyContent =>
  createAccountPinPolicyContent({
    enabled: false,
    updatedAt,
  });

const fetchAccountPinPolicyContent = async (
  baseUrl: string,
  userId: string,
  accessToken: string
): Promise<CinnyAccountPinPolicyContent | undefined> => {
  const response = await fetch(buildAccountPinPolicyUrl(baseUrl, userId), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error('\u65e0\u6cd5\u83b7\u53d6 PIN \u7b56\u7565\u3002');
  }

  return (await response.json()) as CinnyAccountPinPolicyContent;
};

const saveAccountPinPolicyContent = async (
  baseUrl: string,
  userId: string,
  accessToken: string,
  policy: AccountPinPolicyState
) => {
  const response = await fetch(buildAccountPinPolicyUrl(baseUrl, userId), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createAccountPinPolicyContent(policy)),
  });

  if (!response.ok) {
    throw new Error('\u65e0\u6cd5\u4fdd\u5b58 PIN \u7b56\u7565\u3002');
  }
};

export const hasAccountPin = (baseUrl: string, userId: string): boolean =>
  !!getConfigByAccountKey(getAccountPinKey(baseUrl, userId));

export const cacheAccountPinConfig = (
  baseUrl: string,
  userId: string,
  config: AccountPinConfig
) => {
  const accountKey = getAccountPinKey(baseUrl, userId);
  const localConfig = getConfigByAccountKey(accountKey);
  if (isSamePinConfig(localConfig, config)) {
    return;
  }

  setConfigByAccountKey(accountKey, config);
};

export const clearLocalAccountPin = (baseUrl: string, userId: string) => {
  const accountKey = getAccountPinKey(baseUrl, userId);
  const configMap = getAccountPinConfigMap();
  if (!configMap[accountKey]) {
    return;
  }

  delete configMap[accountKey];
  setAccountPinConfigMap(configMap);

  const screenLockState = getScreenLockState();
  if (screenLockState.accountKey === accountKey) {
    clearScreenLock();
  }
};

export const enableAccountPin = async (
  baseUrl: string,
  userId: string,
  pin: string
): Promise<AccountPinConfig> => {
  if (!supportsPinLock()) {
    throw new Error('\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301 Web Crypto\u3002');
  }

  const config = await createPinConfig(pin);
  cacheAccountPinConfig(baseUrl, userId, config);
  return config;
};

export const verifyPinConfig = async (
  pin: string,
  config: AccountPinConfig
): Promise<boolean> => {
  try {
    const hash = await derivePinHash(pin, config.salt, config.iterations);
    return hash === config.hash;
  } catch {
    return false;
  }
};

export const verifyAccountPin = async (
  baseUrl: string,
  userId: string,
  pin: string
): Promise<boolean> => {
  const config = getConfigByAccountKey(getAccountPinKey(baseUrl, userId));
  if (!config) return false;

  return verifyPinConfig(pin, config);
};

export const changeAccountPin = async (
  baseUrl: string,
  userId: string,
  currentPin: string,
  nextPin: string,
  currentConfig?: AccountPinConfig
): Promise<AccountPinConfig> => {
  const verified = currentConfig
    ? await verifyPinConfig(currentPin, currentConfig)
    : await verifyAccountPin(baseUrl, userId, currentPin);
  if (!verified) {
    throw new Error('\u5f53\u524d PIN \u7801\u9519\u8bef\u3002');
  }

  return enableAccountPin(baseUrl, userId, nextPin);
};

export const disableAccountPin = async (
  baseUrl: string,
  userId: string,
  pin: string
): Promise<void> => {
  const verified = await verifyAccountPin(baseUrl, userId, pin);
  if (!verified) {
    throw new Error('\u5f53\u524d PIN \u7801\u9519\u8bef\u3002');
  }

  clearLocalAccountPin(baseUrl, userId);
};

export const isAccountPinPolicyEnabled = (
  content?: CinnyAccountPinPolicyContent | unknown
): boolean => getAccountPinPolicyState(content).enabled;

export const getAccountPinPolicyConfig = (
  content?: CinnyAccountPinPolicyContent | unknown
): AccountPinConfig | undefined => getAccountPinPolicyState(content).config;

export const enableAccountPinPolicy = async (
  baseUrl: string,
  userId: string,
  accessToken: string,
  updatedAt: number,
  config?: AccountPinConfig
) => {
  await saveAccountPinPolicyContent(baseUrl, userId, accessToken, {
    enabled: true,
    updatedAt,
    config,
  });
};

export const disableAccountPinPolicy = async (
  baseUrl: string,
  userId: string,
  accessToken: string
) => {
  await saveAccountPinPolicyContent(baseUrl, userId, accessToken, {
    enabled: false,
    updatedAt: Date.now(),
  });
};

export const applyAccountPinPolicyContent = (
  baseUrl: string,
  userId: string,
  content?: CinnyAccountPinPolicyContent | unknown
): boolean => {
  const localConfig = getConfigByAccountKey(getAccountPinKey(baseUrl, userId));
  const remotePolicy = getAccountPinPolicyState(content);

  if (remotePolicy.enabled && remotePolicy.config) {
    if (!localConfig || remotePolicy.updatedAt >= localConfig.updatedAt) {
      cacheAccountPinConfig(baseUrl, userId, remotePolicy.config);
    }
    return true;
  }

  if (!remotePolicy.enabled && localConfig) {
    clearLocalAccountPin(baseUrl, userId);
  }

  return remotePolicy.enabled;
};

export const syncAccountPinPolicy = async (
  baseUrl: string,
  userId: string,
  accessToken: string
): Promise<boolean> => {
  const localConfig = getConfigByAccountKey(getAccountPinKey(baseUrl, userId));
  const remoteContent = await fetchAccountPinPolicyContent(baseUrl, userId, accessToken);
  const remotePolicy = getAccountPinPolicyState(remoteContent);

  if (!remotePolicy.enabled) {
    if (localConfig) {
      clearLocalAccountPin(baseUrl, userId);
    }
    return false;
  }

  if (remotePolicy.config) {
    if (!localConfig || remotePolicy.updatedAt >= localConfig.updatedAt) {
      cacheAccountPinConfig(baseUrl, userId, remotePolicy.config);
      return true;
    }

    if (!isSamePinConfig(localConfig, remotePolicy.config)) {
      await enableAccountPinPolicy(baseUrl, userId, accessToken, localConfig.updatedAt, localConfig);
    }

    return true;
  }

  if (localConfig) {
    await enableAccountPinPolicy(baseUrl, userId, accessToken, localConfig.updatedAt, localConfig);
  }

  return true;
};

export const resolveAccountPinLoginRequirement = async (
  baseUrl: string,
  userId: string,
  accessToken: string
): Promise<AccountPinLoginRequirement> => {
  if (!isDesktopPinLockSupported()) {
    return 'none';
  }

  const localConfig = getConfigByAccountKey(getAccountPinKey(baseUrl, userId));

  try {
    const remoteContent = await fetchAccountPinPolicyContent(baseUrl, userId, accessToken);
    const remotePolicy = getAccountPinPolicyState(remoteContent);

    if (remotePolicy.enabled) {
      if (remotePolicy.config) {
        cacheAccountPinConfig(baseUrl, userId, remotePolicy.config);
        return 'prompt';
      }

      if (localConfig) {
        await enableAccountPinPolicy(baseUrl, userId, accessToken, localConfig.updatedAt, localConfig);
        return 'prompt';
      }

      return 'none';
    }

    if (localConfig) {
      clearLocalAccountPin(baseUrl, userId);
    }

    return 'none';
  } catch {
    return localConfig ? 'prompt' : 'none';
  }
};

export const markAccountPinVerified = (baseUrl: string, userId: string) => {
  recentlyVerifiedAccountKey = getAccountPinKey(baseUrl, userId);
};

export const consumeRecentAccountPinVerification = (
  baseUrl: string,
  userId: string
): boolean => {
  const accountKey = getAccountPinKey(baseUrl, userId);
  if (recentlyVerifiedAccountKey !== accountKey) {
    return false;
  }

  recentlyVerifiedAccountKey = undefined;
  return true;
};

export const lockScreenForAccount = (baseUrl: string, userId: string) => {
  const accountKey = getAccountPinKey(baseUrl, userId);
  if (!getConfigByAccountKey(accountKey)) return;

  setScreenLockState({
    locked: true,
    accountKey,
  });
};

export const applyDesktopStartupPinLock = (baseUrl?: string, userId?: string) => {
  if (!isDesktopPinLockSupported()) return;
  if (!baseUrl || !userId) return;

  if (hasAccountPin(baseUrl, userId)) {
    lockScreenForAccount(baseUrl, userId);
  }
};

export const clearScreenLock = () => {
  const storage = safeLocalStorage();
  if (!storage) return;

  storage.removeItem(SCREEN_LOCK_STATE_KEY);
  emitPinLockChange();
};

export const isAccountScreenLocked = (baseUrl: string, userId: string): boolean => {
  const accountKey = getAccountPinKey(baseUrl, userId);
  const { locked, accountKey: lockedAccountKey } = getScreenLockState();

  return locked === true && accountKey === lockedAccountKey;
};

export const getPinLockSnapshot = () => {
  const configMap = getAccountPinConfigMap();
  const screenLockState = getScreenLockState();

  return {
    protectedAccountKeys: Object.keys(configMap),
    screenLockState,
  };
};

export const subscribePinLockChange = (listener: () => void): (() => void) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleCustomChange = () => listener();
  const handleStorageChange = (evt: StorageEvent) => {
    if (evt.key === ACCOUNT_PIN_CONFIGS_KEY || evt.key === SCREEN_LOCK_STATE_KEY) {
      listener();
    }
  };

  window.addEventListener(PIN_LOCK_CHANGE_EVENT, handleCustomChange);
  window.addEventListener('storage', handleStorageChange);

  return () => {
    window.removeEventListener(PIN_LOCK_CHANGE_EVENT, handleCustomChange);
    window.removeEventListener('storage', handleStorageChange);
  };
};

export const snapshotPinLockStorage = (): [string, string][] => {
  const storage = safeLocalStorage();
  if (!storage) return [];

  const configs = storage.getItem(ACCOUNT_PIN_CONFIGS_KEY);
  return configs ? [[ACCOUNT_PIN_CONFIGS_KEY, configs]] : [];
};

export const restorePinLockStorage = (entries: [string, string][]) => {
  const storage = safeLocalStorage();
  if (!storage) return;

  entries.forEach(([key, value]) => {
    storage.setItem(key, value);
  });
  emitPinLockChange();
};
