import { revokeObjectUrlWhenPossible } from './objectUrlRetainer';
import { fetchMediaWithAuth } from './matrix';
import { getFallbackSession } from '../state/sessions';

const LEGACY_PERSISTENT_MEDIA_CACHE = 'cinny-auth-media-v2';
const PERSISTENT_MEDIA_CACHE_PREFIX = 'cinny-auth-media-v3';
const PERSISTENT_MEDIA_PRELOAD_CONCURRENCY = 2;
const OBJECT_URL_MEDIA_PRELOAD_CONCURRENCY = 2;
const FAILED_MEDIA_RETRY_DELAY_MS = 30 * 1000;
const FAILED_MEDIA_NOT_FOUND_RETRY_DELAY_MS = 5 * 60 * 1000;

type MediaCachePriority = 'visible' | 'background';

type DeviceMemoryNavigator = Navigator & {
  deviceMemory?: number;
};

const getObjectUrlMediaLimits = () => {
  const deviceMemory =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as DeviceMemoryNavigator).deviceMemory;

  if (typeof deviceMemory === 'number') {
    if (deviceMemory <= 4) {
      return {
        maxItems: 512,
        maxBytes: 128 * 1024 * 1024,
      };
    }

    if (deviceMemory >= 8) {
      return {
        maxItems: 2048,
        maxBytes: 384 * 1024 * 1024,
      };
    }
  }

  return {
    maxItems: 1024,
    maxBytes: 256 * 1024 * 1024,
  };
};

const getPersistentMediaLimits = () => {
  const deviceMemory =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as DeviceMemoryNavigator).deviceMemory;

  if (typeof deviceMemory === 'number') {
    if (deviceMemory <= 4) {
      return {
        maxEntries: 600,
      };
    }

    if (deviceMemory >= 8) {
      return {
        maxEntries: 2400,
      };
    }
  }

  return {
    maxEntries: 1200,
  };
};

const {
  maxItems: MAX_OBJECT_URL_MEDIA_ITEMS,
  maxBytes: MAX_OBJECT_URL_MEDIA_BYTES,
} = getObjectUrlMediaLimits();
const { maxEntries: MAX_PERSISTENT_MEDIA_ENTRIES } = getPersistentMediaLimits();

type PersistentMediaTask = {
  src: string;
  priority: MediaCachePriority;
  resolve: () => void;
};

const persistedMediaUrls = new Set<string>();
const pendingPersistentMedia = new Map<string, Promise<void>>();
const queuedPersistentMediaTasks = new Map<string, PersistentMediaTask>();
const visiblePersistentMediaQueue: PersistentMediaTask[] = [];
const backgroundPersistentMediaQueue: PersistentMediaTask[] = [];
let activePersistentMediaTasks = 0;

type ObjectUrlMediaEntry = {
  objectUrl: string;
  size: number;
};

type ObjectUrlMediaTask = {
  src: string;
  resolve: (value: string | undefined) => void;
  priority: MediaCachePriority;
};

const objectUrlMediaCache = new Map<string, ObjectUrlMediaEntry>();
const objectUrlMediaUrls = new Set<string>();
const pendingObjectUrlMedia = new Map<string, Promise<string | undefined>>();
const queuedObjectUrlMediaTasks = new Map<string, ObjectUrlMediaTask>();
const objectUrlMediaListeners = new Map<
  string,
  Set<(objectUrl: string | undefined) => void>
>();
const failedMediaRetryAt = new Map<string, number>();
const visibleObjectUrlMediaQueue: ObjectUrlMediaTask[] = [];
const backgroundObjectUrlMediaQueue: ObjectUrlMediaTask[] = [];
let objectUrlMediaCleanupBound = false;
let objectUrlMediaBytes = 0;
let activeObjectUrlMediaTasks = 0;
let currentCacheNamespace: string | undefined;
let legacyCacheCleanupPromise: Promise<void> | undefined;

