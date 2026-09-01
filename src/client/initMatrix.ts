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
  persistAndroidSecretsBundle,
  restoreAndroidSecretsBundle,
  getAndroidSecureValue,
  hasAndroidSecretStorageKey,
  setAndroidSecureValue,
  persistAndroidSession,
  removeAndroidPersistedSession,
  clearSecretStorageKeys,
} from './secretStorageKeys';
import { clearNavToActivePathStore } from '../app/state/navToActivePath';
import { SETTINGS_STORAGE_KEY } from '../app/state/settingsStorage';
import { restorePinLockStorage, snapshotPinLockStorage } from '../app/utils/pinLock';
import { clearDesktopMediaCache } from '../app/utils/desktopMediaAssetCache';
import { isDesktopUpdaterSupported } from '../app/utils/desktopUpdater';
import { pushSessionToSW } from '../sw-session';
import {
  clearFallbackSessionSoftLogout,
  markCryptoDeviceRecoveryNotice,
  markFallbackSessionSoftLoggedOut,
  removeFallbackAccessToken,
} from '../app/state/sessions';
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
import { recordAndroidDiagnostic } from './androidDiagnostics';

type Session = {
  baseUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
  expiresInMs?: number;
  refreshToken?: string;
};

const MALFORMED_ENCRYPTED_EVENT_WARNING = 'missing field `algorithm`';
const rustCryptoDatabasePrefixes = new WeakMap<MatrixClient, string>();
const androidCryptoRestorePromises = new WeakMap<MatrixClient, Promise<void>>();
const androidCryptoTrustRestoreTasks = new WeakMap<MatrixClient, Promise<void>>();
const androidCryptoTrustRestored = new WeakSet<MatrixClient>();
const androidFullBackupRestoreScheduled = new WeakSet<MatrixClient>();
const androidStoreSaveTasks = new WeakMap<MatrixClient, Promise<void>>();
const androidStoreLastPersistedAt = new WeakMap<MatrixClient, number>();
const androidStoreAccountKeys = new WeakMap<MatrixClient, string>();
const androidNativeSnapshotLastPersistedAt = new WeakMap<MatrixClient, number>();
const ANDROID_NATIVE_SNAPSHOT_INTERVAL_MS = 10_000;
const androidNativeSnapshotDirty = new WeakSet<MatrixClient>();
const DEVICE_IDENTITY_QUERY_TIMEOUT_MS = 8_000;
const DEVICE_IDENTITY_CONFIRM_DELAY_MS = 1_000;
const ANDROID_FULL_BACKUP_RESTORE_DELAY_MS = 2_000;
// WebView/IndexedDB and Rust Crypto can both leave a JavaScript Promise
// pending while Android is reopening a renderer. A pending startup stage used
// to leave users on the splash screen indefinitely. Fail the stage explicitly
// so ClientRoot can show its retry action instead.
const ANDROID_STARTUP_STAGE_TIMEOUT_MS = 8_000;
const ANDROID_FULL_BACKUP_RESTORE_MARKER = 'room-key-backup-restored';
export const ANDROID_FULL_BACKUP_RESTORE_COMPLETED_EVENT =
  'starfire:android-full-backup-restore-completed';

type DeviceIdentityStatus = 'valid' | 'invalid' | 'inconclusive';

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

export class InvalidCryptoDeviceError extends Error {
  constructor() {
    super('当前设备的服务器加密身份已失效。请重新登录以安全创建新的加密设备。');
    this.name = 'InvalidCryptoDeviceError';
  }
}

