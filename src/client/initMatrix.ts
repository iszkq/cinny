import {
  createClient,
  MatrixClient,
  IndexedDBStore,
  IndexedDBCryptoStore,
  ClientEvent,
  SyncState,
} from 'matrix-js-sdk';
import { logger as matrixLogger } from 'matrix-js-sdk/lib/logger';

import {
  cryptoCallbacks,
  hydrateSecretStorageKeys,
  persistAndroidBackupKey,
  restoreAndroidBackupKey,
  getAndroidSecureValue,
} from './secretStorageKeys';
import { clearNavToActivePathStore } from '../app/state/navToActivePath';
import { SETTINGS_STORAGE_KEY } from '../app/state/settingsStorage';
import { restorePinLockStorage, snapshotPinLockStorage } from '../app/utils/pinLock';
import { clearDesktopMediaCache } from '../app/utils/desktopMediaAssetCache';
import { isDesktopUpdaterSupported } from '../app/utils/desktopUpdater';
import { pushSessionToSW } from '../sw-session';
import { removeFallbackAccessToken } from '../app/state/sessions';
import { isAndroidApp } from '../app/utils/nativePlatform';
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api/CryptoEvent';
import {
  getAndroidClientStoreAccountKey,
  loadAndroidClientSnapshot,
  removeAndroidClientSnapshot,
  saveAndroidClientSnapshot,
} from './androidClientStore';
import {
  clearNewRustCryptoStoreAllowance,
  findExistingRustCryptoDatabasePrefixes,
  getRustCryptoDatabasePrefix,
  getSavedRustCryptoDatabasePrefix,
  isNewRustCryptoStoreAllowed,
  LEGACY_RUST_CRYPTO_DATABASE_PREFIX,
  saveRustCryptoDatabasePrefix,
} from './rustCryptoStore';

type Session = {
  baseUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
};

const MALFORMED_ENCRYPTED_EVENT_WARNING = 'missing field `algorithm`';
const rustCryptoDatabasePrefixes = new WeakMap<MatrixClient, string>();
const androidCryptoRestorePromises = new WeakMap<MatrixClient, Promise<void>>();
const androidCryptoTrustRestoreTasks = new WeakMap<MatrixClient, Promise<void>>();
const androidCryptoTrustRestored = new WeakSet<MatrixClient>();
const androidStoreSaveTasks = new WeakMap<MatrixClient, Promise<void>>();
const androidStoreLastPersistedAt = new WeakMap<MatrixClient, number>();
const androidStoreAccountKeys = new WeakMap<MatrixClient, string>();
const androidNativeSnapshotLastPersistedAt = new WeakMap<MatrixClient, number>();
const ANDROID_NATIVE_SNAPSHOT_INTERVAL_MS = 10_000;
const androidNativeSnapshotDirty = new WeakSet<MatrixClient>();

const isRustCryptoAccountMismatch = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes('account in the store') &&
    normalizedMessage.includes('match the account')
  );
};

export class MissingCryptoStoreError extends Error {
  constructor() {
    super('本机加密数据库已丢失。为避免在旧设备 ID 下生成不兼容的新密钥，请重新登录以创建新设备。');
    this.name = 'MissingCryptoStoreError';
  }
}

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
  const storeCreationAllowed = isNewRustCryptoStoreAllowed(session);
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
    // Only create a fresh store from that marker when this is a newly-issued
    // device session; otherwise recover the database that still contains keys.
    if (savedDatabaseExists || (!anotherDatabaseExists && storeCreationAllowed)) {
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
  if (candidates.length === 0) {
    if (!storeCreationAllowed) {
      removeFallbackAccessToken();
      throw new MissingCryptoStoreError();
    }
    addCandidate(scopedPrefix);
  }

  // A legacy selection may belong to another login despite having the same
  // database name. Keep the scoped store as its one safe mismatch fallback.
  if (
    candidates[0] === LEGACY_RUST_CRYPTO_DATABASE_PREFIX &&
    (scopedExists || storeCreationAllowed)
  ) {
    addCandidate(scopedPrefix);
  }

  for (const prefix of candidates) {
    try {
      await mx.initRustCrypto({ cryptoDatabasePrefix: prefix });
      saveRustCryptoDatabasePrefix(session, prefix);
      clearNewRustCryptoStoreAllowance(session);
      return prefix;
    } catch (error) {
      if (prefix !== LEGACY_RUST_CRYPTO_DATABASE_PREFIX || !isRustCryptoAccountMismatch(error)) {
        throw error;
      }
    }
  }

  removeFallbackAccessToken();
  throw new MissingCryptoStoreError();
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

const requestPersistentAndroidStorage = async (): Promise<void> => {
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!storage?.persist) return;
    if ((await storage.persisted?.()) !== true) await storage.persist();
  } catch {
    // Durable storage is best effort and must never block login.
  }
};