const emitObjectUrlMediaChange = (src: string, objectUrl: string | undefined) => {
  objectUrlMediaListeners.get(src)?.forEach((listener) => {
    listener(objectUrl);
  });
};

const clearObjectUrlMediaCache = () => {
  Array.from(objectUrlMediaCache.keys()).forEach((src) => {
    removeObjectUrlMediaEntry(src);
  });
  objectUrlMediaBytes = 0;
};

const clearFailedMediaEntries = () => {
  failedMediaRetryAt.clear();
};

const clearFailedMediaEntry = (src: string) => {
  failedMediaRetryAt.delete(src);
};

const markFailedMediaEntry = (src: string, retryDelayMs: number) => {
  failedMediaRetryAt.set(src, Date.now() + retryDelayMs);
};

const canRetryFailedMediaEntry = (src: string): boolean => {
  const retryAt = failedMediaRetryAt.get(src);
  if (retryAt === undefined) {
    return true;
  }

  if (retryAt <= Date.now()) {
    failedMediaRetryAt.delete(src);
    return true;
  }

  return false;
};

const removeObjectUrlMediaEntry = (src: string) => {
  const entry = objectUrlMediaCache.get(src);
  if (!entry) return;

  objectUrlMediaCache.delete(src);
  objectUrlMediaUrls.delete(entry.objectUrl);
  objectUrlMediaBytes = Math.max(0, objectUrlMediaBytes - entry.size);
  revokeObjectUrlWhenPossible(entry.objectUrl);
  emitObjectUrlMediaChange(src, undefined);
};

const touchObjectUrlMediaEntry = (src: string): ObjectUrlMediaEntry | undefined => {
  const entry = objectUrlMediaCache.get(src);
  if (!entry) {
    return undefined;
  }

  objectUrlMediaCache.delete(src);
  objectUrlMediaCache.set(src, entry);

  return entry;
};

const trimObjectUrlMediaCache = () => {
  while (
    objectUrlMediaCache.size > 1 &&
    (objectUrlMediaCache.size > MAX_OBJECT_URL_MEDIA_ITEMS ||
      objectUrlMediaBytes > MAX_OBJECT_URL_MEDIA_BYTES)
  ) {
    const oldestKey = objectUrlMediaCache.keys().next().value;
    if (!oldestKey) {
      return;
    }

    removeObjectUrlMediaEntry(oldestKey);
  }
};

const setObjectUrlMediaEntry = (src: string, objectUrl: string, size: number) => {
  removeObjectUrlMediaEntry(src);
  clearFailedMediaEntry(src);

  objectUrlMediaCache.set(src, {
    objectUrl,
    size,
  });
  objectUrlMediaUrls.add(objectUrl);
  objectUrlMediaBytes += size;

  trimObjectUrlMediaCache();
  emitObjectUrlMediaChange(src, objectUrlMediaCache.get(src)?.objectUrl);
};

const createObjectUrlFromMedia = async (src: string): Promise<string | undefined> => {
  const cachedObjectUrl = touchObjectUrlMediaEntry(src)?.objectUrl;
  if (cachedObjectUrl) {
    return cachedObjectUrl;
  }

  const pendingPersistent = pendingPersistentMedia.get(src);
  if (pendingPersistent) {
    promotePersistentMediaTask(src);
    await pendingPersistent.catch(() => undefined);
  }

  const response = await ensurePersistentMedia(src);
  if (!response) {
    return undefined;
  }

  bindObjectUrlMediaCleanup();

  const mediaBlob = await response.blob();
  const objectUrl = URL.createObjectURL(mediaBlob);
  setObjectUrlMediaEntry(src, objectUrl, mediaBlob.size);
  return objectUrl;
};

const removeQueuedObjectUrlMediaTask = (queue: ObjectUrlMediaTask[], src: string) => {
  const queueIndex = queue.findIndex((task) => task.src === src);
  if (queueIndex >= 0) {
    queue.splice(queueIndex, 1);
  }
};

