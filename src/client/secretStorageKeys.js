import { Capacitor, registerPlugin } from '@capacitor/core';

const AndroidSecureStorage = registerPlugin('AndroidSecureStorage');

const secretStorageKeys = new Map();
const secureValues = new Map();
const STORAGE_PREFIX = 'cinny_android_secret_storage_keys:';
const ACTIVE_SESSION_KEY = 'cinny_android_active_session_v1';
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

const localTrustedBackupKey = () => {
  const userId = localStorage.getItem('cinny_user_id');
  const deviceId = localStorage.getItem('cinny_device_id');
  return userId && deviceId
    ? `cinny_android_backup_trusted:${encodeURIComponent(userId)}:${encodeURIComponent(deviceId)}`
    : undefined;
};

const loadSecureKeys = async () => {
  if (!isAndroid()) return;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const values = await AndroidSecureStorage.getAll();
      Object.entries(values || {}).forEach(([key, value]) => {
        if (typeof value === 'string') secureValues.set(key, value);
      });
      const scopedStorageKey = secureStorageKey();
      const encoded = scopedStorageKey ? values?.[scopedStorageKey] : undefined;
      if (encoded) {
        const parsed = JSON.parse(encoded);
        Object.entries(parsed).forEach(([keyId, value]) => {
          const decoded = decodeKey(value);
          if (decoded) secretStorageKeys.set(keyId, decoded);
        });
      }
      return;
    } catch {
      // Android Keystore can be temporarily unavailable while the WebView
      // process is recreated. Retry before crypto observes an empty map.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
};

const isValidAndroidSession = (session) =>
  session &&
  typeof session.baseUrl === 'string' &&
  typeof session.userId === 'string' &&
  typeof session.deviceId === 'string' &&
  typeof session.accessToken === 'string' &&
  session.baseUrl.length > 0 &&
  session.userId.length > 0 &&
  session.deviceId.length > 0 &&
  session.accessToken.length > 0;

/**
 * Keep the active Android Matrix session outside WebView storage. Android can
 * recreate the renderer process independently of the app, while encrypted
 * SharedPreferences in the native app data directory survive until explicit
 * removal or uninstall.
 */
export const persistAndroidSession = async (session) => {
  if (!isAndroid() || !isValidAndroidSession(session)) return;
  const value = JSON.stringify(session);
  secureValues.set(ACTIVE_SESSION_KEY, value);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await AndroidSecureStorage.set({ key: ACTIVE_SESSION_KEY, value });
      return;
    } catch {
      // Keystore access can briefly fail immediately after process recreation.
      // Keep retrying while localStorage remains the live in-process copy.
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
};

export const removeAndroidPersistedSession = async () => {
  if (!isAndroid()) return;
  secureValues.delete(ACTIVE_SESSION_KEY);
  await AndroidSecureStorage.remove({ key: ACTIVE_SESSION_KEY }).catch(() => undefined);
};

