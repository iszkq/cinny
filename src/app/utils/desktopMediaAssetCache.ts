import { isDesktopUpdaterSupported } from './desktopUpdater';

type DesktopMediaPriority = 'visible' | 'background';

type DesktopMediaTask = {
  cacheKey: string;
  accountKey: string;
  sourceUrl: string;
  mimeType?: string;
  priority: DesktopMediaPriority;
  resolve: (value: string | undefined) => void;
};

const DESKTOP_MEDIA_PRELOAD_CONCURRENCY = 2;

type FallbackSession = {
  baseUrl: string;
  userId: string;
};

const cachedDesktopMediaAssetUrls = new Map<string, string>();
const pendingDesktopMediaAssetUrls = new Map<string, Promise<string | undefined>>();
const queuedDesktopMediaTasks = new Map<string, DesktopMediaTask>();
const visibleDesktopMediaQueue: DesktopMediaTask[] = [];
const backgroundDesktopMediaQueue: DesktopMediaTask[] = [];
let activeDesktopMediaTasks = 0;

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

  if (!baseUrl || !userId) {
    return undefined;
  }

  return {
    baseUrl,
    userId,
  };
};

const getDesktopMediaAccountKey = (): string | undefined => {
  const session = getDesktopFallbackSession();
  if (!session) {
    return undefined;
  }

  return `${normalizeBaseUrl(session.baseUrl)}::${session.userId.trim().toLowerCase()}`;
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

const cacheDesktopMediaAssetOnDisk = async (
  accountKey: string,
  sourceUrl: string,
  mimeType?: string
): Promise<string | undefined> => {
  const { convertFileSrc, invoke } = await import('@tauri-apps/api/core');
  const localPath = await invoke<string>('cache_desktop_media_asset', {
    request: {
      accountKey,
      sourceUrl,
      mimeType,
    },
  });

  return localPath ? convertFileSrc(localPath) : undefined;
};

const flushDesktopMediaQueue = () => {
  while (
    activeDesktopMediaTasks < DESKTOP_MEDIA_PRELOAD_CONCURRENCY &&
    (visibleDesktopMediaQueue.length > 0 || backgroundDesktopMediaQueue.length > 0)
  ) {
    const task = visibleDesktopMediaQueue.shift() ?? backgroundDesktopMediaQueue.shift();
    if (!task) {
      return;
    }

    queuedDesktopMediaTasks.delete(task.cacheKey);
    activeDesktopMediaTasks += 1;

    cacheDesktopMediaAssetOnDisk(task.accountKey, task.sourceUrl, task.mimeType)
      .catch(() => undefined)
      .then((assetUrl) => {
        if (assetUrl) {
          cachedDesktopMediaAssetUrls.set(task.cacheKey, assetUrl);
        }

        task.resolve(assetUrl);
      })
      .finally(() => {
        pendingDesktopMediaAssetUrls.delete(task.cacheKey);
        activeDesktopMediaTasks -= 1;
        flushDesktopMediaQueue();
      });
  }
};

export const primeDesktopMediaAssetUrl = (
  sourceUrl?: string,
  priority: DesktopMediaPriority = 'background',
  mimeType?: string
): Promise<string | undefined> | undefined => {
  if (!isDesktopUpdaterSupported() || !sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    return undefined;
  }

  const accountKey = getDesktopMediaAccountKey();
  if (!accountKey) {
    return undefined;
  }

  const cacheKey = `${accountKey}::${normalizeSourceForKey(sourceUrl)}`;
  const cachedAssetUrl = cachedDesktopMediaAssetUrls.get(cacheKey);
  if (cachedAssetUrl) {
    return Promise.resolve(cachedAssetUrl);
  }

  const pendingAssetUrl = pendingDesktopMediaAssetUrls.get(cacheKey);
  if (pendingAssetUrl) {
    if (priority === 'visible') {
      promoteDesktopMediaTask(cacheKey);
    }
    return pendingAssetUrl;
  }

  const taskPromise = new Promise<string | undefined>((resolve) => {
    const task: DesktopMediaTask = {
      cacheKey,
      accountKey,
      sourceUrl,
      mimeType,
      priority,
      resolve,
    };

    queuedDesktopMediaTasks.set(cacheKey, task);
    if (priority === 'visible') {
      visibleDesktopMediaQueue.push(task);
    } else {
      backgroundDesktopMediaQueue.push(task);
    }
  });

  pendingDesktopMediaAssetUrls.set(cacheKey, taskPromise);
  window.setTimeout(flushDesktopMediaQueue, 0);

  return taskPromise;
};