const promoteObjectUrlMediaTask = (src: string) => {
  const queuedTask = queuedObjectUrlMediaTasks.get(src);
  if (!queuedTask || queuedTask.priority === 'visible') {
    return;
  }

  removeQueuedObjectUrlMediaTask(backgroundObjectUrlMediaQueue, src);
  queuedTask.priority = 'visible';
  visibleObjectUrlMediaQueue.push(queuedTask);
};

const removeQueuedPersistentMediaTask = (queue: PersistentMediaTask[], src: string) => {
  const queueIndex = queue.findIndex((task) => task.src === src);
  if (queueIndex >= 0) {
    queue.splice(queueIndex, 1);
  }
};

const promotePersistentMediaTask = (src: string) => {
  const queuedTask = queuedPersistentMediaTasks.get(src);
  if (!queuedTask || queuedTask.priority === 'visible') {
    return;
  }

  removeQueuedPersistentMediaTask(backgroundPersistentMediaQueue, src);
  queuedTask.priority = 'visible';
  visiblePersistentMediaQueue.push(queuedTask);
};

const flushObjectUrlMediaQueue = () => {
  while (
    activeObjectUrlMediaTasks < OBJECT_URL_MEDIA_PRELOAD_CONCURRENCY &&
    (visibleObjectUrlMediaQueue.length > 0 || backgroundObjectUrlMediaQueue.length > 0)
  ) {
    const task = visibleObjectUrlMediaQueue.shift() ?? backgroundObjectUrlMediaQueue.shift();
    if (!task) return;

    queuedObjectUrlMediaTasks.delete(task.src);
    activeObjectUrlMediaTasks += 1;

    createObjectUrlFromMedia(task.src)
      .catch(() => undefined)
      .then((resolvedUrl) => {
        task.resolve(resolvedUrl);
      })
      .finally(() => {
        pendingObjectUrlMedia.delete(task.src);
        activeObjectUrlMediaTasks -= 1;
        flushObjectUrlMediaQueue();
      });
  }
};

const bindObjectUrlMediaCleanup = () => {
  if (objectUrlMediaCleanupBound || typeof window === 'undefined') {
    return;
  }

  objectUrlMediaCleanupBound = true;
  window.addEventListener(
    'pagehide',
    () => {
      clearObjectUrlMediaCache();
      clearFailedMediaEntries();
      pendingObjectUrlMedia.clear();
    },
    { once: true }
  );
};

const hashNamespace = (value: string): string => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
};

const getCacheNamespace = (): string => {
  const session = getFallbackSession();
  return `${session?.baseUrl?.toLowerCase() ?? 'guest'}::${session?.userId?.toLowerCase() ?? 'guest'}`;
};

const getPersistentMediaCacheName = (): string =>
  `${PERSISTENT_MEDIA_CACHE_PREFIX}-${hashNamespace(getCacheNamespace())}`;

const resetInMemoryMediaCaches = () => {
  persistedMediaUrls.clear();
  pendingPersistentMedia.clear();
  queuedPersistentMediaTasks.clear();
  visiblePersistentMediaQueue.length = 0;
  backgroundPersistentMediaQueue.length = 0;

  pendingObjectUrlMedia.clear();
  queuedObjectUrlMediaTasks.clear();
  visibleObjectUrlMediaQueue.length = 0;
  backgroundObjectUrlMediaQueue.length = 0;
  clearObjectUrlMediaCache();
  clearFailedMediaEntries();
};

const syncPersistentMediaNamespace = () => {
  const nextNamespace = getPersistentMediaCacheName();
  if (nextNamespace === currentCacheNamespace) {
    return nextNamespace;
  }

  currentCacheNamespace = nextNamespace;
  resetInMemoryMediaCaches();
  return nextNamespace;
};

