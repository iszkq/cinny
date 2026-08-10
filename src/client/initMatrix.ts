import { createClient, MatrixClient, IndexedDBStore, IndexedDBCryptoStore } from 'matrix-js-sdk';
import { logger as matrixLogger } from 'matrix-js-sdk/lib/logger';

import { cryptoCallbacks } from './secretStorageKeys';
import { clearNavToActivePathStore } from '../app/state/navToActivePath';
import { SETTINGS_STORAGE_KEY } from '../app/state/settingsStorage';
import { restorePinLockStorage, snapshotPinLockStorage } from '../app/utils/pinLock';
import { clearDesktopMediaCache } from '../app/utils/desktopMediaAssetCache';
import { isDesktopUpdaterSupported } from '../app/utils/desktopUpdater';
import { pushSessionToSW } from '../sw-session';
import { removeFallbackAccessToken } from '../app/state/sessions';

type Session = {
  baseUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
};

const MALFORMED_ENCRYPTED_EVENT_WARNING = 'missing field `algorithm`';
const LEGACY_RUST_CRYPTO_DATABASE_PREFIX = 'matrix-js-sdk';
const RUST_CRYPTO_DATABASE_SELECTION_KEY_PREFIX = 'cinny_rust_crypto_database';
const rustCryptoDatabasePrefixes = new WeakMap<MatrixClient, string>();

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

const getRustCryptoDatabaseSelectionKey = (session: Session): string =>
  `${RUST_CRYPTO_DATABASE_SELECTION_KEY_PREFIX}:${encodeURIComponent(
    session.userId
  )}:${encodeURIComponent(session.deviceId)}`;

const getSavedRustCryptoDatabasePrefix = (session: Session): string | undefined => {
  try {
    const prefix = global.localStorage.getItem(getRustCryptoDatabaseSelectionKey(session));
    const scopedPrefix = getRustCryptoDatabasePrefix(session);
    return prefix === LEGACY_RUST_CRYPTO_DATABASE_PREFIX || prefix === scopedPrefix
      ? prefix
      : undefined;
  } catch {
    return undefined;
  }
};

const saveRustCryptoDatabasePrefix = (session: Session, prefix: string) => {
  try {
    global.localStorage.setItem(getRustCryptoDatabaseSelectionKey(session), prefix);
  } catch {
    // IndexedDB remains usable when localStorage is unavailable; only the
    // compatibility selection marker is skipped in that environment.
  }
};

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

