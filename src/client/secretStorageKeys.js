import { Capacitor } from '@capacitor/core';

const secretStorageKeys = new Map();
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
  key.forEach((value) => { binary += String.fromCharCode(value); });
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

export function storePrivateKey(keyId, privateKey) {
  if (privateKey instanceof Uint8Array === false) {
    throw new Error('Unable to store, privateKey is invalid.');
  }
  secretStorageKeys.set(keyId, privateKey);
  persistKey(keyId, privateKey);
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
    try { localStorage.removeItem(key); } catch { /* ignore */ }
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
}

export const cryptoCallbacks = {
  getSecretStorageKey,
  cacheSecretStorageKey,
};
