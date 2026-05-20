import {
  createClient,
  MatrixClient,
  IndexedDBStore,
  IndexedDBCryptoStore,
  ReceiptType,
} from 'matrix-js-sdk';

import { cryptoCallbacks } from './secretStorageKeys';
import { getSettings } from '../app/state/settings';
import { clearNavToActivePathStore } from '../app/state/navToActivePath';
import { attachMediaAccessToken } from '../app/utils/matrix';
import { restorePinLockStorage, snapshotPinLockStorage } from '../app/utils/pinLock';
import { pushSessionToSW } from '../sw-session';

type Session = {
  baseUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
};

const SYNC_POLL_TIMEOUT_MS = 30000;
const PRIVATE_RECEIPT_TYPE = 'm.read.private' as ReceiptType;

const patchedReadReceiptClients = new WeakSet<MatrixClient>();
const syncTransportDiagnostics = new WeakMap<MatrixClient, SyncTransportDiagnostics>();
let globalReadReceiptFetchPatched = false;

type SyncTransportDiagnostics = {
  lastRequestAt: number;
  lastResponseAt: number;
  lastErrorAt: number;
};

const shouldBlockReadReceipts = () => !getSettings().sendReadReceipts;

const isReadReceiptPath = (path: string) =>
  path.includes('/receipt/m.read') && !path.includes('/receipt/m.read.private');

const isSyncPath = (path: string) => path.includes('/sync');

const getRequestPath = (pathOrUrl: string) => {
  try {
    const baseOrigin =
      typeof window !== 'undefined' ? window.location.origin : 'https://app.cinny.in';
    return new URL(pathOrUrl, baseOrigin).pathname;
  } catch {
    return pathOrUrl;
  }
};

const getOrCreateSyncTransportDiagnostics = (mx: MatrixClient): SyncTransportDiagnostics => {
  const currentDiagnostics = syncTransportDiagnostics.get(mx);
  if (currentDiagnostics) {
    return currentDiagnostics;
  }

  const nextDiagnostics: SyncTransportDiagnostics = {
    lastRequestAt: 0,
    lastResponseAt: 0,
    lastErrorAt: 0,
  };
  syncTransportDiagnostics.set(mx, nextDiagnostics);
  return nextDiagnostics;
};

export const getSyncTransportDiagnostics = (mx: MatrixClient): SyncTransportDiagnostics =>
  getOrCreateSyncTransportDiagnostics(mx);

const trackSyncTransportRequest = async <T>(
  mx: MatrixClient,
  request: () => Promise<T>
): Promise<T> => {
  const diagnostics = getOrCreateSyncTransportDiagnostics(mx);
  diagnostics.lastRequestAt = Date.now();

  try {
    const result = await request();
    diagnostics.lastResponseAt = Date.now();
    return result;
  } catch (error) {
    diagnostics.lastErrorAt = Date.now();
    throw error;
  }
};

const shouldBlockReadReceiptRequest = (method: string | undefined, pathOrUrl: string) => {
  const normalizedMethod = (method ?? 'GET').toUpperCase();
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD') return false;
  return shouldBlockReadReceipts() && isReadReceiptPath(getRequestPath(pathOrUrl));
};

