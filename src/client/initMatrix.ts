import { createClient, MatrixClient, IndexedDBStore, IndexedDBCryptoStore } from 'matrix-js-sdk';

import { cryptoCallbacks } from './secretStorageKeys';
import { getSettings } from '../app/state/settings';
import { clearNavToActivePathStore } from '../app/state/navToActivePath';
import { pushSessionToSW } from '../sw-session';

type Session = {
  baseUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
};

const patchedReadReceiptClients = new WeakSet<MatrixClient>();

const shouldBlockReadReceipts = () => !getSettings().sendReadReceipts;

const isReadReceiptPath = (path: string) =>
  path.includes('/receipt/') ||
  path.includes('/read_markers') ||
  path.includes('/account_data/m.fully_read');

const patchReadReceiptTransport = (mx: MatrixClient) => {
  if (patchedReadReceiptClients.has(mx)) return;
  patchedReadReceiptClients.add(mx);

  const originalSendReceipt = mx.sendReceipt.bind(mx);
  mx.sendReceipt = ((
    ...args: Parameters<MatrixClient['sendReceipt']>
  ): ReturnType<MatrixClient['sendReceipt']> => {
    const [, receiptType] = args;
    if (shouldBlockReadReceipts() && (receiptType === 'm.read' || receiptType === 'm.read.private')) {
      return Promise.resolve({}) as ReturnType<MatrixClient['sendReceipt']>;
    }
    return originalSendReceipt(...args);
  }) as MatrixClient['sendReceipt'];

  const originalSendReadReceipt = mx.sendReadReceipt.bind(mx);
  mx.sendReadReceipt = ((
    ...args: Parameters<MatrixClient['sendReadReceipt']>
  ): ReturnType<MatrixClient['sendReadReceipt']> => {
    if (shouldBlockReadReceipts()) {
      return Promise.resolve({}) as ReturnType<MatrixClient['sendReadReceipt']>;
    }
    return originalSendReadReceipt(...args);
  }) as MatrixClient['sendReadReceipt'];

  const originalSetRoomReadMarkers = mx.setRoomReadMarkers.bind(mx);
  mx.setRoomReadMarkers = ((
    ...args: Parameters<MatrixClient['setRoomReadMarkers']>
  ): ReturnType<MatrixClient['setRoomReadMarkers']> => {
    if (shouldBlockReadReceipts()) {
      return Promise.resolve({}) as ReturnType<MatrixClient['setRoomReadMarkers']>;
    }
    return originalSetRoomReadMarkers(...args);
  }) as MatrixClient['setRoomReadMarkers'];

  const originalSetRoomReadMarkersHttpRequest = mx.setRoomReadMarkersHttpRequest.bind(mx);
  mx.setRoomReadMarkersHttpRequest = ((
    ...args: Parameters<MatrixClient['setRoomReadMarkersHttpRequest']>
  ): ReturnType<MatrixClient['setRoomReadMarkersHttpRequest']> => {
    if (shouldBlockReadReceipts()) {
      return Promise.resolve({}) as ReturnType<MatrixClient['setRoomReadMarkersHttpRequest']>;
    }
    return originalSetRoomReadMarkersHttpRequest(...args);
  }) as MatrixClient['setRoomReadMarkersHttpRequest'];

  const originalSetRoomAccountData = mx.setRoomAccountData.bind(mx);
  mx.setRoomAccountData = ((
    ...args: Parameters<MatrixClient['setRoomAccountData']>
  ): ReturnType<MatrixClient['setRoomAccountData']> => {
    const [, eventType] = args;
    if (shouldBlockReadReceipts() && eventType === 'm.fully_read') {
      return Promise.resolve({}) as ReturnType<MatrixClient['setRoomAccountData']>;
    }
    return originalSetRoomAccountData(...args);
  }) as MatrixClient['setRoomAccountData'];

  const originalAuthedRequest = mx.http.authedRequest.bind(mx.http);
  mx.http.authedRequest = ((
    ...args: Parameters<typeof mx.http.authedRequest>
  ): ReturnType<typeof mx.http.authedRequest> => {
    const [, path] = args;
    if (typeof path === 'string' && shouldBlockReadReceipts() && isReadReceiptPath(path)) {
      return Promise.resolve({}) as ReturnType<typeof mx.http.authedRequest>;
    }
    return originalAuthedRequest(...args);
  }) as typeof mx.http.authedRequest;
};

export const initClient = async (session: Session): Promise<MatrixClient> => {
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
  await mx.initRustCrypto();
  patchReadReceiptTransport(mx);

  mx.setMaxListeners(50);

  return mx;
};

export const startClient = async (mx: MatrixClient) => {
  await mx.setSyncPresence?.(getSettings().presenceVisibility);
  await mx.startClient({
    lazyLoadMembers: true,
  });
};

export const clearCacheAndReload = async (mx: MatrixClient) => {
  mx.stopClient();
  clearNavToActivePathStore(mx.getSafeUserId());
  await mx.store.deleteAllData();
  window.location.reload();
};

export const logoutClient = async (mx: MatrixClient) => {
  pushSessionToSW();
  mx.stopClient();
  try {
    await mx.logout();
  } catch {
    // ignore if failed to logout
  }
  await mx.clearStores();
  window.localStorage.clear();
  window.location.reload();
};

export const clearLoginData = async () => {
  const dbs = await window.indexedDB.databases();

  dbs.forEach((idbInfo) => {
    const { name } = idbInfo;
    if (name) {
      window.indexedDB.deleteDatabase(name);
    }
  });

  window.localStorage.clear();
  window.location.reload();
};
