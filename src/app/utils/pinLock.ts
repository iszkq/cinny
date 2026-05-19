import { AccountDataEvent, CinnyAccountPinPolicyContent } from '../../types/matrix/accountData';

type AccountPinConfig = {
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
};

export type AccountPinLoginRequirement = 'none' | 'prompt' | 'setup';

const ACCOUNT_PIN_CONFIGS_KEY = 'starfire-account-pin-configs';
const SCREEN_LOCK_STATE_KEY = 'starfire-screen-lock-state';
const PIN_LOCK_CHANGE_EVENT = 'starfire-pin-lock-change';
const PIN_LOCK_ITERATIONS = 150000;
const PIN_CODE_REGEX = /^\d{4,12}$/;
const ACCOUNT_PIN_POLICY_VERSION = 1;

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

const ensurePinCode = (pin: string) => {
  const normalizedPin = pin.trim();
  if (!PIN_CODE_REGEX.test(normalizedPin)) {
    throw new Error('PIN must be 4-12 digits.');
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

export const getAccountPinKey = (baseUrl: string, userId: string): string =>
  `${normalizeBaseUrl(baseUrl)}::${userId.trim().toLowerCase()}`;

export const getAccountPinLabel = (baseUrl: string, userId: string): string =>
  `${userId} @ ${normalizeBaseUrl(baseUrl)}`;

export const supportsPinLock = (): boolean =>
  typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';

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

  return {
    enabled: content.enabled === true,
    updatedAt: isFiniteNumber(content.updatedAt) ? content.updatedAt : 0,
  };
};

const createAccountPinPolicyContent = (
  policy: AccountPinPolicyState
): CinnyAccountPinPolicyContent => ({
  version: ACCOUNT_PIN_POLICY_VERSION,
  enabled: policy.enabled,
  updatedAt: policy.updatedAt,
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
    throw new Error('Unable to fetch PIN policy.');
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
    throw new Error('Unable to save PIN policy.');
  }
};

export const hasAccountPin = (baseUrl: string, userId: string): boolean =>
  !!getConfigByAccountKey(getAccountPinKey(baseUrl, userId));

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
): Promise<void> => {
  if (!supportsPinLock()) {
    throw new Error('Current environment does not support Web Crypto.');
  }

  const config = await createPinConfig(pin);
  const configMap = getAccountPinConfigMap();
  configMap[getAccountPinKey(baseUrl, userId)] = config;
  setAccountPinConfigMap(configMap);
};

export const verifyAccountPin = async (
  baseUrl: string,
  userId: string,
  pin: string
): Promise<boolean> => {
  const config = getConfigByAccountKey(getAccountPinKey(baseUrl, userId));
  if (!config) return false;

  try {
    const hash = await derivePinHash(pin, config.salt, config.iterations);
    return hash === config.hash;
  } catch {
    return false;
  }
};

export const changeAccountPin = async (
  baseUrl: string,
  userId: string,
  currentPin: string,
  nextPin: string
): Promise<void> => {
  const verified = await verifyAccountPin(baseUrl, userId, currentPin);
  if (!verified) {
    throw new Error('Current PIN is incorrect.');
  }

  await enableAccountPin(baseUrl, userId, nextPin);
};

export const disableAccountPin = async (
  baseUrl: string,
  userId: string,
  pin: string
): Promise<void> => {
  const verified = await verifyAccountPin(baseUrl, userId, pin);
  if (!verified) {
    throw new Error('Current PIN is incorrect.');
  }

  clearLocalAccountPin(baseUrl, userId);
};

export const isAccountPinPolicyEnabled = (
  content?: CinnyAccountPinPolicyContent | unknown
): boolean => getAccountPinPolicyState(content).enabled;

export const enableAccountPinPolicy = async (
  baseUrl: string,
  userId: string,
  accessToken: string,
  updatedAt: number
) => {
  await saveAccountPinPolicyContent(baseUrl, userId, accessToken, {
    enabled: true,
    updatedAt,
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

  if (!remotePolicy.enabled && localConfig && remotePolicy.updatedAt > localConfig.updatedAt) {
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

  if (!localConfig) {
    return remotePolicy.enabled;
  }

  if (!remotePolicy.enabled) {
    if (remotePolicy.updatedAt > localConfig.updatedAt) {
      clearLocalAccountPin(baseUrl, userId);
      return false;
    }

    await enableAccountPinPolicy(baseUrl, userId, accessToken, localConfig.updatedAt);
    return true;
  }

  return true;
};

export const resolveAccountPinLoginRequirement = async (
  baseUrl: string,
  userId: string,
  accessToken: string
): Promise<AccountPinLoginRequirement> => {
  const localConfig = getConfigByAccountKey(getAccountPinKey(baseUrl, userId));

  try {
    const remoteContent = await fetchAccountPinPolicyContent(baseUrl, userId, accessToken);
    const remotePolicy = getAccountPinPolicyState(remoteContent);

    if (remotePolicy.enabled) {
      return localConfig ? 'prompt' : 'setup';
    }

    if (localConfig) {
      if (remotePolicy.updatedAt > localConfig.updatedAt) {
        clearLocalAccountPin(baseUrl, userId);
        return 'none';
      }

      await enableAccountPinPolicy(baseUrl, userId, accessToken, localConfig.updatedAt);
      return 'prompt';
    }

    return 'none';
  } catch {
    return localConfig ? 'prompt' : 'none';
  }
};

export const lockScreenForAccount = (baseUrl: string, userId: string) => {
  const accountKey = getAccountPinKey(baseUrl, userId);
  if (!getConfigByAccountKey(accountKey)) return;

  setScreenLockState({
    locked: true,
    accountKey,
  });
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