const cleanupLegacyMediaCaches = async () => {
  if (typeof caches === 'undefined') {
    return;
  }

  if (legacyCacheCleanupPromise) {
    return legacyCacheCleanupPromise;
  }

  legacyCacheCleanupPromise = caches
    .keys()
    .then((cacheKeys) =>
      Promise.all(
        cacheKeys
          .filter(
            (key) => key === LEGACY_PERSISTENT_MEDIA_CACHE || key === PERSISTENT_MEDIA_CACHE_PREFIX
          )
          .map((key) => caches.delete(key))
      )
    )
    .finally(() => {
      legacyCacheCleanupPromise = undefined;
    });

  return legacyCacheCleanupPromise;
};

const getMediaCache = async (): Promise<Cache | undefined> => {
  if (typeof caches === 'undefined') {
    return undefined;
  }

  syncPersistentMediaNamespace();
  await cleanupLegacyMediaCaches();
  return caches.open(getPersistentMediaCacheName());
};

const trimPersistentMediaCache = async (mediaCache: Cache) => {
  const cachedRequests = await mediaCache.keys();
  if (cachedRequests.length <= MAX_PERSISTENT_MEDIA_ENTRIES) {
    return;
  }

  await Promise.all(
    cachedRequests
      .slice(0, cachedRequests.length - MAX_PERSISTENT_MEDIA_ENTRIES)
      .map((request) => mediaCache.delete(request))
  );
};

const touchPersistentMediaEntry = async (mediaCache: Cache, src: string, response: Response) => {
  await mediaCache.delete(src);
  await mediaCache.put(src, response);
};

const matchPersistentMedia = async (src: string): Promise<Response | undefined> => {
  const mediaCache = await getMediaCache();
  if (!mediaCache) {
    return undefined;
  }

  const cachedResponse = await mediaCache.match(src);
  if (cachedResponse) {
    await touchPersistentMediaEntry(mediaCache, src, cachedResponse.clone());
    persistedMediaUrls.add(src);
  }

  return cachedResponse ?? undefined;
};

const fetchAndPersistMedia = async (src: string): Promise<Response | undefined> => {
  if (!canRetryFailedMediaEntry(src)) {
    return undefined;
  }

  const response = await fetchMediaWithAuth(src, { method: 'GET' }).catch((error) => {
    markFailedMediaEntry(src, FAILED_MEDIA_RETRY_DELAY_MS);
    throw error;
  });
  if (!response.ok) {
    markFailedMediaEntry(
      src,
      response.status === 404
        ? FAILED_MEDIA_NOT_FOUND_RETRY_DELAY_MS
        : FAILED_MEDIA_RETRY_DELAY_MS
    );
    return undefined;
  }

  clearFailedMediaEntry(src);

  const mediaCache = await getMediaCache();
  if (mediaCache) {
    await mediaCache.put(src, response.clone());
    await trimPersistentMediaCache(mediaCache);
  }
  persistedMediaUrls.add(src);

  return response;
};

const ensurePersistentMedia = async (src: string): Promise<Response | undefined> => {
  const cachedResponse = await matchPersistentMedia(src);
  if (cachedResponse) {
    return cachedResponse;
  }

  return fetchAndPersistMedia(src);
};

const flushPersistentMediaQueue = () => {
  while (
    activePersistentMediaTasks < PERSISTENT_MEDIA_PRELOAD_CONCURRENCY &&
    (visiblePersistentMediaQueue.length > 0 || backgroundPersistentMediaQueue.length > 0)
  ) {
    const task = visiblePersistentMediaQueue.shift() ?? backgroundPersistentMediaQueue.shift();
    if (!task) return;

    queuedPersistentMediaTasks.delete(task.src);
    activePersistentMediaTasks += 1;

    ensurePersistentMedia(task.src)
      .catch(() => undefined)
      .finally(() => {
        pendingPersistentMedia.delete(task.src);
        activePersistentMediaTasks -= 1;
        task.resolve();
        flushPersistentMediaQueue();
      });
  }
};

