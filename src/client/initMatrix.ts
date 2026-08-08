import { createClient, MatrixClient, IndexedDBStore, IndexedDBCryptoStore } from 'matrix-js-sdk';
import { logger as matrixLogger } from 'matrix-js-sdk/lib/logger';

import { cryptoCallbacks } from './secretStorageKeys';
import { clearNavToActivePathStore } from '../app/state/navToActivePath';
import { SETTINGS_STORAGE_KEY } from '../app/state/settingsStorage';
import { restorePinLockStorage, snapshotPinLockStorage } from '../app/utils/pinLock';
import { clearDesktopMediaCache } from '../app/utils/desktopMediaAssetCache';
import { isDesktopUpdaterSupported } from '../app/utils/desktopUpdater';
import { pushSessionToSW } from '../sw-session';
import { removeFallbackSession } from '../app/state/sessions';

type Session = {
  baseUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
};

const MALFORMED_ENCRYPTED_EVENT_WARNING = 'missing field `algorithm`';
const LEGACY_RUST_CRYPTO_DATABASE_PREFIX = 'matrix-js-sdk';

const getRustCryptoDatabaseNames = (prefix: string): string[] => [
  `${prefix}::matrix-sdk-crypto`,
  `${prefix}::matrix-sdk-crypto-meta`,
];

/**
 * Rust Crypto stores the local Olm machine (including the device identity),
 * so the IndexedDB prefix must be unique per Matrix account and device. The
 * SDK default is a single `matrix-js-sdk` database, which causes Android
 * WebViews to reopen a previous device's store after a re-login and fail with
 * an "account in the store doesn't match" error.
 */
const getRustCryptoDatabasePrefix = (session: Session): string =>
  `cinny-rust-crypto-${encodeURIComponent(session.userId)}-${encodeURIComponent(session.deviceId)}`;

const indexedDbDatabaseExists = (databaseName: string): Promise<boolean> =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (exists: boolean) => {
      if (settled) return;
      settled = true;
      resolve(exists);
    };
    const request = global.indexedDB.open(databaseName);

    request.onupgradeneeded = () => {
      // Opening a missing database would create it. Abort that transaction so
      // this compatibility probe remains read-only.
      request.transaction?.abort();
      finish(false);
    };
    request.onsuccess = () => {
      request.result.close();
      finish(true);
    };
    request.onerror = () => finish(false);
    request.onblocked = () => finish(false);
  });

const hasRustCryptoDatabase = async (prefix: string): Promise<boolean> => {
  try {
    const expectedNames = getRustCryptoDatabaseNames(prefix);
    if (typeof global.indexedDB?.databases === 'function') {
      const databases = await global.indexedDB.databases();
      const existingNames = new Set(databases.map(({ name }) => name));
      return expectedNames.some((name) => existingNames.has(name));
    }

    return indexedDbDatabaseExists(expectedNames[0]);
  } catch {
    return false;
  }
};

const isRustCryptoAccountMismatch = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes('account in the store') &&
    normalizedMessage.includes('match the account')
  );
};

const initRustCryptoForSession = async (mx: MatrixClient, session: Session): Promise<void> => {
  const scopedPrefix = getRustCryptoDatabasePrefix(session);

  // Releases before v1.8.12 used the SDK default database. Prefer it when it
  // exists so an upgrade keeps the device identity, verification trust and
  // message keys that are already stored locally. If it belongs to a previous
  // login/device, the SDK reports an account mismatch and we safely fall back
  // to the account-and-device-scoped database.
  if (await hasRustCryptoDatabase(LEGACY_RUST_CRYPTO_DATABASE_PREFIX)) {
    try {
      await mx.initRustCrypto({
        cryptoDatabasePrefix: LEGACY_RUST_CRYPTO_DATABASE_PREFIX,
      });
      return;
    } catch (error) {
      if (!isRustCryptoAccountMismatch(error)) throw error;
    }
  }

  await mx.initRustCrypto({
    cryptoDatabasePrefix: scopedPrefix,
  });
};

let webMatrixLoggerFilterInstalled = false;

const isIgnorableWebMatrixWarning = (messages: unknown[]): boolean => {
  const text = messages.map((message) => (typeof message === 'string' ? message : '')).join(' ');
  return (
    text.includes('Error decrypting event') && text.includes(MALFORMED_ENCRYPTED_EVENT_WARNING)
  );
};

const installWebMatrixLoggerFilter = () => {
  if (webMatrixLoggerFilterInstalled || isDesktopUpdaterSupported()) return;

  webMatrixLoggerFilterInstalled = true;

  const originalWarn = matrixLogger.warn.bind(matrixLogger);
  matrixLogger.warn = (...messages: unknown[]) => {
    if (isIgnorableWebMatrixWarning(messages)) return;
    originalWarn(...messages);
  };
};