export const initClient = async (session: Session): Promise<MatrixClient> => {
  installWebMatrixLoggerFilter();
  await hydrateSecretStorageKeys();

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

  // Open the Matrix stores only after Android has requested durable storage.
  // The persisted() fast path is effectively immediate after the first launch;
  // this prevents a newly-created WebView database from being evicted before
  // the first sync snapshot is written.
  if (isAndroidApp()) await requestPersistentAndroidStorage();
  await indexedDBStore.startup();
  if (isAndroidApp()) {
    const accountKey = getAndroidClientStoreAccountKey(
      session.baseUrl,
      session.userId,
      session.deviceId
    );
    androidStoreAccountKeys.set(mx, accountKey);

    // IndexedDBStore intentionally degrades to MemoryStore after a backend
    // error. That fallback is normally invisible, but on Android it means a
    // process restart will look like a first login again. Keep a small,
    // Android-only breadcrumb so a device test can prove whether this path
    // was taken without changing SDK behaviour on desktop/web.
    indexedDBStore.on('degraded', (error: unknown) => {
      try {
        global.localStorage.setItem(
          'cinny_android_sync_store_status',
          JSON.stringify({ status: 'degraded', at: Date.now(), error: String(error) })
        );
      } catch {
        // Diagnostics must never affect startup.
      }
      matrixLogger.error('Android IndexedDB sync store degraded to memory.', error);
    });
    indexedDBStore.on('closed', () => {
      try {
        global.localStorage.setItem(
          'cinny_android_sync_store_status',
          JSON.stringify({ status: 'closed', at: Date.now() })
        );
      } catch {
        // Diagnostics must never affect startup.
      }
    });
    try {
      let [savedToken, savedSync] = await Promise.all([
        indexedDBStore.getSavedSyncToken(),
        (
          indexedDBStore as IndexedDBStore & {
            getSavedSync(
              copy?: boolean
            ): Promise<{ roomsData?: { join?: Record<string, unknown> } } | null>;
          }
        ).getSavedSync(false),
      ]);
      // IndexedDB is the SDK-owned source of truth. A native checkpoint is
      // only disaster recovery for a completely unavailable store; injecting
      // old events or tokens into a healthy accumulator can hide new events
      // and corrupt backward pagination.
      if (!savedToken || !savedSync) {
        const nativeSnapshot = await loadAndroidClientSnapshot(accountKey);
        if (nativeSnapshot) {
          const restoredSync = nativeSnapshot.savedSync;
          await indexedDBStore.setSyncData({
            next_batch: restoredSync.nextBatch,
            rooms: restoredSync.roomsData,
            account_data: { events: restoredSync.accountData },
          });
          await indexedDBStore.save(true);
          savedToken = restoredSync.nextBatch;
          savedSync = restoredSync;
          androidNativeSnapshotLastPersistedAt.set(mx, nativeSnapshot.savedAt);
          matrixLogger.info('Restored Android Matrix sync data from native storage.');
        }
      }
      global.localStorage.setItem(
        'cinny_android_sync_store_status',
        JSON.stringify({
          status: 'ready',
          at: Date.now(),
          hasSavedToken: !!savedToken,
          savedRoomCount: savedSync?.roomsData
            ? Object.keys(savedSync.roomsData.join || {}).length
            : 0,
        })
      );
    } catch (error) {
      matrixLogger.error('Unable to inspect Android IndexedDB sync store.', error);
    }
  }
  const cryptoDatabasePrefix = await initRustCryptoForSession(mx, session);
  rustCryptoDatabasePrefixes.set(mx, cryptoDatabasePrefix);
  if (isAndroidApp()) {
    // Attach before startClient so a cache-prepared sync is checkpointed even
    // when React has not mounted its later UI listeners yet.
    mx.on(ClientEvent.Sync, (state: SyncState) => {
      if (
        state !== SyncState.Prepared &&
        state !== SyncState.Syncing &&
        state !== SyncState.Catchup
      ) {
        return;
      }
      const now = Date.now();
      const previous = androidStoreLastPersistedAt.get(mx) ?? 0;
      if (state === SyncState.Prepared || now - previous >= 10_000) {
        androidStoreLastPersistedAt.set(mx, now);
        androidNativeSnapshotDirty.add(mx);
        void persistClientStore(mx);
      }
    });
  }
  if (isAndroidApp()) {
    const crypto = mx.getCrypto();
    if (crypto) {
      androidCryptoRestorePromises.set(mx, restoreAndroidBackupKey(crypto));
      mx.on(CryptoEvent.KeyBackupDecryptionKeyCached, (version: string) => {
        void persistAndroidBackupKey(crypto, version);
      });
    }
  }
  mx.setMaxListeners(200);

  return mx;
};

// Match the SDK's safe default: enough recent events to paint the room and a
// reliable backward-pagination token, while older history keeps loading on
// demand instead of blocking the whole account's first sync.
const INITIAL_SYNC_LIMIT = 8;

