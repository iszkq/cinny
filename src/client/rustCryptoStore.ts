import { isAndroidApp } from '../app/utils/nativePlatform';

type RustCryptoSessionIdentity = {
  userId: string;
  deviceId: string;
};

export const LEGACY_RUST_CRYPTO_DATABASE_PREFIX = 'matrix-js-sdk';
const RUST_CRYPTO_DATABASE_SELECTION_KEY_PREFIX = 'cinny_rust_crypto_database';
const RUST_CRYPTO_STORE_CREATION_KEY_PREFIX = 'cinny_rust_crypto_store_creation';
const STORE_CREATION_ALLOWANCE_MS = 60 * 60 * 1000;

export const getRustCryptoDatabaseNames = (prefix: string): string[] => [
  `${prefix}::matrix-sdk-crypto`,
  `${prefix}::matrix-sdk-crypto-meta`,
];

/**
 * Rust Crypto stores the local Olm machine (including the device identity), so
 * the prefix must be unique per Matrix account and device.
 */
export const getRustCryptoDatabasePrefix = (session: RustCryptoSessionIdentity): string =>
  `cinny-rust-crypto-${encodeURIComponent(session.userId)}-${encodeURIComponent(session.deviceId)}`;

const getRustCryptoDatabaseSelectionKey = (session: RustCryptoSessionIdentity): string =>
  `${RUST_CRYPTO_DATABASE_SELECTION_KEY_PREFIX}:${encodeURIComponent(
    session.userId
  )}:${encodeURIComponent(session.deviceId)}`;

const getRustCryptoStoreCreationKey = (session: RustCryptoSessionIdentity): string =>
  `${RUST_CRYPTO_STORE_CREATION_KEY_PREFIX}:${encodeURIComponent(
    session.userId
  )}:${encodeURIComponent(session.deviceId)}`;

export const getSavedRustCryptoDatabasePrefix = (
  session: RustCryptoSessionIdentity
): string | undefined => {
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

export const saveRustCryptoDatabasePrefix = (
  session: RustCryptoSessionIdentity,
  prefix: string
) => {
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

const findExistingPrefixesByOpening = async (prefixes: string[]): Promise<Set<string>> => {
  const results = await Promise.all(
    prefixes.map(
      async (prefix) =>
        [prefix, await indexedDbDatabaseExists(getRustCryptoDatabaseNames(prefix)[0])] as const
    )
  );
  return new Set(results.filter(([, exists]) => exists).map(([prefix]) => prefix));
};

export const findExistingRustCryptoDatabasePrefixes = async (
  prefixes: string[]
): Promise<Set<string>> => {
  try {
    // Android WebView's indexedDB.databases() can transiently return an empty
    // list immediately after its renderer process is recreated, even though
    // opening the existing database succeeds. Treating that list as
    // authoritative made an ordinary swipe-away look like permanent crypto
    // data loss. Probe the exact account/device databases directly on Android;
    // aborting onupgradeneeded keeps this read-only when a database is truly
    // absent, so we never create a new Olm identity under the old device ID.
    // Android path: if (isAndroidApp()) {
    if (isAndroidApp()) return findExistingPrefixesByOpening(prefixes);

    if (typeof global.indexedDB?.databases === 'function') {
      const databases = await global.indexedDB.databases();
      const existingNames = new Set(databases.map(({ name }) => name));
      return new Set(
        prefixes.filter((prefix) =>
          getRustCryptoDatabaseNames(prefix).some((name) => existingNames.has(name))
        )
      );
    }

    return findExistingPrefixesByOpening(prefixes);
  } catch {
    return new Set();
  }
};

export const hasPersistedRustCryptoStore = async (
  session: RustCryptoSessionIdentity
): Promise<boolean> => {
  const scopedPrefix = getRustCryptoDatabasePrefix(session);
  const savedPrefix = getSavedRustCryptoDatabasePrefix(session);
  const prefixes = savedPrefix
    ? [savedPrefix, scopedPrefix]
    : [scopedPrefix, LEGACY_RUST_CRYPTO_DATABASE_PREFIX];
  const existing = await findExistingRustCryptoDatabasePrefixes(Array.from(new Set(prefixes)));

  // A scoped database is unambiguous. A legacy database is accepted only when
  // it is the saved selection, or while migrating a pre-selection-marker
  // installation; initRustCrypto still validates its account before use.
  return (
    existing.has(scopedPrefix) ||
    (!!savedPrefix && existing.has(savedPrefix)) ||
    (!savedPrefix && existing.has(LEGACY_RUST_CRYPTO_DATABASE_PREFIX))
  );
};

export const allowNewRustCryptoStore = (session: RustCryptoSessionIdentity): void => {
  try {
    global.localStorage.setItem(getRustCryptoStoreCreationKey(session), String(Date.now()));
  } catch {
    // A newly-issued Matrix device can still initialize when localStorage is
    // unavailable; the normal in-memory/browser lifecycle applies there.
  }
};

export const isNewRustCryptoStoreAllowed = (session: RustCryptoSessionIdentity): boolean => {
  try {
    const value = global.localStorage.getItem(getRustCryptoStoreCreationKey(session));
    if (!value) return false;
    const createdAt = Number(value);
    return Number.isFinite(createdAt) && Date.now() - createdAt <= STORE_CREATION_ALLOWANCE_MS;
  } catch {
    return true;
  }
};

export const clearNewRustCryptoStoreAllowance = (session: RustCryptoSessionIdentity): void => {
  try {
    global.localStorage.removeItem(getRustCryptoStoreCreationKey(session));
  } catch {
    // Nothing to clean when localStorage is unavailable.
  }
};