export const initClient = async (session: Session): Promise<MatrixClient> => {
  installWebMatrixLoggerFilter();

  const indexedDBStore = new IndexedDBStore({
    indexedDB: global.indexedDB,
    localStorage: global.localStorage,
    dbName: 'web-sync-store',
  });

  const legacyCryptoStore = new IndexedDBCryptoStore(global.indexedDB, 'crypto-store');

  const mx = createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    userId: session.userId,
    store: indexedDBStore,
    cryptoStore: legacyCryptoStore,
    deviceId: session.deviceId,
    timelineSupport: true,
    cryptoCallbacks: cryptoCallbacks as any,
    verificationMethods: ['m.sas.v1'],
  });

  await indexedDBStore.startup();
  await initRustCryptoForSession(mx, session);

  mx.setMaxListeners(200);

  return mx;
};

// Match the SDK's safe default: enough recent events to paint the room and a
// reliable backward-pagination token, while older history keeps loading on
// demand instead of blocking the whole account's first sync.
const WEB_INITIAL_SYNC_LIMIT = 8;

export const startClient = async (mx: MatrixClient) => {
  await mx.startClient({
    lazyLoadMembers: true,
    disablePresence: true,
    ...(!isDesktopUpdaterSupported() ? { initialSyncLimit: WEB_INITIAL_SYNC_LIMIT } : {}),
  });
};

export const persistClientStore = (mx: MatrixClient): Promise<void> =>
  mx.store.save(true).catch(() => undefined);

const clearAllServiceWorkerCaches = async () => {
  if (typeof window === 'undefined' || typeof window.caches === 'undefined') {
    return;
  }

  const cacheKeys = await window.caches.keys();
  await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
};

const clearAllServiceWorkerRegistrations = async () => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  await Promise.all(
    registrations.map((registration) => registration.unregister().catch(() => false))
  );
};

const clearAllIndexedDbDatabases = async () => {
  if (typeof window === 'undefined' || typeof window.indexedDB?.databases !== 'function') {
    return;
  }

  const dbs = await window.indexedDB.databases();

  await Promise.all(
    dbs.map(async (idbInfo) => {
      const { name } = idbInfo;
      if (!name) return;

      await new Promise<void>((resolve) => {
        const request = window.indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    })
  );
};

export const clearResourceCaches = async () => {
  await clearDesktopMediaCache();
  await clearAllServiceWorkerCaches();
};

const snapshotLocalStorageEntries = (keys: string[]): [string, string][] =>
  keys
    .map((key): [string, string] | undefined => {
      const value = window.localStorage.getItem(key);
      return value === null ? undefined : [key, value];
    })
    .filter((entry): entry is [string, string] => !!entry);

const restoreLocalStorageEntries = (entries: [string, string][]) => {
  entries.forEach(([key, value]) => {
    window.localStorage.setItem(key, value);
  });
};

export const clearAllLocalData = async (mx?: MatrixClient) => {
  pushSessionToSW();
  mx?.stopClient();

  try {
    await mx?.clearStores();
  } catch {
    // Ignore cleanup failures so the rest of local data can still be cleared.
  }

  await clearAllServiceWorkerCaches();
  await clearAllServiceWorkerRegistrations();
  await clearDesktopMediaCache();
  await clearAllIndexedDbDatabases();
  window.localStorage.clear();
  window.sessionStorage.clear();
};

export const clearCacheAndReload = async (mx: MatrixClient) => {
  mx.stopClient();
  clearNavToActivePathStore(mx.getSafeUserId());
  await mx.store.deleteAllData();
  await clearResourceCaches();
  window.location.reload();
};

export const clearLocalSessionAfterLogout = async (mx?: MatrixClient) => {
  pushSessionToSW();
  mx?.stopClient();
  try {
    await mx?.clearStores();
  } catch {
    // ignore cleanup failures so logout can still continue.
  }

  const preservedSettingsEntries = snapshotLocalStorageEntries([SETTINGS_STORAGE_KEY]);
  const preservedPinLockEntries = snapshotPinLockStorage();
  await clearDesktopMediaCache();
  window.localStorage.clear();
  restoreLocalStorageEntries(preservedSettingsEntries);
  restorePinLockStorage(preservedPinLockEntries);
};

/**
 * The homeserver can invalidate an access token without the user choosing to
 * sign out. Keep the crypto store in that case: it contains the device's local
 * encryption keys and is required to decrypt messages after signing in again.
 * The regular sync store is still cleared so a later sign-in cannot show data
 * from the expired account.
 * Explicit sign-out and "clear local data" still use the destructive cleanup
 * above.
 */
export const clearExpiredSessionAfterLogout = async (mx?: MatrixClient) => {
  pushSessionToSW();
  mx?.stopClient();
  try {
    await mx?.store.deleteAllData();
  } catch {
    // A failed sync-store cleanup must not prevent returning to sign-in.
  }
  removeFallbackSession();
  await clearDesktopMediaCache();
};

export const logoutClient = async (mx: MatrixClient) => {
  pushSessionToSW();
  mx.stopClient();
  try {
    await mx.logout();
  } catch {
    // ignore if failed to logout
  }
  await clearLocalSessionAfterLogout(mx);
  window.location.reload();
};

export const clearLoginData = async () => {
  await clearAllLocalData();
  window.location.reload();
};
