import { isDesktopUpdaterSupported } from './desktopUpdater';
import { revokeObjectUrlWhenPossible } from './objectUrlRetainer';

type DesktopMediaPriority = 'visible' | 'background';

type DesktopMediaRuntimeAsset = {
  filePath: string;
  mimeType?: string;
};

type DesktopMediaIdentity = {
  accountKey: string;
  accessToken: string;
  cacheKey: string;
};

type DesktopMediaWarmTask = {
  cacheKey: string;
  accountKey: string;
  sourceUrl: string;
  mimeType?: string;
  priority: DesktopMediaPriority;
  resolve: (value: boolean) => void;
};

type DesktopMediaUrlTask = {
  cacheKey: string;
  accountKey: string;
  sourceUrl: string;
  mimeType?: string;
  priority: DesktopMediaPriority;
  resolve: (value: string | undefined) => void;
};

const DESKTOP_MEDIA_URL_CONCURRENCY = 16;
const DESKTOP_MEDIA_WARM_CONCURRENCY = 6;

type FallbackSession = {
  baseUrl: string;
  userId: string;
  accessToken: string;
};

const cachedDesktopMediaAssetUrls = new Map<string, string>();
const pendingDesktopMediaAssetUrls = new Map<string, Promise<string | undefined>>();
const pendingDesktopMediaWarmTasks = new Map<string, Promise<boolean>>();
const queuedDesktopMediaWarmTasks = new Map<string, DesktopMediaWarmTask>();
const queuedDesktopMediaUrlTasks = new Map<string, DesktopMediaUrlTask>();
const visibleDesktopMediaWarmQueue: DesktopMediaWarmTask[] = [];
const backgroundDesktopMediaWarmQueue: DesktopMediaWarmTask[] = [];
const visibleDesktopMediaUrlQueue: DesktopMediaUrlTask[] = [];
const backgroundDesktopMediaUrlQueue: DesktopMediaUrlTask[] = [];
let activeDesktopMediaWarmTasks = 0;
let activeDesktopMediaUrlTasks = 0;
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
      pendingDesktopMediaWarmTasks.clear();
      queuedDesktopMediaWarmTasks.clear();
      queuedDesktopMediaUrlTasks.clear();
      visibleDesktopMediaWarmQueue.length = 0;
      backgroundDesktopMediaWarmQueue.length = 0;
      visibleDesktopMediaUrlQueue.length = 0;
      backgroundDesktopMediaUrlQueue.length = 0;
      void clearDesktopMediaRuntimeCache();
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