const settleWithin = async <T>(task: Promise<T>, timeoutMs: number): Promise<T | undefined> => {
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<undefined>((resolve) => {
        timer = globalThis.setTimeout(() => resolve(undefined), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) globalThis.clearTimeout(timer);
  }
};

const runWithStartupTimeout = async <T>(
  task: Promise<T>,
  stage: string,
  timeoutMs = ANDROID_STARTUP_STAGE_TIMEOUT_MS
): Promise<T> => {
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = globalThis.setTimeout(
          () => reject(new Error(`Android startup timed out while ${stage}.`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) globalThis.clearTimeout(timer);
  }
};

const inspectCurrentDeviceIdentity = async (
  mx: MatrixClient,
  session: Session
): Promise<DeviceIdentityStatus> => {
  const crypto = mx.getCrypto();
  if (!crypto) return 'inconclusive';

  try {
    const result = await settleWithin(
      Promise.all([
        mx.getDevices(),
        mx.downloadKeysForUsers([session.userId]),
        crypto.getOwnDeviceKeys(),
      ]),
      DEVICE_IDENTITY_QUERY_TIMEOUT_MS
    );
    if (!result) return 'inconclusive';

    const [serverDevices, serverKeys, ownKeys] = result;
    // A homeserver can return a successful /keys/query envelope containing a
    // domain failure. Treat that as a transient query problem, never as proof
    // that the local device should be replaced.
    if (serverKeys.failures && Object.keys(serverKeys.failures).length > 0) {
      return 'inconclusive';
    }

    const serverSessionFound = serverDevices.devices.some(
      (device) => device.device_id === session.deviceId
    );
    const serverDevice = serverKeys.device_keys?.[session.userId]?.[session.deviceId];
    if (!serverSessionFound || !serverDevice) return 'invalid';

    const serverCurve25519 = serverDevice.keys?.[`curve25519:${session.deviceId}`];
    const serverEd25519 = serverDevice.keys?.[`ed25519:${session.deviceId}`];
    return serverCurve25519 === ownKeys.curve25519 && serverEd25519 === ownKeys.ed25519
      ? 'valid'
      : 'invalid';
  } catch {
    // Offline startup, homeserver errors and timeouts are not identity damage.
    return 'inconclusive';
  }
};

const invalidateCurrentCryptoDevice = async (mx: MatrixClient): Promise<void> => {
  mx.stopClient();
  await settleWithin(
    mx.logout().catch(() => undefined),
    DEVICE_IDENTITY_QUERY_TIMEOUT_MS
  );
  await Promise.allSettled([clearAndroidClientSnapshot(mx), mx.store.deleteAllData()]);
  pushSessionToSW();
  removeFallbackAccessToken();
  clearFallbackSessionSoftLogout();
  markCryptoDeviceRecoveryNotice();
};

const validateExistingCryptoDevice = async (mx: MatrixClient, session: Session): Promise<void> => {
  const initialStatus = await inspectCurrentDeviceIdentity(mx, session);
  if (initialStatus !== 'invalid') return;

  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, DEVICE_IDENTITY_CONFIRM_DELAY_MS);
  });
  const confirmedStatus = await inspectCurrentDeviceIdentity(mx, session);
  if (confirmedStatus !== 'invalid') return;

  await invalidateCurrentCryptoDevice(mx);
  throw new InvalidCryptoDeviceError();
};

type RustCryptoInitialization = {
  prefix: string;
  newlyIssuedDevice: boolean;
};