export const hydrateAndroidSession = async () => {
  if (!isAndroid()) return;
  await loadSecureKeys();
  const webViewSession = {
    accessToken: localStorage.getItem('cinny_access_token'),
    deviceId: localStorage.getItem('cinny_device_id'),
    userId: localStorage.getItem('cinny_user_id'),
    baseUrl: localStorage.getItem('cinny_hs_base_url'),
    expiresInMs: Number(localStorage.getItem('cinny_expires_in_ms')) || undefined,
    refreshToken: localStorage.getItem('cinny_refresh_token') || undefined,
  };
  const encoded = secureValues.get(ACTIVE_SESSION_KEY);
  if (typeof encoded === 'string') {
    try {
      const session = JSON.parse(encoded);
      if (!isValidAndroidSession(session)) return;
      // The native encrypted session is the Android source of truth. It is
      // written before navigation/login completes and also after every token
      // refresh, so a stale WebView value must never overwrite it after a
      // renderer/process restart.
      localStorage.setItem('cinny_access_token', session.accessToken);
      localStorage.setItem('cinny_device_id', session.deviceId);
      localStorage.setItem('cinny_user_id', session.userId);
      localStorage.setItem('cinny_hs_base_url', session.baseUrl);
      if (typeof session.expiresInMs === 'number') {
        localStorage.setItem('cinny_expires_in_ms', String(session.expiresInMs));
      } else {
        localStorage.removeItem('cinny_expires_in_ms');
      }
      if (typeof session.refreshToken === 'string' && session.refreshToken.length > 0) {
        localStorage.setItem('cinny_refresh_token', session.refreshToken);
      } else {
        localStorage.removeItem('cinny_refresh_token');
      }
      return;
    } catch {
      // Fall through to the one-time WebView migration below.
    }
  }
  if (isValidAndroidSession(webViewSession)) {
    // One-time migration for users upgrading from builds that only kept the
    // session in WebView storage.
    await persistAndroidSession(webViewSession);
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
  if (name === 'session-backup-trusted') {
    const localKey = localTrustedBackupKey();
    if (localKey) localStorage.setItem(localKey, value);
  }
  await AndroidSecureStorage.set({ key, value });
};

export const getAndroidSecureValue = (name) => {
  if (!isAndroid()) return undefined;
  const key = secureValueKey(name);
  if (!key) return undefined;
  const secureValue = secureValues.get(key);
  if (secureValue !== undefined) return secureValue;
  if (name === 'session-backup-trusted') {
    const localKey = localTrustedBackupKey();
    return localKey ? localStorage.getItem(localKey) ?? undefined : undefined;
  }
  return undefined;
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
    // A normal cold start reopens the same Rust Crypto store, which already
    // contains this backup key. Re-storing it emits KeyBackupDecryptionKeyCached
    // and causes the UI to download/decrypt the whole backup again. Native
    // clients only import the durable copy when the local crypto store lacks it.
    const [existingKey, existingVersion] = await Promise.all([
      crypto.getSessionBackupPrivateKey(),
      crypto.getActiveSessionBackupVersion(),
    ]);
    if (existingKey instanceof Uint8Array && existingVersion === parsed.version) return;
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

export const persistAndroidSecretsBundle = async (crypto) => {
  if (!isAndroid() || typeof crypto?.exportSecretsBundle !== 'function') return false;
  try {
    const bundle = await crypto.exportSecretsBundle();
    if (!bundle || typeof bundle !== 'object') return false;
    await setAndroidSecureValue('crypto-secrets-bundle', JSON.stringify(bundle));
    return true;
  } catch {
    // Cross-signing secrets can arrive shortly after interactive verification.
    // The caller retries rather than persisting an incomplete bundle.
    return false;
  }
};

export const restoreAndroidSecretsBundle = async (crypto) => {
  if (!isAndroid() || typeof crypto?.importSecretsBundle !== 'function') return false;
  const encoded = getAndroidSecureValue('crypto-secrets-bundle');
  if (!encoded) return false;
  try {
    const bundle = JSON.parse(encoded);
    if (!bundle || typeof bundle !== 'object') return false;
    await crypto.importSecretsBundle(bundle);
    return true;
  } catch {
    // Public cross-signing data may not be available until the first network
    // sync. The startup recovery task retries on the next healthy sync state.
    return false;
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

export async function clearSecretStorageKeys() {
  secretStorageKeys.clear();
  const key = storageKey();
  if (key && isAndroid()) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    const scopedKeys = [
      key,
      secureValueKey('verified-device'),
      secureValueKey('session-backup-private-key'),
      secureValueKey('session-backup-trusted'),
      secureValueKey('crypto-secrets-bundle'),
    ].filter(Boolean);
    scopedKeys.forEach((scopedKey) => secureValues.delete(scopedKey));
    await Promise.all(
      scopedKeys.map((scopedKey) => AndroidSecureStorage.remove({ key: scopedKey }))
    ).catch(() => undefined);
    const localKey = localTrustedBackupKey();
    if (localKey) localStorage.removeItem(localKey);
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
