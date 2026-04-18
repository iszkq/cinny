const PERSISTENT_MEDIA_CACHE = 'cinny-auth-media-v1';
const PERSISTENT_MEDIA_PRELOAD_CONCURRENCY = 4;
const MAX_OBJECT_URL_MEDIA_ITEMS = 256;
const MAX_OBJECT_URL_MEDIA_BYTES = 64 * 1024 * 1024;

type PersistentMediaTask = {
  src: string;
  resolve: () => void;
};

const persistedMediaUrls = new Set<string>();
const pendingPersistentMedia = new Map<string, Promise<void>>();
const persistentMediaQueue: PersistentMediaTask[] = [];
let activePersistentMediaTasks = 0;

type ObjectUrlMediaEntry = {
  objectUrl: string;
  size: number;
};

const objectUrlMediaCache = new Map<string, ObjectUrlMediaEntry>();
const pendingObjectUrlMedia = new Map<string, Promise<string | undefined>>();
let objectUrlMediaCleanupBound = false;
let objectUrlMediaBytes = 0;

const revokeObjectUrl = (url?: string) => {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

const clearObjectUrlMediaCache = () => {
  objectUrlMediaCache.forEach(({ objectUrl }) => {
    revokeObjectUrl(objectUrl);
  });
  objectUrlMediaCache.clear();
  objectUrlMediaBytes = 0;
};

const removeObjectUrlMediaEntry = (src: string) => {
  const entry = objectUrlMediaCache.get(src);
  if (!entry) return;

  objectUrlMediaCache.delete(src);
  objectUrlMediaBytes = Math.max(0, objectUrlMediaBytes - entry.size);
  revokeObjectUrl(entry.objectUrl);
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

  objectUrlMediaCache.set(src, {
    objectUrl,
    size,
  });
  objectUrlMediaBytes += size;

  trimObjectUrlMediaCache();
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
      pendingObjectUrlMedia.clear();
    },
    { once: true }
  );
};

const getMediaCache = async (): Promise<Cache | undefined> => {
  if (typeof caches === 'undefined') {
    return undefined;
  }

  return caches.open(PERSISTENT_MEDIA_CACHE);
};

const matchPersistentMedia = async (src: string): Promise<Response | undefined> => {
  const mediaCache = await getMediaCache();
  if (!mediaCache) {
    return undefined;
  }

  const cachedResponse = await mediaCache.match(src);
  if (cachedResponse) {
    persistedMediaUrls.add(src);
  }

  return cachedResponse ?? undefined;
};

const fetchAndPersistMedia = async (src: string): Promise<Response | undefined> => {
  const response = await fetch(src, { method: 'GET' });
  if (!response.ok) {
    return undefined;
  }

  const mediaCache = await getMediaCache();
  if (mediaCache) {
    await mediaCache.put(src, response.clone());
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
    persistentMediaQueue.length > 0
  ) {
    const task = persistentMediaQueue.shift();
    if (!task) return;

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

export const primePersistentMediaUrl = (src?: string): Promise<void> | undefined => {
  if (!src || persistedMediaUrls.has(src)) {
    return undefined;
  }

  const existingPromise = pendingPersistentMedia.get(src);
  if (existingPromise) {
    return existingPromise;
  }

  const preloadPromise = new Promise<void>((resolve) => {
    persistentMediaQueue.push({ src, resolve });
  });

  pendingPersistentMedia.set(src, preloadPromise);
  setTimeout(flushPersistentMediaQueue, 0);

  return preloadPromise;
};

export const getCachedMediaObjectUrl = (src?: string): string | undefined =>
  (src && touchObjectUrlMediaEntry(src)?.objectUrl) || undefined;

export const primeCachedMediaObjectUrl = (
  src?: string
): Promise<string | undefined> | undefined => {
  if (!src) {
    return undefined;
  }

  const cachedObjectUrl = touchObjectUrlMediaEntry(src)?.objectUrl;
  if (cachedObjectUrl) {
    return Promise.resolve(cachedObjectUrl);
  }

  const pendingObjectUrl = pendingObjectUrlMedia.get(src);
  if (pendingObjectUrl) {
    return pendingObjectUrl;
  }

  const objectUrlPromise = (async () => {
    const pendingPersistent = pendingPersistentMedia.get(src);
    if (pendingPersistent) {
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
  })();

  pendingObjectUrlMedia.set(src, objectUrlPromise);
  void objectUrlPromise.finally(() => {
    pendingObjectUrlMedia.delete(src);
  });

  return objectUrlPromise;
};