export const startClient = async (mx: MatrixClient) => {
  if (isAndroidApp()) {
    await androidCryptoRestorePromises.get(mx);
    const crypto = mx.getCrypto();
    if (crypto) {
      // Rust Crypto starts its backup check during construction, before the
      // Android Keystore key can be restored. Re-run the check after restore so
      // a previously trusted backup is enabled again instead of being disabled
      // for the remainder of this process.
      const restoreTrustAfterSync = async (
        state: SyncState,
        _previousState: SyncState | null,
        syncData?: { fromCache?: boolean }
      ) => {
        if (
          state !== SyncState.Prepared &&
          state !== SyncState.Syncing &&
          state !== SyncState.Catchup
        ) {
          return;
        }

        // PREPARED is also emitted while the SDK is hydrating a cached sync.
        // Do not force a backup check from that cache event: the network
        // request is still in flight and a transient response failure would
        // make Rust Crypto disable an otherwise valid local backup.
        if (syncData?.fromCache) return;

        if (androidCryptoTrustRestored.has(mx)) return;
        const runningTask = androidCryptoTrustRestoreTasks.get(mx);
        if (runningTask) {
          await runningTask;
          return;
        }

        const task = (async () => {
          const userId = mx.getUserId();
          const deviceId = mx.getDeviceId();
          if (getAndroidSecureValue('verified-device') === '1' && userId && deviceId) {
            await crypto.setDeviceVerified(userId, deviceId, true);
          }
          if (!getAndroidSecureValue('session-backup-private-key')) {
            // Older Android builds could keep the Secret Storage private key
            // but miss the separate backup-key snapshot. Re-derive the backup
            // key from that already-persisted secret without asking the user
            // for the recovery key again, then immediately migrate it to the
            // dedicated native secure-storage entry.
            await crypto.loadSessionBackupPrivateKeyFromSecretStorage().catch(() => undefined);
          }
          await crypto.checkKeyBackupAndEnable();
          const backupInfo = await crypto.getKeyBackupInfo();
          if (!backupInfo?.version) throw new Error('Encrypted backup information is not ready.');
          const backupTrust = await crypto.isKeyBackupTrusted(backupInfo);
          if (backupTrust?.matchesDecryptionKey !== true) {
            throw new Error('Android backup decryption key is not attached yet.');
          }
          await persistAndroidBackupKey(crypto);
          androidCryptoTrustRestored.add(mx);
        })();
        androidCryptoTrustRestoreTasks.set(mx, task);
        try {
          await task;
        } catch {
          // A transient server/crypto startup error is retried on the next
          // healthy sync state; it must not block the room shell.
        } finally {
          if (androidCryptoTrustRestoreTasks.get(mx) === task) {
            androidCryptoTrustRestoreTasks.delete(mx);
          }
        }
      };
      mx.on(ClientEvent.Sync, restoreTrustAfterSync);
    }
  }
  await mx.startClient({
    lazyLoadMembers: true,
    disablePresence: true,
    initialSyncLimit: INITIAL_SYNC_LIMIT,
  });
};

export const persistClientStore = (
  mx: MatrixClient,
  forceNativeSnapshot = false
): Promise<void> => {
  if (!isAndroidApp()) return mx.store.save(true).catch(() => undefined);

  // Android can deliver pause/pagehide and Sync events together. Serialising
  // forced saves prevents overlapping IndexedDB transactions from being
  // interrupted halfway through, which otherwise makes the SDK degrade to an
  // in-memory store and loses the next launch snapshot.
  const previous = androidStoreSaveTasks.get(mx) ?? Promise.resolve();
  const task = previous
    .catch(() => undefined)
    .then(async () => {
      try {
        await mx.store.save(true);
        const accountKey = androidStoreAccountKeys.get(mx);
        const now = Date.now();
        const lastNativeSave = androidNativeSnapshotLastPersistedAt.get(mx) ?? 0;
        if (
          accountKey &&
          (forceNativeSnapshot || androidNativeSnapshotDirty.has(mx)) &&
          (forceNativeSnapshot || now - lastNativeSave >= ANDROID_NATIVE_SNAPSHOT_INTERVAL_MS)
        ) {
          const savedSync = await mx.store.getSavedSync();
          if (savedSync) {
            await saveAndroidClientSnapshot(accountKey, savedSync);
            androidNativeSnapshotLastPersistedAt.set(mx, now);
            androidNativeSnapshotDirty.delete(mx);
          }
        }
      } catch (error) {
        matrixLogger.error('Android Matrix store save failed.', error);
      }
    });
  androidStoreSaveTasks.set(mx, task);
  return task;
};

const clearAndroidClientSnapshot = async (mx?: MatrixClient): Promise<void> => {
  if (!mx || !isAndroidApp()) return;
  const accountKey = androidStoreAccountKeys.get(mx);
  if (!accountKey) return;
  await removeAndroidClientSnapshot(accountKey).catch(() => undefined);
};

const clearClientStores = async (mx?: MatrixClient): Promise<void> => {
  if (!mx) return Promise.resolve();
  await clearAndroidClientSnapshot(mx);
  await mx.clearStores({
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
  await clearAndroidClientSnapshot(mx);
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
    await clearAndroidClientSnapshot(mx);
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