export const primePersistentMediaUrl = (
  src?: string,
  priority: MediaCachePriority = 'background'
): Promise<void> | undefined => {
  syncPersistentMediaNamespace();

  if (!src || persistedMediaUrls.has(src)) {
    return undefined;
  }

  const existingPromise = pendingPersistentMedia.get(src);
  if (existingPromise) {
    if (priority === 'visible') {
      promotePersistentMediaTask(src);
    }
    return existingPromise;
  }

  const preloadPromise = new Promise<void>((resolve) => {
    const task: PersistentMediaTask = { src, priority, resolve };
    queuedPersistentMediaTasks.set(src, task);

    if (priority === 'visible') {
      visiblePersistentMediaQueue.push(task);
      return;
    }

    backgroundPersistentMediaQueue.push(task);
  });

  pendingPersistentMedia.set(src, preloadPromise);
  setTimeout(flushPersistentMediaQueue, 0);

  return preloadPromise;
};

export const getCachedMediaObjectUrl = (src?: string): string | undefined => {
  syncPersistentMediaNamespace();
  return (src && touchObjectUrlMediaEntry(src)?.objectUrl) || undefined;
};

export const getPreparedMediaUrl = async (
  src?: string,
  priority: MediaCachePriority = 'visible',
  timeoutMs = 120
): Promise<string | undefined> => {
  syncPersistentMediaNamespace();

  if (!src) {
    return undefined;
  }

  const cachedObjectUrl = touchObjectUrlMediaEntry(src)?.objectUrl;
  if (cachedObjectUrl) {
    return cachedObjectUrl;
  }

  const objectUrlPromise = primeCachedMediaObjectUrl(src, priority);
  if (!objectUrlPromise) {
    return undefined;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      objectUrlPromise.catch(() => undefined),
      new Promise<undefined>((resolve) => {
        timeoutId = setTimeout(() => resolve(undefined), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
};

export const isCachedMediaObjectUrl = (url?: string): boolean => {
  syncPersistentMediaNamespace();
  return typeof url === 'string' && objectUrlMediaUrls.has(url);
};

export const subscribeCachedMediaObjectUrl = (
  src: string | undefined,
  listener: (objectUrl: string | undefined) => void
): (() => void) => {
  syncPersistentMediaNamespace();

  if (!src) {
    return () => undefined;
  }

  const listeners = objectUrlMediaListeners.get(src) ?? new Set();
  listeners.add(listener);
  objectUrlMediaListeners.set(src, listeners);

  return () => {
    const currentListeners = objectUrlMediaListeners.get(src);
    if (!currentListeners) {
      return;
    }

    currentListeners.delete(listener);
    if (currentListeners.size === 0) {
      objectUrlMediaListeners.delete(src);
    }
  };
};

export const primeCachedMediaObjectUrl = (
  src?: string,
  priority: MediaCachePriority = 'visible'
): Promise<string | undefined> | undefined => {
  syncPersistentMediaNamespace();

  if (!src) {
    return undefined;
  }
  if (!canRetryFailedMediaEntry(src)) {
    return Promise.resolve(undefined);
  }

  const cachedObjectUrl = touchObjectUrlMediaEntry(src)?.objectUrl;
  if (cachedObjectUrl) {
    return Promise.resolve(cachedObjectUrl);
  }

  const pendingObjectUrl = pendingObjectUrlMedia.get(src);
  if (pendingObjectUrl) {
    if (priority === 'visible') {
      promoteObjectUrlMediaTask(src);
    }
    return pendingObjectUrl;
  }

  const objectUrlPromise = new Promise<string | undefined>((resolve) => {
    const task: ObjectUrlMediaTask = { src, resolve, priority };
    queuedObjectUrlMediaTasks.set(src, task);

    if (priority === 'visible') {
      visibleObjectUrlMediaQueue.push(task);
      return;
    }

    backgroundObjectUrlMediaQueue.push(task);
  });

  pendingObjectUrlMedia.set(src, objectUrlPromise);
  setTimeout(flushObjectUrlMediaQueue, 0);

  return objectUrlPromise;
};