const initRustCryptoForSession = async (
  mx: MatrixClient,
  session: Session
): Promise<RustCryptoInitialization> => {
  const scopedPrefix = getRustCryptoDatabasePrefix(session);
  const savedPrefix = getSavedRustCryptoDatabasePrefix(session);
  const storeCreationAllowed = isNewRustCryptoStoreAllowed(session);
  // Android WebView can briefly report an empty IndexedDB list while its
  // renderer is reopening. Losing this store means losing the device's Olm
  // identity, so an existing Android session must never create a replacement
  // crypto account under the old device ID.
  const cryptoPrefixes = [LEGACY_RUST_CRYPTO_DATABASE_PREFIX, scopedPrefix];
  let existingPrefixes = isAndroidApp()
    ? new Set<string>()
    : await findExistingRustCryptoDatabasePrefixes(cryptoPrefixes);
  // Android WebView/IndexedDB can briefly report an empty database list while
  // the renderer is being recreated. Never treat that transient state as a
  // revoked login; give the store a few bounded attempts to reappear first.
  const legacyExists = existingPrefixes.has(LEGACY_RUST_CRYPTO_DATABASE_PREFIX);
  const scopedExists = existingPrefixes.has(scopedPrefix);
  const candidates: string[] = [];
  const addCandidate = (prefix: string) => {
    if (!candidates.includes(prefix)) candidates.push(prefix);
  };

  if (isAndroidApp()) {
    // Do not gate Android startup on an IndexedDB existence probe. WebView can
    // report a database as absent while the renderer is still reconnecting,
    // and that produced the unrecoverable "database lost" loop after a swipe-
    // away. Opening the saved prefix itself is the authoritative operation:
    // an existing store keeps the same Olm identity, while a genuinely missing
    // store can at least be recreated and recovered from the native backup
    // keys instead of trapping the user on the splash screen.
    if (savedPrefix) addCandidate(savedPrefix);
    else if (storeCreationAllowed) addCandidate(scopedPrefix);
    else addCandidate(legacyExists ? LEGACY_RUST_CRYPTO_DATABASE_PREFIX : scopedPrefix);
    if (savedPrefix === LEGACY_RUST_CRYPTO_DATABASE_PREFIX && scopedExists) {
      addCandidate(scopedPrefix);
    }
  } else if (savedPrefix) {
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
  if (!isAndroidApp() && (!savedPrefix || candidates.length === 0)) {
    if (legacyExists) addCandidate(LEGACY_RUST_CRYPTO_DATABASE_PREFIX);
    if (scopedExists) addCandidate(scopedPrefix);
  }
  // The strict missing-store branch remains for web/desktop only:
  // if (candidates.length === 0 && !storeCreationAllowed)
  if (!isAndroidApp() && candidates.length === 0 && !storeCreationAllowed) {
    // Keep the encrypted native login session, but do not initialize an empty
    // store: that would silently replace the same device ID's keys and make
    // every device appear unverified. A retry/restart can reopen the original
    // database without creating another Matrix device.
    if (!isAndroidApp()) removeFallbackAccessToken();
    throw new MissingCryptoStoreError();
  }
  if (candidates.length === 0) {
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
      return { prefix, newlyIssuedDevice: storeCreationAllowed };
    } catch (error) {
      if (prefix !== LEGACY_RUST_CRYPTO_DATABASE_PREFIX || !isRustCryptoAccountMismatch(error)) {
        throw error;
      }
    }
  }

  if (!isAndroidApp()) {
    removeAndroidPersistedSession();
    removeFallbackAccessToken();
  }
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
    const persisted = storage.persisted
      ? await runWithStartupTimeout(storage.persisted(), 'checking persistent storage', 2_000)
      : false;
    if (persisted !== true) {
      await runWithStartupTimeout(storage.persist(), 'requesting persistent storage', 2_000);
    }
  } catch {
    // Durable storage is best effort and must never block login.
  }
};

