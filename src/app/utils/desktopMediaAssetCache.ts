import { isDesktopUpdaterSupported } from './desktopUpdater';
import { revokeObjectUrlWhenPossible } from './objectUrlRetainer';

type DesktopMediaPriority = 'visible' | 'background';

type DesktopMediaAssetPayload = {
  dataBase64: string;
  mimeType?: string;
};

export type DesktopMediaAssetBytes = {
  bytes: Uint8Array;
  mimeType?: string;
};

type DesktopMediaIdentity = {
  accountKey: string;
  accessToken: string;
  cacheKey: string;
};

type DesktopMediaTask = {
  cacheKey: string;
  accountKey: string;
  sourceUrl: string;
  mimeType?: string;
  priority: DesktopMediaPriority;
  resolve: (value: DesktopMediaAssetPayload | undefined) => void;
};

type DesktopMediaWarmTask = {
  cacheKey: string;
  accountKey: string;
  sourceUrl: string;
  mimeType?: string;
  priority: DesktopMediaPriority;
  resolve: (value: boolean) => void;
};

const DESKTOP_MEDIA_READ_CONCURRENCY = 4;
const DESKTOP_MEDIA_WARM_CONCURRENCY = 2;

type FallbackSession = {
  baseUrl: string;
  userId: string;
  accessToken: string;
};

const cachedDesktopMediaAssetUrls = new Map<string, string>();
const pendingDesktopMediaAssetPayloads = new Map<
  string,
  Promise<DesktopMediaAssetPayload | undefined>
>();
const pendingDesktopMediaAssetUrls = new Map<string, Promise<string | undefined>>();
const pendingDesktopMediaWarmTasks = new Map<string, Promise<boolean>>();
const queuedDesktopMediaTasks = new Map<string, DesktopMediaTask>();
const queuedDesktopMediaWarmTasks = new Map<string, DesktopMediaWarmTask>();
const visibleDesktopMediaQueue: DesktopMediaTask[] = [];
const backgroundDesktopMediaQueue: DesktopMediaTask[] = [];
const visibleDesktopMediaWarmQueue: DesktopMediaWarmTask[] = [];
const backgroundDesktopMediaWarmQueue: DesktopMediaWarmTask[] = [];
let activeDesktopMediaTasks = 0;
let activeDesktopMediaWarmTasks = 0;
let desktopMediaCleanupBound = false;
let currentDesktopMediaAccountKey: string | undefined;

const normalizeBaseUrl = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).origin.toLowerCase();
  } catch {
    return baseUrl.trim().toLowerCase();
  }
};

const getDesktopFallbackSession = (): FallbackSession | undefined => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return undefined;
  }

  const baseUrl = window.localStorage.getItem('cinny_hs_base_url');
  const userId = window.localStorage.getItem('cinny_user_id');
  const accessToken = window.localStorage.getItem('cinny_access_token');

  if (!baseUrl || !userId || !accessToken) {
    return undefined;
  }

  return {
    baseUrl,
    userId,
    accessToken,
  };
};

const normalizeSourceForKey = (sourceUrl: string): string => {
  try {
    const parsed = new URL(sourceUrl);
    parsed.searchParams.delete('access_token');

    const sortedSearchParams = Array.from(parsed.searchParams.entries()).sort((left, right) =>
      left[0] === right[0] ? left[1].localeCompare(right[1]) : left[0].localeCompare(right[0])
    );
    parsed.search = '';

    sortedSearchParams.forEach(([key, value]) => {
      parsed.searchParams.append(key, value);
    });

    return parsed.toString();
  } catch {
    return sourceUrl;
  }
};

const clearDesktopMediaAssetUrlCache = () => {
  cachedDesktopMediaAssetUrls.forEach((assetUrl) => {
    revokeObjectUrlWhenPossible(assetUrl);
  });
  cachedDesktopMediaAssetUrls.clear();
  pendingDesktopMediaAssetUrls.clear();
};

const syncDesktopMediaAccountKey = (accountKey: string) => {
  if (currentDesktopMediaAccountKey === accountKey) {
    return;
  }

  currentDesktopMediaAccountKey = accountKey;
  clearDesktopMediaAssetUrlCache();
};

const bindDesktopMediaCleanup = () => {
  if (desktopMediaCleanupBound || typeof window === 'undefined') {
    return;
  }

  desktopMediaCleanupBound = true;
  window.addEventListener(
    'pagehide',
    () => {
      clearDesktopMediaAssetUrlCache();
      pendingDesktopMediaAssetPayloads.clear();
      pendingDesktopMediaWarmTasks.clear();
      queuedDesktopMediaTasks.clear();
      queuedDesktopMediaWarmTasks.clear();
      visibleDesktopMediaQueue.length = 0;
      backgroundDesktopMediaQueue.length = 0;
      visibleDesktopMediaWarmQueue.length = 0;
      backgroundDesktopMediaWarmQueue.length = 0;
    },
    { once: true }
  );
};