const createBlockedReadReceiptResponse = () =>
  new Response('{}', {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const patchGlobalReadReceiptFetch = () => {
  if (globalReadReceiptFetchPatched || typeof globalThis.fetch !== 'function') return;
  globalReadReceiptFetchPatched = true;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = ((
    input: RequestInfo | URL,
    init?: RequestInit
  ): ReturnType<typeof globalThis.fetch> => {
    const requestUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
    const requestMethod =
      init?.method ??
      (typeof Request !== 'undefined' && input instanceof Request ? input.method : undefined);

    if (shouldBlockReadReceiptRequest(requestMethod, requestUrl)) {
      return Promise.resolve(createBlockedReadReceiptResponse()) as ReturnType<
        typeof globalThis.fetch
      >;
    }

    return originalFetch(input, init);
  }) as typeof globalThis.fetch;
};

const patchReadReceiptTransport = (mx: MatrixClient) => {
  if (patchedReadReceiptClients.has(mx)) return;
  patchedReadReceiptClients.add(mx);

  const originalSendReceipt = mx.sendReceipt.bind(mx);
  mx.sendReceipt = ((
    ...args: Parameters<MatrixClient['sendReceipt']>
  ): ReturnType<MatrixClient['sendReceipt']> => {
    const [event, receiptType, body, unthreaded] = args;
    if (shouldBlockReadReceipts() && receiptType === ReceiptType.Read) {
      return originalSendReceipt(
        event,
        PRIVATE_RECEIPT_TYPE,
        body,
        unthreaded
      ) as ReturnType<MatrixClient['sendReceipt']>;
    }
    return originalSendReceipt(...args);
  }) as MatrixClient['sendReceipt'];

  const originalSendReadReceipt = mx.sendReadReceipt.bind(mx);
  mx.sendReadReceipt = ((
    ...args: Parameters<MatrixClient['sendReadReceipt']>
  ): ReturnType<MatrixClient['sendReadReceipt']> => {
    const [event, receiptType, unthreaded] = args;
    if (shouldBlockReadReceipts() && (!receiptType || receiptType === ReceiptType.Read)) {
      return originalSendReadReceipt(
        event,
        PRIVATE_RECEIPT_TYPE,
        unthreaded
      ) as ReturnType<MatrixClient['sendReadReceipt']>;
    }
    return originalSendReadReceipt(...args);
  }) as MatrixClient['sendReadReceipt'];

  const originalSetRoomReadMarkers = mx.setRoomReadMarkers.bind(mx);
  mx.setRoomReadMarkers = ((
    ...args: Parameters<MatrixClient['setRoomReadMarkers']>
  ): ReturnType<MatrixClient['setRoomReadMarkers']> => {
    if (shouldBlockReadReceipts()) {
      const [roomId, rmEventId, rrEvent, rpEvent] = args;
      return originalSetRoomReadMarkers(
        roomId,
        rmEventId,
        undefined,
        rpEvent ?? rrEvent
      ) as ReturnType<MatrixClient['setRoomReadMarkers']>;
    }
    return originalSetRoomReadMarkers(...args);
  }) as MatrixClient['setRoomReadMarkers'];

  const originalSetRoomReadMarkersHttpRequest = mx.setRoomReadMarkersHttpRequest.bind(mx);
  mx.setRoomReadMarkersHttpRequest = ((
    ...args: Parameters<MatrixClient['setRoomReadMarkersHttpRequest']>
  ): ReturnType<MatrixClient['setRoomReadMarkersHttpRequest']> => {
    if (shouldBlockReadReceipts()) {
      const [roomId, rmEventId, rrEventId, rpEventId] = args;
      return originalSetRoomReadMarkersHttpRequest(
        roomId,
        rmEventId,
        undefined,
        rpEventId ?? rrEventId
      ) as ReturnType<MatrixClient['setRoomReadMarkersHttpRequest']>;
    }
    return originalSetRoomReadMarkersHttpRequest(...args);
  }) as MatrixClient['setRoomReadMarkersHttpRequest'];

  const originalAuthedRequest = mx.http.authedRequest.bind(mx.http);
  mx.http.authedRequest = ((
    ...args: Parameters<typeof mx.http.authedRequest>
  ): ReturnType<typeof mx.http.authedRequest> => {
    const [method, path] = args;
    if (typeof path === 'string' && shouldBlockReadReceiptRequest(method, path)) {
      return Promise.resolve({}) as ReturnType<typeof mx.http.authedRequest>;
    }

    if (typeof path === 'string' && isSyncPath(getRequestPath(path))) {
      return trackSyncTransportRequest(mx, () => originalAuthedRequest(...args)) as ReturnType<
        typeof mx.http.authedRequest
      >;
    }

    return originalAuthedRequest(...args);
  }) as typeof mx.http.authedRequest;

  if (typeof mx.http.request === 'function') {
    const originalRequest = mx.http.request.bind(mx.http);
    mx.http.request = ((...args: Parameters<typeof mx.http.request>) => {
      const [method, path] = args;
      if (typeof path === 'string' && shouldBlockReadReceiptRequest(method, path)) {
        return Promise.resolve({}) as ReturnType<typeof mx.http.request>;
      }

      if (typeof path === 'string' && isSyncPath(getRequestPath(path))) {
        return trackSyncTransportRequest(mx, () => originalRequest(...args)) as ReturnType<
          typeof mx.http.request
        >;
      }

      return originalRequest(...args);
    }) as typeof mx.http.request;
  }

  if (typeof mx.http.requestOtherUrl === 'function') {
    const originalRequestOtherUrl = mx.http.requestOtherUrl.bind(mx.http);
    mx.http.requestOtherUrl = ((...args: Parameters<typeof mx.http.requestOtherUrl>) => {
      const [method, path] = args;
      if (typeof path === 'string' && shouldBlockReadReceiptRequest(method, path)) {
        return Promise.resolve({}) as ReturnType<typeof mx.http.requestOtherUrl>;
      }

      if (typeof path === 'string' && isSyncPath(getRequestPath(path))) {
        return trackSyncTransportRequest(
          mx,
          () => originalRequestOtherUrl(...args)
        ) as ReturnType<typeof mx.http.requestOtherUrl>;
      }

      return originalRequestOtherUrl(...args);
    }) as typeof mx.http.requestOtherUrl;
  }
};

const patchMediaUrlBuilder = (mx: MatrixClient, session: Session) => {
  const originalMxcUrlToHttp = mx.mxcUrlToHttp.bind(mx);

  mx.mxcUrlToHttp = ((...args: Parameters<MatrixClient['mxcUrlToHttp']>) => {
    const mediaUrl = originalMxcUrlToHttp(...args);
    const useAuthentication = Boolean(args[6]);

    return attachMediaAccessToken(
      mediaUrl,
      useAuthentication ? session.accessToken : undefined,
      session.baseUrl
    );
  }) as MatrixClient['mxcUrlToHttp'];
};

export const initClient = async (session: Session): Promise<MatrixClient> => {
  patchGlobalReadReceiptFetch();

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

  patchMediaUrlBuilder(mx, session);

  await indexedDBStore.startup();
  await mx.initRustCrypto();
  patchReadReceiptTransport(mx);

  mx.setMaxListeners(50);

  return mx;
};

export const startClient = async (mx: MatrixClient) => {
  await mx.setSyncPresence?.(getSettings().presenceVisibility);
  await mx.startClient({
    lazyLoadMembers: true,
    pollTimeout: SYNC_POLL_TIMEOUT_MS,
  });
};

const clearAllServiceWorkerCaches = async () => {
  if (typeof window === 'undefined' || typeof window.caches === 'undefined') {
    return;
  }

  const cacheKeys = await window.caches.keys();
  await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
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
  await clearAllServiceWorkerCaches();
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

  const preservedPinLockEntries = snapshotPinLockStorage();
  window.localStorage.clear();
  restorePinLockStorage(preservedPinLockEntries);
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
