import { revokeObjectUrlWhenPossible } from './objectUrlRetainer';
import { fetchMediaWithAuth } from './matrix';
import { getFallbackSession } from '../state/sessions';
import { mobileOrTablet } from './user-agent';
import { isAndroidApp } from './nativePlatform';
import {
  invalidateAndroidMediaAssetUrl,
  prepareAndroidMediaAssetUrl,
} from './androidMediaAssetCache';

const LEGACY_PERSISTENT_MEDIA_CACHES = ['cinny-auth-media-v2', 'cinny-auth-media-v3'];
const PERSISTENT_MEDIA_CACHE_PREFIX = 'cinny-auth-media-v4';
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

  if (isAndroidApp()) {
    if (typeof deviceMemory === 'number' && deviceMemory <= 4) {
      return {
        maxItems: 768,
        maxBytes: 128 * 1024 * 1024,
      };
    }

    if (typeof deviceMemory === 'number' && deviceMemory >= 8) {
      return {
        maxItems: 2400,
        maxBytes: 384 * 1024 * 1024,
      };
    }

    return {
      maxItems: 1536,
      maxBytes: 256 * 1024 * 1024,
    };
  }

  if (mobileOrTablet()) {
    if (typeof deviceMemory === 'number' && deviceMemory <= 4) {
      return {
        maxItems: 192,
        maxBytes: 48 * 1024 * 1024,
      };
    }

    if (typeof deviceMemory === 'number' && deviceMemory >= 8) {
      return {
        maxItems: 768,
        maxBytes: 128 * 1024 * 1024,
      };
    }

    return {
      maxItems: 512,
      maxBytes: 96 * 1024 * 1024,
    };
  }

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
  // The installed Android app owns its storage and benefits from keeping complete sticker/avatar
  // sets available between launches. Browser limits stay unchanged.
  if (isAndroidApp()) {
    return {
      maxEntries: 10_000,
    };
  }

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

const getMediaPreloadConcurrency = () => {
  const deviceMemory =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as DeviceMemoryNavigator).deviceMemory;

  if (isAndroidApp()) {
    return {
      persistent: 1,
      objectUrl: typeof deviceMemory === 'number' && deviceMemory <= 4 ? 3 : 4,
    };
  }

  if (mobileOrTablet()) {
    return {
      persistent: 2,
      objectUrl: typeof deviceMemory === 'number' && deviceMemory >= 8 ? 4 : 3,
    };
  }

  if (typeof deviceMemory === 'number' && deviceMemory <= 4) {
    return {
      persistent: 2,
      objectUrl: 3,
    };
  }

  if (typeof deviceMemory === 'number' && deviceMemory >= 8) {
    return {
      persistent: 4,
      objectUrl: 6,
    };
  }

  return {
    persistent: 3,
    objectUrl: 4,
  };
};

const { maxItems: MAX_OBJECT_URL_MEDIA_ITEMS, maxBytes: MAX_OBJECT_URL_MEDIA_BYTES } =
  getObjectUrlMediaLimits();
const { maxEntries: MAX_PERSISTENT_MEDIA_ENTRIES } = getPersistentMediaLimits();
const {
  persistent: PERSISTENT_MEDIA_PRELOAD_CONCURRENCY,
  objectUrl: OBJECT_URL_MEDIA_PRELOAD_CONCURRENCY,
} = getMediaPreloadConcurrency();

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
const objectUrlMediaListeners = new Map<string, Set<(objectUrl: string | undefined) => void>>();
const failedMediaRetryAt = new Map<string, number>();
const visibleObjectUrlMediaQueue: ObjectUrlMediaTask[] = [];
const backgroundObjectUrlMediaQueue: ObjectUrlMediaTask[] = [];
let objectUrlMediaCleanupBound = false;
let objectUrlMediaBytes = 0;
let activeObjectUrlMediaTasks = 0;
let currentCacheNamespace: string | undefined;
let legacyMediaCachesPromise: Promise<Cache[]> | undefined;
let mediaCachePromise: Promise<Cache | undefined> | undefined;
let persistentWritesSinceTrim = 0;
let persistentTrimPromise: Promise<void> | undefined;

