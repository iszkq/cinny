const PERSISTENT_MEDIA_CACHE = 'cinny-auth-media-v1';
const PERSISTENT_MEDIA_PRELOAD_CONCURRENCY = 4;

type PersistentMediaTask = {
  src: string;
  resolve: () => void;
};

const persistedMediaUrls = new Set<string>();
const pendingPersistentMedia = new Map<string, Promise<void>>();
const persistentMediaQueue: PersistentMediaTask[] = [];
let activePersistentMediaTasks = 0;

const objectUrlMediaCache = new Map<string, string>();
const pendingObjectUrlMedia = new Map<string, Promise<string | undefined>>();
let objectUrlMediaCleanupBound = false;

const revokeObjectUrl = (url?: string) => {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

const clearObjectUrlMediaCache = () => {
  objectUrlMediaCache.forEach((objectUrl) => {
    revokeObjectUrl(objectUrl);
  });
  objectUrlMediaCache.clear();
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
  (src && objectUrlMediaCache.get(src)) || undefined;

export const primeCachedMediaObjectUrl = (
  src?: string
): Promise<string | undefined> | undefined => {
  if (!src) {
    return undefined;
  }

  const cachedObjectUrl = objectUrlMediaCache.get(src);
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
    const previousObjectUrl = objectUrlMediaCache.get(src);

    if (previousObjectUrl && previousObjectUrl !== objectUrl) {
      revokeObjectUrl(previousObjectUrl);
    }

    objectUrlMediaCache.set(src, objectUrl);
    return objectUrl;
  })();

  pendingObjectUrlMedia.set(src, objectUrlPromise);
  void objectUrlPromise.finally(() => {
    pendingObjectUrlMedia.delete(src);
  });

  return objectUrlPromise;
};