const getDesktopMediaIdentity = (sourceUrl: string): DesktopMediaIdentity | undefined => {
  const session = getDesktopFallbackSession();
  if (!session) {
    return undefined;
  }

  const accountKey = `${normalizeBaseUrl(session.baseUrl)}::${session.userId.trim().toLowerCase()}`;
  syncDesktopMediaAccountKey(accountKey);

  return {
    accountKey,
    accessToken: session.accessToken,
    cacheKey: `${accountKey}::${normalizeSourceForKey(sourceUrl)}`,
  };
};

const removeQueuedDesktopMediaTask = (queue: DesktopMediaTask[], cacheKey: string) => {
  const queueIndex = queue.findIndex((task) => task.cacheKey === cacheKey);
  if (queueIndex >= 0) {
    queue.splice(queueIndex, 1);
  }
};

const promoteDesktopMediaTask = (cacheKey: string) => {
  const queuedTask = queuedDesktopMediaTasks.get(cacheKey);
  if (!queuedTask || queuedTask.priority === 'visible') {
    return;
  }

  removeQueuedDesktopMediaTask(backgroundDesktopMediaQueue, cacheKey);
  queuedTask.priority = 'visible';
  visibleDesktopMediaQueue.push(queuedTask);
};

const removeQueuedDesktopMediaWarmTask = (queue: DesktopMediaWarmTask[], cacheKey: string) => {
  const queueIndex = queue.findIndex((task) => task.cacheKey === cacheKey);
  if (queueIndex >= 0) {
    queue.splice(queueIndex, 1);
  }
};

const promoteDesktopMediaWarmTask = (cacheKey: string) => {
  const queuedTask = queuedDesktopMediaWarmTasks.get(cacheKey);
  if (!queuedTask || queuedTask.priority === 'visible') {
    return;
  }

  removeQueuedDesktopMediaWarmTask(backgroundDesktopMediaWarmQueue, cacheKey);
  queuedTask.priority = 'visible';
  visibleDesktopMediaWarmQueue.push(queuedTask);
};