const PERSISTENT_MEDIA_TRIM_INTERVAL = 64;
const ANDROID_MEDIA_FALLBACK_DELAY_MS = 800;
const ANDROID_MEDIA_RESOLVE_DEADLINE_MS = 20_000;

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
    // A subscribed entry is currently rendered (avatars and emoji subscribe before priming).
    // Revoking it here can leave an <img> pointing at an already-invalid blob URL until the
    // next React render. Skip visible entries and trim them after their last subscriber leaves.
    const oldestKey = Array.from(objectUrlMediaCache.keys()).find(
      (src) => (objectUrlMediaListeners.get(src)?.size ?? 0) === 0
    );
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

const isInvalidMediaResponse = (response: Response): boolean => {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  return (
    !response.ok || contentType.includes('text/html') || contentType.includes('application/json')
  );
};

const responseToMediaBlob = async (response?: Response): Promise<Blob | undefined> => {
  if (!response || isInvalidMediaResponse(response)) return undefined;
  const blob = await response.blob().catch(() => undefined);
  return blob && blob.size > 0 ? blob : undefined;
};

const loadAndroidNativeMediaBlob = async (
  src: string,
  cacheOnly = false
): Promise<Blob | undefined> => {
  const assetUrl = await prepareAndroidMediaAssetUrl(src, undefined, false, cacheOnly);
  if (!assetUrl) return undefined;

  const response = await fetch(assetUrl, { cache: 'no-store' }).catch(() => undefined);
  const blob = await responseToMediaBlob(response);
  if (!blob) invalidateAndroidMediaAssetUrl(src);
  return blob;
};

const cacheRuntimeMediaBlob = (src: string, mediaBlob: Blob): string => {
  bindObjectUrlMediaCleanup();
  persistedMediaUrls.add(src);
  const objectUrl = URL.createObjectURL(mediaBlob);
  setObjectUrlMediaEntry(src, objectUrl, mediaBlob.size);
  return objectUrl;
};