export const initClient = async (session: Session): Promise<MatrixClient> => {
  installWebMatrixLoggerFilter();
  recordAndroidDiagnostic('client_init_begin', {
    hasRefreshToken: !!session.refreshToken,
  });
  await hydrateSecretStorageKeys();

  // Android sessions can outlive the short-lived access token returned by a
  // homeserver. Keep the refresh token in the native encrypted store and let
  // matrix-js-sdk refresh it before requests are sent. Web/desktop keep their
  // existing token lifecycle and do not use this path.
  const tokenRefreshFunction =
    isAndroidApp() && session.refreshToken
      ? async (refreshToken: string) => {
          const refreshClient = createClient({
            baseUrl: session.baseUrl,
            userId: session.userId,
            deviceId: session.deviceId,
          });
          const response = await refreshClient.refreshToken(refreshToken);
          const nextRefreshToken = response.refresh_token || refreshToken;
          localStorage.setItem('cinny_access_token', response.access_token);
          if (response.expires_in_ms !== undefined) {
            localStorage.setItem('cinny_expires_in_ms', String(response.expires_in_ms));
          }
          localStorage.setItem('cinny_refresh_token', nextRefreshToken);
          await persistAndroidSession({
            ...session,
            accessToken: response.access_token,
            refreshToken: nextRefreshToken,
            expiresInMs: response.expires_in_ms,
          });
          recordAndroidDiagnostic('access_token_refreshed', {
            hasRotatedRefreshToken: !!response.refresh_token,
          });
          return {
            accessToken: response.access_token,
            refreshToken: nextRefreshToken,
            expiry:
              typeof response.expires_in_ms === 'number'
                ? new Date(Date.now() + response.expires_in_ms)
                : undefined,
          };
        }
      : undefined;

  const indexedDBStore = new IndexedDBStore({
    indexedDB: global.indexedDB,
    localStorage: global.localStorage,
    dbName: 'web-sync-store',
  });

  const legacyCryptoStore = new IndexedDBCryptoStore(global.indexedDB, 'crypto-store');

  const mx = createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    tokenRefreshFunction,
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
  if (isAndroidApp()) recordAndroidDiagnostic('sync_store_start_begin');
  const syncStoreStartup = indexedDBStore.startup();
  if (isAndroidApp()) {
    await runWithStartupTimeout(syncStoreStartup, 'opening the sync store');
  } else {
    await syncStoreStartup;
  }
  if (isAndroidApp()) recordAndroidDiagnostic('sync_store_start_complete');
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
  if (isAndroidApp()) recordAndroidDiagnostic('crypto_store_open_begin');
  const cryptoStoreInit = initRustCryptoForSession(mx, session);
  const { prefix: cryptoDatabasePrefix, newlyIssuedDevice } = isAndroidApp()
    ? await runWithStartupTimeout(cryptoStoreInit, 'opening the crypto store')
    : await cryptoStoreInit;
  rustCryptoDatabasePrefixes.set(mx, cryptoDatabasePrefix);
  recordAndroidDiagnostic('crypto_store_opened', { newlyIssuedDevice });
  // A normal app update preserves the access token and IndexedDB. Verify that
  // the retained server session still owns the same E2EE identity before sync
  // can expose undecryptable events. A freshly-issued login is skipped once so
  // Rust Crypto can perform its first device-key upload without racing us.
  // Native Matrix clients restore the local crypto account and let an
  // explicit server logout end the session. Android /devices and /keys/query
  // can be temporarily incomplete during process recreation; treating two
  // such responses as destructive proof caused intermittent sign-outs.
  if (!newlyIssuedDevice && !isAndroidApp()) await validateExistingCryptoDevice(mx, session);
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
      // Keep an existing Android session durable even for homeservers which
      // issue non-expiring access tokens and therefore never run the refresh
      // callback. This is a no-op on web and desktop.
      persistAndroidSession({
        ...session,
        accessToken: mx.getAccessToken() || session.accessToken,
        // The SDK replaces its refresh token after a successful rotation.
        // Persist the live value instead of the login-time closure value, or
        // the next sync snapshot would overwrite Keystore with an expired
        // refresh token and cause a delayed password-login loop.
        refreshToken: mx.getRefreshToken() || session.refreshToken,
      }).catch(() => undefined);
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
const INITIAL_SYNC_LIMIT = 4;

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
          const verifiedMarker = getAndroidSecureValue('verified-device');
          recordAndroidDiagnostic('crypto_restore_preflight', {
            verifiedMarkerPresent: verifiedMarker === '1',
            hasSecretStorageKey: hasAndroidSecretStorageKey(),
            hasBackupKey: !!getAndroidSecureValue('session-backup-private-key'),
            hasSecretsBundle: !!getAndroidSecureValue('crypto-secrets-bundle'),
          });
          if (verifiedMarker === '1' && userId && deviceId) {
            // A healthy Rust store already has the original cross-signing
            // private keys and local trust. Re-importing the bundle and
            // re-signing the device on every launch causes needless device
            // list churn and makes cached encrypted events flash as failures.
            let crossSigningReady = await crypto.isCrossSigningReady().catch(() => false);
            recordAndroidDiagnostic('crypto_cross_signing_ready', { ready: crossSigningReady });
            if (!crossSigningReady) {
              // Refresh through Rust Crypto itself before importing the trusted
              // bundle. MatrixClient.downloadKeysForUsers only returns the raw
              // response; this method feeds it into Rust's identity store.
              await crypto.userHasCrossSigningKeys(userId, true);
              // `isCrossSigningReady()` also requires the Rust identity to be
              // loaded and marked verified. On a cold Android start the first
              // check can run before the device-list query above has populated
              // that identity, even though all private keys are already in the
              // local store. Re-check before importing the secrets bundle; the
              // previous one-shot check made every launch repeat the expensive
              // restore/sign flow.
              crossSigningReady = await crypto.isCrossSigningReady().catch(() => false);
              recordAndroidDiagnostic('crypto_cross_signing_ready_after_keys', {
                ready: crossSigningReady,
              });
            }
            if (!crossSigningReady) {
              // Restore the exact cross-signing and backup secrets captured
              // when the user completed verification.
              let secretsRestored = await restoreAndroidSecretsBundle(crypto);
              recordAndroidDiagnostic('crypto_secrets_bundle_restore', {
                restored: secretsRestored,
              });
              if (!secretsRestored && hasAndroidSecretStorageKey()) {
                // Some users may background the app immediately after the
                // verification finishes, before exportSecretsBundle completes.
                // The native Keystore already has the Secret Storage private
                // key at that point. Only when the server confirms that the
                // original cross-signing secrets are complete do we let the SDK
                // import them. This preflight prevents bootstrapCrossSigning
                // from ever creating a replacement identity during recovery.
                const secretStorageStatus = await crypto.getSecretStorageStatus();
                const requiredCrossSigningSecrets = [
                  'm.cross_signing.master',
                  'm.cross_signing.self_signing',
                  'm.cross_signing.user_signing',
                ] as const;
                const originalSecretsReady =
                  Boolean(secretStorageStatus.defaultKeyId) &&
                  requiredCrossSigningSecrets.every(
                    (name) => secretStorageStatus.secretStorageKeyValidityMap[name] === true
                  );
                if (originalSecretsReady) {
                  await crypto.bootstrapCrossSigning({});
                  secretsRestored = await persistAndroidSecretsBundle(crypto);
                }
              }
              if (!secretsRestored) {
                // Never create a replacement identity during recovery.
                throw new Error('Android cross-signing secrets are not ready.');
              }
              // importSecretsBundle restores the original keys but does not
              // sign a newly reopened crypto store's device.
              await crypto.crossSignDevice(deviceId);
              recordAndroidDiagnostic('crypto_device_cross_sign_completed');

              // crossSignDevice uploads the signature, but Rust still needs a
              // processed /keys/query response before its Device object reflects
              // that signature. Retry briefly without repeatedly signing.
              const refreshCrossSigningVerification = async (
                attempt: number
              ): Promise<{ crossSigningVerified: boolean; identityVerified: boolean }> => {
                await crypto.userHasCrossSigningKeys(userId, true);
                const [verification, identity] = await Promise.all([
                  crypto.getDeviceVerificationStatus(userId, deviceId),
                  crypto.getUserVerificationStatus(userId),
                ]);
                const verified = verification?.crossSigningVerified === true;
                const identityVerified = identity.isCrossSigningVerified();
                recordAndroidDiagnostic('crypto_verification_status', {
                  attempt,
                  signedByOwner: verification?.signedByOwner === true,
                  localVerified: verification?.localVerified === true,
                  identityVerified,
                  crossSigningVerified: verified,
                });
                if (verified || attempt >= 5)
                  return { crossSigningVerified: verified, identityVerified };
                await new Promise<void>((resolve) => {
                  globalThis.setTimeout(resolve, 500);
                });
                return refreshCrossSigningVerification(attempt + 1);
              };
              const verificationState = await refreshCrossSigningVerification(1);
              if (!verificationState.crossSigningVerified && verificationState.identityVerified) {
                // The durable marker is written only after the user completed
                // verification with this exact device and secrets bundle. If a
                // cold start races the homeserver device-list update, preserve
                // that established trust locally instead of showing the user an
                // unverified device while the server signature catches up.
                await crypto.setDeviceVerified(userId, deviceId, true);
                recordAndroidDiagnostic('crypto_local_trust_applied');
              } else if (!verificationState.crossSigningVerified) {
                throw new Error('Android device cross-signing trust is not ready.');
              }
              crossSigningReady = true;
            }
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
          const backupVersion = backupInfo.version;
          const backupTrust = await crypto.isKeyBackupTrusted(backupInfo);
          recordAndroidDiagnostic('backup_verification_status', {
            trusted: backupTrust?.matchesDecryptionKey === true,
          });
          if (backupTrust?.matchesDecryptionKey !== true) {
            throw new Error('Android backup decryption key is not attached yet.');
          }
          // A newly-created Android crypto store has the backup private key but
          // not the historical Megolm sessions themselves. The SDK will then
          // query /room_keys one session at a time whenever an old message is
          // rendered, which is exactly the "unable to decrypt" flash seen on
          // every launch. Restore the complete trusted backup once in the
          // background and persist a version marker; this never blocks startup
          // and subsequent launches keep the imported sessions in Rust's DB.
          if (!androidFullBackupRestoreScheduled.has(mx)) {
            androidFullBackupRestoreScheduled.add(mx);
            const restoredMarker = getAndroidSecureValue(ANDROID_FULL_BACKUP_RESTORE_MARKER);
            if (restoredMarker !== backupVersion) {
              window.setTimeout(() => {
                void (async () => {
                  recordAndroidDiagnostic('crypto_full_backup_restore_started', {
                    version: backupVersion,
                  });
                  try {
                    const result = await crypto.restoreKeyBackup({});
                    if (result.imported < result.total) {
                      throw new Error(`Only restored ${result.imported} of ${result.total} room keys.`);
                    }
                    await setAndroidSecureValue(
                      ANDROID_FULL_BACKUP_RESTORE_MARKER,
                      backupVersion
                    );
                    recordAndroidDiagnostic('crypto_full_backup_restore_completed', {
                      version: backupVersion,
                      imported: result.imported,
                      total: result.total,
                    });
                    // The room decrypt scheduler may have run before the
                    // backup import finished and recorded temporary Megolm
                    // failures. Notify it to make one complete pass now that
                    // Rust Crypto contains the historical sessions.
                    window.dispatchEvent(
                      new CustomEvent(ANDROID_FULL_BACKUP_RESTORE_COMPLETED_EVENT, {
                        detail: { version: backupVersion },
                      })
                    );
                  } catch (error) {
                    androidFullBackupRestoreScheduled.delete(mx);
                    recordAndroidDiagnostic('crypto_full_backup_restore_failed', {
                      error: error instanceof Error ? error.name : String(error).slice(0, 120),
                    });
                  }
                })();
              }, ANDROID_FULL_BACKUP_RESTORE_DELAY_MS);
            }
          }
          await persistAndroidBackupKey(crypto);
          await persistAndroidCryptoState(mx);
          androidCryptoTrustRestored.add(mx);
        })();
        androidCryptoTrustRestoreTasks.set(mx, task);
        try {
          await task;
        } catch (error) {
          recordAndroidDiagnostic('crypto_restore_failed', {
            error: error instanceof Error ? error.name : String(error).slice(0, 120),
          });
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

/** Persist Android trust only after the SDK reports this exact device as verified. */
export const persistAndroidCryptoState = async (
  mx: MatrixClient,
  confirmedVerification = false
): Promise<void> => {
  if (!isAndroidApp()) return;
  const crypto = mx.getCrypto();
  const userId = mx.getUserId();
  const deviceId = mx.getDeviceId();
  if (!crypto || !userId || !deviceId) return;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const verification = await crypto.getDeviceVerificationStatus(userId, deviceId);
      const [backupPersisted, secretsPersisted] = await Promise.all([
        persistAndroidBackupKey(crypto).then(() =>
          Boolean(getAndroidSecureValue('session-backup-private-key'))
        ),
        persistAndroidSecretsBundle(crypto),
      ]);
      // A durable verified marker is useful only together with the original
      // cross-signing secrets. Writing the marker first created a dangerous
      // half-state in which cold-start recovery could not prove the identity.
      if ((verification?.crossSigningVerified || confirmedVerification) && secretsPersisted) {
        await setAndroidSecureValue('verified-device', '1');
      }
      if (
        getAndroidSecureValue('verified-device') === '1' &&
        backupPersisted &&
        getAndroidSecureValue('crypto-secrets-bundle')
      )
        return;
    } catch {
      // A transient device-list read must not erase a durable marker.
    }
    if (attempt < 19) {
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 500));
    }
  }
  await Promise.all([persistAndroidBackupKey(crypto), persistAndroidSecretsBundle(crypto)]);
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
  if (forceNativeSnapshot) void persistAndroidCryptoState(mx);
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

  await clearSecretStorageKeys();
  await removeAndroidPersistedSession();

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

  await clearSecretStorageKeys();
  await removeAndroidPersistedSession();

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
export const clearExpiredSessionAfterLogout = async (mx?: MatrixClient, softLogout = false) => {
  pushSessionToSW();
  mx?.stopClient();
  try {
    await clearAndroidClientSnapshot(mx);
    await mx?.store.deleteAllData();
  } catch {
    // A failed sync-store cleanup must not prevent returning to sign-in.
  }
  // Android's encrypted session is deliberately retained here. This event can
  // be caused by an expired access token, a renderer restart race, or a
  // temporary homeserver/network failure. Deleting the native record at this
  // boundary destroys the only durable refresh token and turns a recoverable
  // expiry into a password-login loop. Explicit logout and clear-local-data
  // still remove it via clearLocalSessionAfterLogout/clearAllLocalData.
  if (!isAndroidApp()) {
    await removeAndroidPersistedSession();
    removeFallbackAccessToken();
  }
  if (softLogout) {
    markFallbackSessionSoftLoggedOut();
  } else {
    clearFallbackSessionSoftLogout();
  }
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
