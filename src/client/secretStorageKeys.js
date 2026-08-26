import { Capacitor, registerPlugin } from '@capacitor/core';

const AndroidSecureStorage = registerPlugin('AndroidSecureStorage');

const secretStorageKeys = new Map();
const secureValues = new Map();
const STORAGE_PREFIX = 'cinny_android_secret_storage_keys:';
const ACTIVE_SESSION_KEY = 'cinny_android_active_session_v1';
const NATIVE_STORAGE_RETRY_COUNT = 20;
const NATIVE_STORAGE_RETRY_DELAY_MS = 250;
// The APK is compiled with VITE_ANDROID_APP=true. After Android kills the
// renderer process, Capacitor's runtime probe can briefly report `web` while
// the bridge reconnects. Using that transient value as a storage gate skips
// the native Keystore read and makes the login, cross-signing secrets and
// backup key all appear lost. An APK build must always use Android storage;
// the runtime probe remains only as a development fallback.
const isAndroidBuild = import.meta.env.VITE_ANDROID_APP === 'true';
const isAndroid = () =>
  isAndroidBuild || (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android');
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

const hydrateScopedSecretStorageKeys = () => {
  const scopedStorageKey = secureStorageKey();
  const encoded = scopedStorageKey ? secureValues.get(scopedStorageKey) : undefined;
  if (typeof encoded !== 'string') return;
  try {
    const parsed = JSON.parse(encoded);
    Object.entries(parsed).forEach(([keyId, value]) => {
      const decoded = decodeKey(value);
      if (decoded) secretStorageKeys.set(keyId, decoded);
    });
  } catch {
    // Keep the native value intact. A later startup can retry parsing it.
  }
};

const loadSecureKeys = async () => {
  if (!isAndroid()) return false;
  for (let attempt = 0; attempt < NATIVE_STORAGE_RETRY_COUNT; attempt += 1) {
    try {
      const values = await AndroidSecureStorage.getAll();
      Object.entries(values || {}).forEach(([key, value]) => {
        if (typeof value === 'string') secureValues.set(key, value);
      });
      // This works immediately when WebView storage still has the identity.
      // hydrateAndroidSession repeats it after restoring a missing identity
      // from the native session record.
      hydrateScopedSecretStorageKeys();
      return true;
    } catch {
      // Android Keystore can be temporarily unavailable while the WebView
      // process is recreated. Retry before crypto observes an empty map.
      if (attempt < NATIVE_STORAGE_RETRY_COUNT - 1) {
        await new Promise((resolve) => setTimeout(resolve, NATIVE_STORAGE_RETRY_DELAY_MS));
      }
    }
  }
  return false;
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
  if (!isAndroid() || !isValidAndroidSession(session)) return false;
  const value = JSON.stringify(session);
  for (let attempt = 0; attempt < NATIVE_STORAGE_RETRY_COUNT; attempt += 1) {
    try {
      await AndroidSecureStorage.set({ key: ACTIVE_SESSION_KEY, value });
      // In-memory state represents only data confirmed committed by the
      // native plugin. Otherwise a failed write looks durable until process
      // death and then silently disappears.
      secureValues.set(ACTIVE_SESSION_KEY, value);
      return true;
    } catch {
      // Keystore access can briefly fail immediately after process recreation.
      // Keep retrying while localStorage remains the live in-process copy.
      if (attempt < NATIVE_STORAGE_RETRY_COUNT - 1) {
        await new Promise((resolve) => setTimeout(resolve, NATIVE_STORAGE_RETRY_DELAY_MS));
      }
    }
  }
  return false;
};

export const removeAndroidPersistedSession = async () => {
  if (!isAndroid()) return;
  secureValues.delete(ACTIVE_SESSION_KEY);
  await AndroidSecureStorage.remove({ key: ACTIVE_SESSION_KEY }).catch(() => undefined);
};

export const hydrateAndroidSession = async () => {
  if (!isAndroid()) return;
  const nativeStorageLoaded = await loadSecureKeys();
  if (!nativeStorageLoaded) {
    // Never treat a temporarily unavailable Android bridge as an empty secure
    // store and migrate stale WebView data over the native source of truth.
    return;
  }
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
      hydrateScopedSecretStorageKeys();
      return;
    } catch {
      // Fall through to the one-time WebView migration below.
    }
  }
  if (isValidAndroidSession(webViewSession)) {
    // One-time migration for users upgrading from builds that only kept the
    // session in WebView storage.
    await persistAndroidSession(webViewSession);
    hydrateScopedSecretStorageKeys();
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
  for (let attempt = 0; attempt < NATIVE_STORAGE_RETRY_COUNT; attempt += 1) {
    try {
      await AndroidSecureStorage.set({ key, value });
      secureValues.set(key, value);
      if (name === 'session-backup-trusted') {
        const localKey = localTrustedBackupKey();
        if (localKey) localStorage.setItem(localKey, value);
      }
      return;
    } catch (error) {
      if (attempt === NATIVE_STORAGE_RETRY_COUNT - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, NATIVE_STORAGE_RETRY_DELAY_MS));
    }
  }
};

export const getAndroidSecureValue = (name) => {
  if (!isAndroid()) return undefined;
  const key = secureValueKey(name);
  if (!key) return undefined;
  const secureValue = secureValues.get(key);
  if (secureValue !== undefined) return secureValue;
  return undefined;
};

export const hasAndroidSecretStorageKey = () =>
  isAndroid() && Array.from(secretStorageKeys.values()).some((key) => key instanceof Uint8Array);

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
  const encoded = {};
  secretStorageKeys.forEach((value, keyId) => {
    encoded[keyId] = encodeKey(value);
  });
  const value = JSON.stringify(encoded);
  for (let attempt = 0; attempt < NATIVE_STORAGE_RETRY_COUNT; attempt += 1) {
    try {
      await AndroidSecureStorage.set({ key, value });
      secureValues.set(key, value);
      return;
    } catch {
      if (attempt < NATIVE_STORAGE_RETRY_COUNT - 1) {
        await new Promise((resolve) => setTimeout(resolve, NATIVE_STORAGE_RETRY_DELAY_MS));
      }
    }
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