export const getDesktopMediaAccountKey = (): string | undefined => {
  if (!isDesktopUpdaterSupported()) {
    return undefined;
  }

  const session = getDesktopFallbackSession();
  if (!session) {
    return undefined;
  }

  const accountKey = `${normalizeBaseUrl(session.baseUrl)}::${session.userId
    .trim()
    .toLowerCase()}`;
  syncDesktopMediaAccountKey(accountKey);
  return accountKey;
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

const removeQueuedDesktopMediaUrlTask = (queue: DesktopMediaUrlTask[], cacheKey: string) => {
  const queueIndex = queue.findIndex((task) => task.cacheKey === cacheKey);
  if (queueIndex >= 0) {
    queue.splice(queueIndex, 1);
  }
};

const promoteDesktopMediaUrlTask = (cacheKey: string) => {
  const queuedTask = queuedDesktopMediaUrlTasks.get(cacheKey);
  if (!queuedTask || queuedTask.priority === 'visible') {
    return;
  }

  removeQueuedDesktopMediaUrlTask(backgroundDesktopMediaUrlQueue, cacheKey);
  queuedTask.priority = 'visible';
  visibleDesktopMediaUrlQueue.push(queuedTask);
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

const prepareDesktopMediaAssetRuntimeUrl = async (
  accountKey: string,
  sourceUrl: string,
  accessToken: string,
  mimeType?: string
): Promise<string | undefined> => {
  const tauriCore = await import('@tauri-apps/api/core');
  const runtimeAsset = await tauriCore.invoke<DesktopMediaRuntimeAsset>(
    'prepare_desktop_media_asset_runtime_file',
    {
      request: {
        accountKey,
        sourceUrl,
        accessToken,
        mimeType,
      },
    }
  );

  if (!runtimeAsset.filePath) {
    return undefined;
  }

  return tauriCore.convertFileSrc(runtimeAsset.filePath);
};

export const clearDesktopMediaRuntimeCache = async (): Promise<void> => {
  if (!isDesktopUpdaterSupported()) {
    return;
  }

  clearDesktopMediaAssetUrlCache();

  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('clear_desktop_media_runtime_cache').catch(() => undefined);
};

export const clearDesktopMediaCache = async (): Promise<void> => {
  if (!isDesktopUpdaterSupported()) {
    return;
  }

  clearDesktopMediaAssetUrlCache();
  pendingDesktopMediaWarmTasks.clear();
  queuedDesktopMediaWarmTasks.clear();
  queuedDesktopMediaUrlTasks.clear();
  visibleDesktopMediaWarmQueue.length = 0;
  backgroundDesktopMediaWarmQueue.length = 0;
  visibleDesktopMediaUrlQueue.length = 0;
  backgroundDesktopMediaUrlQueue.length = 0;

  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('clear_desktop_media_cache').catch(() => undefined);
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

const resolveDesktopMediaUrlTask = async (
  task: DesktopMediaUrlTask
): Promise<string | undefined> => {
  const pendingWarmTask = pendingDesktopMediaWarmTasks.get(task.cacheKey);
  if (pendingWarmTask) {
    if (task.priority === 'visible') {
      promoteDesktopMediaWarmTask(task.cacheKey);
    }
    await pendingWarmTask.catch(() => false);
  }

  const identity = getDesktopMediaIdentity(task.sourceUrl);
  if (!identity || identity.accountKey !== task.accountKey) {
    return undefined;
  }

  return prepareDesktopMediaAssetRuntimeUrl(
    task.accountKey,
    task.sourceUrl,
    identity.accessToken,
    task.mimeType
  ).catch(() => undefined);
};

const flushDesktopMediaUrlQueue = () => {
  while (
    activeDesktopMediaUrlTasks < DESKTOP_MEDIA_URL_CONCURRENCY &&
    (visibleDesktopMediaUrlQueue.length > 0 || backgroundDesktopMediaUrlQueue.length > 0)
  ) {
    const task = visibleDesktopMediaUrlQueue.shift() ?? backgroundDesktopMediaUrlQueue.shift();
    if (!task) {
      return;
    }

    queuedDesktopMediaUrlTasks.delete(task.cacheKey);
    activeDesktopMediaUrlTasks += 1;

    resolveDesktopMediaUrlTask(task)
      .then((assetUrl) => {
        if (assetUrl && currentDesktopMediaAccountKey === task.accountKey) {
          storeDesktopMediaAssetUrl(task.cacheKey, assetUrl);
          task.resolve(assetUrl);
          return;
        }

        task.resolve(undefined);
      })
      .finally(() => {
        pendingDesktopMediaAssetUrls.delete(task.cacheKey);
        activeDesktopMediaUrlTasks -= 1;
        flushDesktopMediaUrlQueue();
      });
  }
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

  const pendingAssetUrl = pendingDesktopMediaAssetUrls.get(identity.cacheKey);
  if (pendingAssetUrl) {
    if (priority === 'visible') {
      promoteDesktopMediaUrlTask(identity.cacheKey);
    }

    return pendingAssetUrl.then((assetUrl) => Boolean(assetUrl));
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

export const getCachedDesktopMediaAssetUrl = (sourceUrl?: string): string | undefined => {
  if (!isDesktopUpdaterSupported() || !sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    return undefined;
  }

  const identity = getDesktopMediaIdentity(sourceUrl);
  if (!identity) {
    return undefined;
  }

  return cachedDesktopMediaAssetUrls.get(identity.cacheKey);
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
      promoteDesktopMediaUrlTask(identity.cacheKey);
    }
    return pendingAssetUrl;
  }

  const assetUrlPromise = new Promise<string | undefined>((resolve) => {
    const task: DesktopMediaUrlTask = {
      cacheKey: identity.cacheKey,
      accountKey: identity.accountKey,
      sourceUrl,
      mimeType,
      priority,
      resolve,
    };

    queuedDesktopMediaUrlTasks.set(identity.cacheKey, task);
    if (priority === 'visible') {
      visibleDesktopMediaUrlQueue.push(task);
    } else {
      backgroundDesktopMediaUrlQueue.push(task);
    }
  });

  pendingDesktopMediaAssetUrls.set(identity.cacheKey, assetUrlPromise);
  window.setTimeout(flushDesktopMediaUrlQueue, 0);

  return assetUrlPromise;
};