const decodeDesktopMediaBase64 = (dataBase64: string): Uint8Array => {
  const binary = window.atob(dataBase64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const payloadToObjectUrl = (payload: DesktopMediaAssetPayload): string => {
  const bytes = decodeDesktopMediaBase64(payload.dataBase64);
  const mediaBlob = payload.mimeType
    ? new Blob([bytes], { type: payload.mimeType })
    : new Blob([bytes]);

  return URL.createObjectURL(mediaBlob);
};

const storeDesktopMediaAssetUrl = (cacheKey: string, assetUrl: string) => {
  const previousAssetUrl = cachedDesktopMediaAssetUrls.get(cacheKey);
  if (previousAssetUrl && previousAssetUrl !== assetUrl) {
    revokeObjectUrlWhenPossible(previousAssetUrl);
  }

  cachedDesktopMediaAssetUrls.set(cacheKey, assetUrl);
};

const cacheDesktopMediaAssetOnDisk = async (
  accountKey: string,
  sourceUrl: string,
  accessToken: string,
  mimeType?: string
): Promise<boolean> => {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<boolean>('cache_desktop_media_asset', {
    request: {
      accountKey,
      sourceUrl,
      accessToken,
      mimeType,
    },
  });
};

const readDesktopMediaAssetPayload = async (
  accountKey: string,
  sourceUrl: string,
  accessToken: string,
  mimeType?: string
): Promise<DesktopMediaAssetPayload | undefined> => {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DesktopMediaAssetPayload>('read_desktop_media_asset', {
    request: {
      accountKey,
      sourceUrl,
      accessToken,
      mimeType,
    },
  });
};

const flushDesktopMediaQueue = () => {
  while (
    activeDesktopMediaTasks < DESKTOP_MEDIA_READ_CONCURRENCY &&
    (visibleDesktopMediaQueue.length > 0 || backgroundDesktopMediaQueue.length > 0)
  ) {
    const task = visibleDesktopMediaQueue.shift() ?? backgroundDesktopMediaQueue.shift();
    if (!task) {
      return;
    }

    queuedDesktopMediaTasks.delete(task.cacheKey);
    activeDesktopMediaTasks += 1;

    const identity = getDesktopMediaIdentity(task.sourceUrl);
    if (!identity || identity.accountKey !== task.accountKey) {
      pendingDesktopMediaAssetPayloads.delete(task.cacheKey);
      activeDesktopMediaTasks -= 1;
      task.resolve(undefined);
      continue;
    }

    readDesktopMediaAssetPayload(
      task.accountKey,
      task.sourceUrl,
      identity.accessToken,
      task.mimeType
    )
      .catch(() => undefined)
      .then((payload) => {
        if (currentDesktopMediaAccountKey !== task.accountKey) {
          task.resolve(undefined);
          return;
        }

        task.resolve(payload);
      })
      .finally(() => {
        pendingDesktopMediaAssetPayloads.delete(task.cacheKey);
        activeDesktopMediaTasks -= 1;
        flushDesktopMediaQueue();
      });
  }
};

const flushDesktopMediaWarmQueue = () => {
  while (
    activeDesktopMediaWarmTasks < DESKTOP_MEDIA_WARM_CONCURRENCY &&
    (visibleDesktopMediaWarmQueue.length > 0 || backgroundDesktopMediaWarmQueue.length > 0)
  ) {
    const task =
      visibleDesktopMediaWarmQueue.shift() ?? backgroundDesktopMediaWarmQueue.shift();
    if (!task) {
      return;
    }

    queuedDesktopMediaWarmTasks.delete(task.cacheKey);
    activeDesktopMediaWarmTasks += 1;

    const identity = getDesktopMediaIdentity(task.sourceUrl);
    if (!identity || identity.accountKey !== task.accountKey) {
      pendingDesktopMediaWarmTasks.delete(task.cacheKey);
      activeDesktopMediaWarmTasks -= 1;
      task.resolve(false);
      continue;
    }

    cacheDesktopMediaAssetOnDisk(
      task.accountKey,
      task.sourceUrl,
      identity.accessToken,
      task.mimeType
    )
      .catch(() => false)
      .then((warmed) => {
        if (currentDesktopMediaAccountKey !== task.accountKey) {
          task.resolve(false);
          return;
        }

        task.resolve(warmed);
      })
      .finally(() => {
        pendingDesktopMediaWarmTasks.delete(task.cacheKey);
        activeDesktopMediaWarmTasks -= 1;
        flushDesktopMediaWarmQueue();
      });
  }
};

const waitForDesktopMediaWarmThenRead = (
  identity: DesktopMediaIdentity,
  sourceUrl: string,
  priority: DesktopMediaPriority,
  mimeType?: string
): Promise<DesktopMediaAssetPayload | undefined> | undefined => {
  const pendingWarmTask = pendingDesktopMediaWarmTasks.get(identity.cacheKey);
  if (!pendingWarmTask) {
    return undefined;
  }

  if (priority === 'visible') {
    promoteDesktopMediaWarmTask(identity.cacheKey);
  }

  const payloadPromise = pendingWarmTask
    .catch(() => false)
    .then(async () => {
      const latestIdentity = getDesktopMediaIdentity(sourceUrl);
      if (!latestIdentity || latestIdentity.accountKey !== identity.accountKey) {
        return undefined;
      }

      return readDesktopMediaAssetPayload(
        identity.accountKey,
        sourceUrl,
        latestIdentity.accessToken,
        mimeType
      ).catch(() => undefined);
    })
    .finally(() => {
      pendingDesktopMediaAssetPayloads.delete(identity.cacheKey);
    });

  pendingDesktopMediaAssetPayloads.set(identity.cacheKey, payloadPromise);
  return payloadPromise;
};

const primeDesktopMediaAssetPayload = (
  sourceUrl: string,
  priority: DesktopMediaPriority,
  mimeType?: string
): Promise<DesktopMediaAssetPayload | undefined> | undefined => {
  const identity = getDesktopMediaIdentity(sourceUrl);
  if (!identity) {
    return undefined;
  }

  bindDesktopMediaCleanup();

  const pendingPayload = pendingDesktopMediaAssetPayloads.get(identity.cacheKey);
  if (pendingPayload) {
    if (priority === 'visible') {
      promoteDesktopMediaTask(identity.cacheKey);
    }
    return pendingPayload;
  }

  const pendingWarmPayload = waitForDesktopMediaWarmThenRead(
    identity,
    sourceUrl,
    priority,
    mimeType
  );
  if (pendingWarmPayload) {
    return pendingWarmPayload;
  }

  const payloadPromise = new Promise<DesktopMediaAssetPayload | undefined>((resolve) => {
    const task: DesktopMediaTask = {
      cacheKey: identity.cacheKey,
      accountKey: identity.accountKey,
      sourceUrl,
      mimeType,
      priority,
      resolve,
    };

    queuedDesktopMediaTasks.set(identity.cacheKey, task);
    if (priority === 'visible') {
      visibleDesktopMediaQueue.push(task);
    } else {
      backgroundDesktopMediaQueue.push(task);
    }
  });

  pendingDesktopMediaAssetPayloads.set(identity.cacheKey, payloadPromise);
  window.setTimeout(flushDesktopMediaQueue, 0);

  return payloadPromise;
};

export const warmDesktopMediaAssetCache = (
  sourceUrl?: string,
  priority: DesktopMediaPriority = 'background',
  mimeType?: string
): Promise<boolean> | undefined => {
  if (!isDesktopUpdaterSupported() || !sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    return undefined;
  }

  const identity = getDesktopMediaIdentity(sourceUrl);
  if (!identity) {
    return undefined;
  }

  bindDesktopMediaCleanup();

  if (cachedDesktopMediaAssetUrls.has(identity.cacheKey)) {
    return Promise.resolve(true);
  }

  const pendingPayloadTask = pendingDesktopMediaAssetPayloads.get(identity.cacheKey);
  if (pendingPayloadTask) {
    if (priority === 'visible') {
      promoteDesktopMediaTask(identity.cacheKey);
    }

    return pendingPayloadTask.then((payload) => Boolean(payload));
  }

  const pendingWarmTask = pendingDesktopMediaWarmTasks.get(identity.cacheKey);
  if (pendingWarmTask) {
    if (priority === 'visible') {
      promoteDesktopMediaWarmTask(identity.cacheKey);
    }
    return pendingWarmTask;
  }

  const warmPromise = new Promise<boolean>((resolve) => {
    const task: DesktopMediaWarmTask = {
      cacheKey: identity.cacheKey,
      accountKey: identity.accountKey,
      sourceUrl,
      mimeType,
      priority,
      resolve,
    };

    queuedDesktopMediaWarmTasks.set(identity.cacheKey, task);
    if (priority === 'visible') {
      visibleDesktopMediaWarmQueue.push(task);
    } else {
      backgroundDesktopMediaWarmQueue.push(task);
    }
  });

  pendingDesktopMediaWarmTasks.set(identity.cacheKey, warmPromise);
  window.setTimeout(flushDesktopMediaWarmQueue, 0);

  return warmPromise;
};

export const loadDesktopMediaAssetBytes = (
  sourceUrl?: string,
  priority: DesktopMediaPriority = 'visible',
  mimeType?: string
): Promise<DesktopMediaAssetBytes | undefined> | undefined => {
  if (!isDesktopUpdaterSupported() || !sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    return undefined;
  }

  const payloadPromise = primeDesktopMediaAssetPayload(sourceUrl, priority, mimeType);
  if (!payloadPromise) {
    return undefined;
  }

  return payloadPromise.then((payload) => {
    if (!payload) {
      return undefined;
    }

    return {
      bytes: decodeDesktopMediaBase64(payload.dataBase64),
      mimeType: payload.mimeType,
    };
  });
};

export const primeDesktopMediaAssetUrl = (
  sourceUrl?: string,
  priority: DesktopMediaPriority = 'background',
  mimeType?: string
): Promise<string | undefined> | undefined => {
  if (!isDesktopUpdaterSupported() || !sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    return undefined;
  }

  const identity = getDesktopMediaIdentity(sourceUrl);
  if (!identity) {
    return undefined;
  }

  bindDesktopMediaCleanup();

  const cachedAssetUrl = cachedDesktopMediaAssetUrls.get(identity.cacheKey);
  if (cachedAssetUrl) {
    return Promise.resolve(cachedAssetUrl);
  }

  const pendingAssetUrl = pendingDesktopMediaAssetUrls.get(identity.cacheKey);
  if (pendingAssetUrl) {
    if (priority === 'visible') {
      promoteDesktopMediaTask(identity.cacheKey);
    }
    return pendingAssetUrl;
  }

  const payloadPromise = primeDesktopMediaAssetPayload(sourceUrl, priority, mimeType);
  if (!payloadPromise) {
    return undefined;
  }

  const assetUrlPromise = payloadPromise.then((payload) => {
    if (!payload || currentDesktopMediaAccountKey !== identity.accountKey) {
      return undefined;
    }

    const existingAssetUrl = cachedDesktopMediaAssetUrls.get(identity.cacheKey);
    if (existingAssetUrl) {
      return existingAssetUrl;
    }

    const assetUrl = payloadToObjectUrl(payload);
    storeDesktopMediaAssetUrl(identity.cacheKey, assetUrl);
    return assetUrl;
  });

  pendingDesktopMediaAssetUrls.set(identity.cacheKey, assetUrlPromise);
  return assetUrlPromise.finally(() => {
    pendingDesktopMediaAssetUrls.delete(identity.cacheKey);
  });
};