const loadAndroidMediaBlob = (
  src: string,
  onLateMedia: (mediaBlob: Blob) => void
): Promise<Blob | undefined> =>
  loadAndroidNativeMediaBlob(src, true).then((cachedNativeBlob) => {
    if (cachedNativeBlob) return cachedNativeBlob;

    return new Promise((resolve) => {
      let settled = false;
      let mediaAccepted = false;
      let browserDone = false;
      let nativeDone = false;
      let nativeStarted = false;
      let nativeFallbackTimer: number | undefined;
      let deadlineTimer: number | undefined;

      const finish = (blob?: Blob) => {
        if (blob) {
          if (mediaAccepted) return;
          mediaAccepted = true;
          if (settled) {
            onLateMedia(blob);
            return;
          }
          settled = true;
          if (nativeFallbackTimer !== undefined) window.clearTimeout(nativeFallbackTimer);
          if (deadlineTimer !== undefined) window.clearTimeout(deadlineTimer);
          resolve(blob);
          return;
        }
        if (settled) return;
        if (browserDone && nativeDone) {
          settled = true;
          if (deadlineTimer !== undefined) window.clearTimeout(deadlineTimer);
          resolve(undefined);
        }
      };

      const startNative = () => {
        if (nativeStarted || settled) return;
        nativeStarted = true;
        loadAndroidNativeMediaBlob(src)
          .catch(() => undefined)
          .then((blob) => {
            nativeDone = true;
            finish(blob);
          });
      };

      nativeFallbackTimer = window.setTimeout(startNative, ANDROID_MEDIA_FALLBACK_DELAY_MS);
      deadlineTimer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(undefined);
      }, ANDROID_MEDIA_RESOLVE_DEADLINE_MS);

      fetchAndPersistMedia(src)
        .then(responseToMediaBlob)
        .catch(() => undefined)
        .then((blob) => {
          browserDone = true;
          if (!blob) startNative();
          finish(blob);
        });
    });
  });

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

  const cachedResponse = await matchPersistentMedia(src);
  if (cachedResponse) {
    bindObjectUrlMediaCleanup();
    const mediaBlob = await cachedResponse.blob();
    const objectUrl = URL.createObjectURL(mediaBlob);
    setObjectUrlMediaEntry(src, objectUrl, mediaBlob.size);
    return objectUrl;
  }

  if (isAndroidApp()) {
    const mediaBlob = await loadAndroidMediaBlob(src, (lateMediaBlob) => {
      cacheRuntimeMediaBlob(src, lateMediaBlob);
    });
    if (!mediaBlob) {
      markFailedMediaEntry(src, FAILED_MEDIA_RETRY_DELAY_MS);
      return undefined;
    }

    return cacheRuntimeMediaBlob(src, mediaBlob);
  }

  const response = await fetchAndPersistMedia(src);
  if (!response) return undefined;

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
  if (objectUrlMediaCleanupBound || typeof window === 'undefined' || isAndroidApp()) {
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
  return `${session?.baseUrl?.toLowerCase() ?? 'guest'}::${
    session?.userId?.toLowerCase() ?? 'guest'
  }`;
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
  mediaCachePromise = undefined;
  persistentWritesSinceTrim = 0;
  persistentTrimPromise = undefined;
  legacyMediaCachesPromise = undefined;
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

const getLegacyMediaCaches = async (): Promise<Cache[]> => {
  if (typeof caches === 'undefined') {
    return [];
  }

  if (!legacyMediaCachesPromise) {
    const namespaceHash = hashNamespace(getCacheNamespace());
    const allowedNames = new Set(
      LEGACY_PERSISTENT_MEDIA_CACHES.flatMap((name) => [name, `${name}-${namespaceHash}`])
    );
    legacyMediaCachesPromise = caches
      .keys()
      .then((cacheKeys) =>
        Promise.all(cacheKeys.filter((key) => allowedNames.has(key)).map((key) => caches.open(key)))
      );
  }

  return legacyMediaCachesPromise;
};

const getMediaCache = async (): Promise<Cache | undefined> => {
  if (typeof caches === 'undefined') {
    return undefined;
  }

  syncPersistentMediaNamespace();
  if (!mediaCachePromise) {
    mediaCachePromise = caches.open(getPersistentMediaCacheName()).catch(() => undefined);
  }
  return mediaCachePromise;
};

const trimPersistentMediaCache = async (
  mediaCache: Cache,
  maxEntries = MAX_PERSISTENT_MEDIA_ENTRIES
) => {
  const cachedRequests = await mediaCache.keys();
  if (cachedRequests.length <= maxEntries) {
    return;
  }

  await Promise.all(
    cachedRequests
      .slice(0, cachedRequests.length - maxEntries)
      .map((request) => mediaCache.delete(request))
  );
};

const schedulePersistentMediaTrim = (mediaCache: Cache) => {
  persistentWritesSinceTrim += 1;
  if (persistentWritesSinceTrim < PERSISTENT_MEDIA_TRIM_INTERVAL || persistentTrimPromise) {
    return;
  }

  persistentWritesSinceTrim = 0;
  persistentTrimPromise = trimPersistentMediaCache(mediaCache)
    .catch(() => undefined)
    .finally(() => {
      persistentTrimPromise = undefined;
    });
};

const persistMediaResponse = async (
  mediaCache: Cache,
  src: string,
  response: Response
): Promise<boolean> => {
  try {
    // Cache.keys() is an expensive disk scan in Android WebView. Scanning before every sticker
    // write made a full pack warm-up quadratic and competed with scrolling. Put immediately and
    // trim in coarse background batches; quota failures still reclaim space synchronously below.
    await mediaCache.put(src, response.clone());
    schedulePersistentMediaTrim(mediaCache);
    return true;
  } catch {
    try {
      // Quotas are byte based while Cache Storage exposes no cheap response-size index. Reclaim a
      // small LRU batch and retry once; rendering must still succeed if the device refuses it.
      const cachedRequests = await mediaCache.keys();
      const reclaimCount = Math.max(1, Math.ceil(cachedRequests.length * 0.1));
      await Promise.all(
        cachedRequests.slice(0, reclaimCount).map((request) => mediaCache.delete(request))
      );
      await mediaCache.put(src, response.clone());
      return true;
    } catch {
      return false;
    }
  }
};

const touchPersistentMediaEntry = async (mediaCache: Cache, src: string, response: Response) => {
  await mediaCache.delete(src);
  await mediaCache.put(src, response);
};

const getPersistentMediaLookupUrls = (src: string): string[] => {
  const lookupUrls = [src];
  try {
    const legacyUrl = new URL(src);
    if (legacyUrl.searchParams.get('animated') === 'false') {
      legacyUrl.searchParams.delete('animated');
      lookupUrls.push(legacyUrl.toString());
    }
  } catch {
    // Keep the exact lookup for non-URL cache keys.
  }
  return lookupUrls;
};

const matchPersistentMedia = async (src: string): Promise<Response | undefined> => {
  const mediaCache = await getMediaCache().catch(() => undefined);
  if (!mediaCache) {
    return undefined;
  }

  let matchedUrl = src;
  let matchedCache = mediaCache;
  let cachedResponse: Response | undefined;
  for (const lookupUrl of getPersistentMediaLookupUrls(src)) {
    // eslint-disable-next-line no-await-in-loop
    const response = await mediaCache.match(lookupUrl);
    if (response) {
      matchedUrl = lookupUrl;
      cachedResponse = response;
      break;
    }
  }
  if (!cachedResponse) {
    const legacyCaches = await getLegacyMediaCaches().catch(() => []);
    for (const legacyCache of legacyCaches) {
      for (const lookupUrl of getPersistentMediaLookupUrls(src)) {
        // eslint-disable-next-line no-await-in-loop
        const response = await legacyCache.match(lookupUrl);
        if (response) {
          matchedUrl = lookupUrl;
          matchedCache = legacyCache;
          cachedResponse = response;
          break;
        }
      }
      if (cachedResponse) break;
    }
  }
  if (cachedResponse) {
    const contentType = cachedResponse.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      await matchedCache.delete(matchedUrl).catch(() => false);
      persistedMediaUrls.delete(src);
      return undefined;
    }

    if (matchedCache !== mediaCache) {
      await persistMediaResponse(mediaCache, src, cachedResponse.clone()).catch(() => false);
    }

    // Rewriting every cache hit is particularly expensive in Android WebView (Cache Storage is
    // backed by disk/IndexedDB). It caused dozens of writes while scrolling sticker grids. The
    // Android cache is already bounded and namespaced, so serve hits without an LRU rewrite.
    if (!isAndroidApp()) {
      await touchPersistentMediaEntry(mediaCache, src, cachedResponse.clone()).catch(
        () => undefined
      );
    }
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
  if (isInvalidMediaResponse(response)) {
    markFailedMediaEntry(
      src,
      response.status === 404 ? FAILED_MEDIA_NOT_FOUND_RETRY_DELAY_MS : FAILED_MEDIA_RETRY_DELAY_MS
    );
    return undefined;
  }

  clearFailedMediaEntry(src);

  const mediaCache = await getMediaCache().catch(() => undefined);
  if (mediaCache) {
    const persisted = await persistMediaResponse(mediaCache, src, response);
    if (persisted) {
      persistedMediaUrls.add(src);
    }
  }

  return response;
};

const ensurePersistentMediaAvailable = async (src: string): Promise<void> => {
  const cachedResponse = await matchPersistentMedia(src);
  if (cachedResponse) {
    persistedMediaUrls.add(src);
    return;
  }

  if (isAndroidApp()) {
    const assetUrl = await prepareAndroidMediaAssetUrl(src);
    if (assetUrl) persistedMediaUrls.add(src);
    return;
  }

  await fetchAndPersistMedia(src);
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

    ensurePersistentMediaAvailable(task.src)
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

export const getPersistedMediaBlob = async (src?: string): Promise<Blob | undefined> => {
  if (!src) return undefined;
  const response = await matchPersistentMedia(src);
  return response?.blob().catch(() => undefined);
};

export const cacheUploadedMediaBlob = async (
  src: string | undefined,
  blob: Blob,
  prepareRuntimeUrl = true
): Promise<void> => {
  if (!src || blob.size <= 0) return;

  const mediaCache = await getMediaCache().catch(() => undefined);
  if (mediaCache) {
    const response = new Response(blob, {
      status: 200,
      headers: blob.type ? { 'content-type': blob.type } : undefined,
    });
    const persisted = await persistMediaResponse(mediaCache, src, response);
    if (persisted) persistedMediaUrls.add(src);
  }

  if (prepareRuntimeUrl) {
    const objectUrl = URL.createObjectURL(blob);
    setObjectUrlMediaEntry(src, objectUrl, blob.size);
  }
};

export const invalidateCachedMediaUrl = async (src?: string): Promise<void> => {
  syncPersistentMediaNamespace();
  if (!src) return;

  removeObjectUrlMediaEntry(src);
  clearFailedMediaEntry(src);
  persistedMediaUrls.delete(src);
  invalidateAndroidMediaAssetUrl(src);

  const mediaCache = await getMediaCache().catch(() => undefined);
  await Promise.all(
    getPersistentMediaLookupUrls(src).map((lookupUrl) =>
      mediaCache?.delete(lookupUrl).catch(() => false)
    )
  );
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
  priority: MediaCachePriority = 'visible',
  retryFailed = false
): Promise<string | undefined> | undefined => {
  syncPersistentMediaNamespace();

  if (!src) {
    return undefined;
  }
  if (retryFailed) {
    clearFailedMediaEntry(src);
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
