import { Capacitor, registerPlugin } from '@capacitor/core';

const AndroidSecureStorage = registerPlugin('AndroidSecureStorage');

const secretStorageKeys = new Map();
const secureValues = new Map();
const STORAGE_PREFIX = 'cinny_android_secret_storage_keys:';
const isAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const storageKey = () => {
  if (!isAndroid() || typeof localStorage === 'undefined') return undefined;
  const userId = localStorage.getItem('cinny_user_id');
  const deviceId = localStorage.getItem('cinny_device_id');
  return userId && deviceId
    ? `${STORAGE_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(deviceId)}`
    : undefined;
};
const encodeKey = (key) => {
  let binary = '';
  key.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
};
const decodeKey = (value) => {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return undefined;
  }
};
const readPersistedKeys = () => {
  const key = storageKey();
  if (!key) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};
const persistKey = (keyId, privateKey) => {
  const key = storageKey();
  if (!key) return;
  try {
    const keys = readPersistedKeys();
    keys[keyId] = encodeKey(privateKey);
    localStorage.setItem(key, JSON.stringify(keys));
  } catch {
    // Keep the in-memory callback usable when storage is unavailable.
  }
};

const secureStorageKey = () => {
  const userId = localStorage.getItem('cinny_user_id');
  const deviceId = localStorage.getItem('cinny_device_id');
  return userId && deviceId
    ? `${STORAGE_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(deviceId)}`
    : undefined;
};

const loadSecureKeys = async () => {
  if (!isAndroid() || !secureStorageKey()) return;
  try {
    const values = await AndroidSecureStorage.getAll();
    Object.entries(values || {}).forEach(([key, value]) => {
      if (typeof value === 'string') secureValues.set(key, value);
    });
    const encoded = values?.[secureStorageKey()];
    if (!encoded) return;
    const parsed = JSON.parse(encoded);
    Object.entries(parsed).forEach(([keyId, value]) => {
      const decoded = decodeKey(value);
      if (decoded) secretStorageKeys.set(keyId, decoded);
    });
  } catch {
    /* WebView fallback remains available. */
  }
};

const secureValueKey = (name) => {
  const key = secureStorageKey();
  return key ? `${key}:${name}` : undefined;
};

export const setAndroidSecureValue = async (name, value) => {
  if (!isAndroid()) return;
  const key = secureValueKey(name);
  if (!key) return;
  secureValues.set(key, value);
  await AndroidSecureStorage.set({ key, value });
};

export const getAndroidSecureValue = (name) => {
  if (!isAndroid()) return undefined;
  const key = secureValueKey(name);
  return key ? secureValues.get(key) : undefined;
};

export const persistAndroidBackupKey = async (crypto, versionHint) => {
  if (!isAndroid() || !crypto) return;
  try {
    const [key, activeVersion, backupInfo] = await Promise.all([
      crypto.getSessionBackupPrivateKey(),
      typeof versionHint === 'string'
        ? Promise.resolve(versionHint)
        : crypto.getActiveSessionBackupVersion(),
      crypto.getKeyBackupInfo(),
    ]);
    const version = typeof versionHint === 'string' && versionHint ? versionHint : activeVersion;
    if (
      !(key instanceof Uint8Array) ||
      typeof version !== 'string' ||
      !version ||
      !backupInfo?.version ||
      backupInfo.version !== version
    )
      return;
    const trust = await crypto.isKeyBackupTrusted(backupInfo);
    if (trust?.matchesDecryptionKey !== true) return;
    await setAndroidSecureValue(
      'session-backup-private-key',
      JSON.stringify({ key: encodeKey(key), version })
    );
    await setAndroidSecureValue(
      'session-backup-trusted',
      JSON.stringify({ version, trustedAt: Date.now() })
    );
  } catch {
    // Secure storage is best effort and must never block startup.
  }
};

export const restoreAndroidBackupKey = async (crypto) => {
  if (!isAndroid() || !crypto) return;
  const encoded = getAndroidSecureValue('session-backup-private-key');
  if (!encoded) return;
  try {
    const parsed = JSON.parse(encoded);
    const key = decodeKey(parsed?.key);
    if (!(key instanceof Uint8Array) || typeof parsed?.version !== 'string') return;
    // The Rust store can expose a stale active version during cold startup.
    // The secure value is version-scoped already; cache it first and let
    // checkKeyBackupAndEnable compare it with the server's current version.
    // Refusing it here caused the verified device to restart without its
    // otherwise valid decryption key attached.
    await crypto.storeSessionBackupPrivateKey(key, parsed.version);
    // This marker is only written for a key that was previously stored by a
    // successful recovery/verification. It lets the Android UI retain local
    // trust while Rust Crypto performs its asynchronous startup check.
    await setAndroidSecureValue(
      'session-backup-trusted',
      JSON.stringify({ version: parsed.version, trustedAt: Date.now() })
    );
  } catch {
    // Ignore corrupt/stale values and let the normal recovery UI handle it.
  }
};

const persistKeysSecurely = async () => {
  if (!isAndroid()) return;
  const key = secureStorageKey();
  if (!key) return;
  try {
    const encoded = {};
    secretStorageKeys.forEach((value, keyId) => {
      encoded[keyId] = encodeKey(value);
    });
    await AndroidSecureStorage.set({ key, value: JSON.stringify(encoded) });
  } catch {
    /* localStorage fallback remains available. */
  }
};

export function storePrivateKey(keyId, privateKey) {
  if (privateKey instanceof Uint8Array === false) {
    throw new Error('Unable to store, privateKey is invalid.');
  }
  secretStorageKeys.set(keyId, privateKey);
  persistKey(keyId, privateKey);
  void persistKeysSecurely();
}

function hasPrivateKey(keyId) {
  return getPrivateKey(keyId) instanceof Uint8Array;
}

function getPrivateKey(keyId) {
  const memoryKey = secretStorageKeys.get(keyId);
  if (memoryKey instanceof Uint8Array) return memoryKey;
  if (isAndroid()) {
    const persisted = decodeKey(readPersistedKeys()[keyId]);
    if (persisted) {
      secretStorageKeys.set(keyId, persisted);
      return persisted;
    }
  }
  return undefined;
}

export function clearSecretStorageKeys() {
  secretStorageKeys.clear();
  const key = storageKey();
  if (key && isAndroid()) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    void Promise.all([
      AndroidSecureStorage.remove({ key }),
      AndroidSecureStorage.remove({ key: secureValueKey('verified-device') }),
      AndroidSecureStorage.remove({ key: secureValueKey('session-backup-private-key') }),
      AndroidSecureStorage.remove({ key: secureValueKey('session-backup-trusted') }),
    ]).catch(() => undefined);
  }
}

async function getSecretStorageKey({ keys }) {
  const keyIds = Object.keys(keys);
  const keyId = keyIds.find(hasPrivateKey);
  if (!keyId) return undefined;
  const privateKey = getPrivateKey(keyId);
  return [keyId, privateKey];
}

function cacheSecretStorageKey(keyId, keyInfo, privateKey) {
  secretStorageKeys.set(keyId, privateKey);
  persistKey(keyId, privateKey);
  void persistKeysSecurely();
}

export const hydrateSecretStorageKeys = loadSecureKeys;

export const cryptoCallbacks = {
  getSecretStorageKey,
  cacheSecretStorageKey,
};