const findExistingRustCryptoDatabasePrefixes = async (prefixes: string[]): Promise<Set<string>> => {
  try {
    if (typeof global.indexedDB?.databases === 'function') {
      const databases = await global.indexedDB.databases();
      const existingNames = new Set(databases.map(({ name }) => name));
      return new Set(
        prefixes.filter((prefix) =>
          getRustCryptoDatabaseNames(prefix).some((name) => existingNames.has(name))
        )
      );
    }

    const results = await Promise.all(
      prefixes.map(
        async (prefix) =>
          [prefix, await indexedDbDatabaseExists(getRustCryptoDatabaseNames(prefix)[0])] as const
      )
    );
    return new Set(results.filter(([, exists]) => exists).map(([prefix]) => prefix));
  } catch {
    return new Set();
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

const initRustCryptoForSession = async (mx: MatrixClient, session: Session): Promise<string> => {
  const scopedPrefix = getRustCryptoDatabasePrefix(session);
  const savedPrefix = getSavedRustCryptoDatabasePrefix(session);
  // Enumerate IndexedDB only once. Some WebViews make this surprisingly
  // expensive, and the old implementation performed the same full scan twice
  // on every launch before Rust Crypto could even start.
  const existingPrefixes = await findExistingRustCryptoDatabasePrefixes([
    LEGACY_RUST_CRYPTO_DATABASE_PREFIX,
    scopedPrefix,
  ]);
  const legacyExists = existingPrefixes.has(LEGACY_RUST_CRYPTO_DATABASE_PREFIX);
  const scopedExists = existingPrefixes.has(scopedPrefix);
  const candidates: string[] = [];
  const addCandidate = (prefix: string) => {
    if (!candidates.includes(prefix)) candidates.push(prefix);
  };

  if (savedPrefix) {
    const savedDatabaseExists =
      savedPrefix === LEGACY_RUST_CRYPTO_DATABASE_PREFIX ? legacyExists : scopedExists;
    const anotherDatabaseExists =
      savedPrefix === LEGACY_RUST_CRYPTO_DATABASE_PREFIX ? scopedExists : legacyExists;

    // A marker can outlive IndexedDB after Android/WebView storage cleanup.
    // Only create a fresh store from that marker when no compatible database
    // remains; otherwise recover the database that still contains the keys.
    if (savedDatabaseExists || !anotherDatabaseExists) {
      addCandidate(savedPrefix);
    }
  }

  // Releases before v1.8.12 used the SDK default database. Prefer it when it
  // exists so an upgrade keeps the device identity, verification trust and
  // message keys that are already stored locally. If it belongs to a previous
  // login/device, the SDK reports an account mismatch and we safely fall back
  // to the account-and-device-scoped database.
  if (!savedPrefix || candidates.length === 0) {
    if (legacyExists) addCandidate(LEGACY_RUST_CRYPTO_DATABASE_PREFIX);
    if (scopedExists) addCandidate(scopedPrefix);
  }
  if (candidates.length === 0) addCandidate(scopedPrefix);

  // A legacy selection may belong to another login despite having the same
  // database name. Keep the scoped store as its one safe mismatch fallback.
  if (candidates[0] === LEGACY_RUST_CRYPTO_DATABASE_PREFIX) addCandidate(scopedPrefix);

  for (const prefix of candidates) {
    try {
      await mx.initRustCrypto({ cryptoDatabasePrefix: prefix });
      saveRustCryptoDatabasePrefix(session, prefix);
      return prefix;
    } catch (error) {
      if (prefix !== LEGACY_RUST_CRYPTO_DATABASE_PREFIX || !isRustCryptoAccountMismatch(error)) {
        throw error;
      }
    }
  }

  throw new Error('Unable to initialize the Rust Crypto database.');
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

  // loglevel methods depend on their logger instance (`this.prefix`). Keep the
  // receiver when wrapping warn or Matrix push-rule startup can fail forever.
  const originalWarn = matrixLogger.warn;
  matrixLogger.warn = (...messages: unknown[]) => {
    if (isIgnorableWebMatrixWarning(messages)) return;
    Reflect.apply(originalWarn, matrixLogger, messages);
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
  const cryptoDatabasePrefix = await initRustCryptoForSession(mx, session);
  rustCryptoDatabasePrefixes.set(mx, cryptoDatabasePrefix);

  mx.setMaxListeners(200);

  return mx;
};

// Match the SDK's safe default: enough recent events to paint the room and a
// reliable backward-pagination token, while older history keeps loading on
// demand instead of blocking the whole account's first sync.
const INITIAL_SYNC_LIMIT = 8;

export const startClient = async (mx: MatrixClient) => {
  await mx.startClient({
    lazyLoadMembers: true,
    disablePresence: true,
    initialSyncLimit: INITIAL_SYNC_LIMIT,
  });
};

export const persistClientStore = (mx: MatrixClient): Promise<void> =>
  mx.store.save(true).catch(() => undefined);

const clearClientStores = (mx?: MatrixClient): Promise<void> => {
  if (!mx) return Promise.resolve();
  return mx.clearStores({
    cryptoDatabasePrefix: rustCryptoDatabasePrefixes.get(mx),
  });
};

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
    await clearClientStores(mx);
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
    await clearClientStores(mx);
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
  // Keep the homeserver, user and device identity. Reusing the same Matrix
  // device ID after re-authentication lets this installation reopen the same
  // encryption store instead of silently becoming an unverified new device.
  removeFallbackAccessToken();
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
