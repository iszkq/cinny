import { revokeObjectUrlWhenPossible } from './objectUrlRetainer';

type DeviceMemoryNavigator = Navigator & {
  deviceMemory?: number;
};

type SessionMediaEntry = {
  objectUrl: string;
  size: number;
};

const getSessionMediaLimits = () => {
  const deviceMemory =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as DeviceMemoryNavigator).deviceMemory;

  if (typeof deviceMemory === 'number') {
    if (deviceMemory <= 4) {
      return {
        maxItems: 96,
        maxBytes: 64 * 1024 * 1024,
      };
    }

    if (deviceMemory >= 8) {
      return {
        maxItems: 384,
        maxBytes: 192 * 1024 * 1024,
      };
    }
  }

  return {
    maxItems: 192,
    maxBytes: 128 * 1024 * 1024,
  };
};

const { maxItems: MAX_SESSION_MEDIA_ITEMS, maxBytes: MAX_SESSION_MEDIA_BYTES } =
  getSessionMediaLimits();

const sessionMediaCache = new Map<string, SessionMediaEntry>();
const sessionMediaObjectUrls = new Set<string>();
const pendingSessionMedia = new Map<string, Promise<string>>();
let sessionMediaBytes = 0;
let cleanupBound = false;

const bindCleanup = () => {
  if (cleanupBound || typeof window === 'undefined') {
    return;
  }

  cleanupBound = true;
  window.addEventListener(
    'pagehide',
    () => {
      sessionMediaCache.forEach((entry) => {
        sessionMediaObjectUrls.delete(entry.objectUrl);
        revokeObjectUrlWhenPossible(entry.objectUrl);
      });
      sessionMediaCache.clear();
      pendingSessionMedia.clear();
      sessionMediaBytes = 0;
    },
    { once: true }
  );
};

const removeSessionMediaEntry = (key: string) => {
  const entry = sessionMediaCache.get(key);
  if (!entry) return;

  sessionMediaCache.delete(key);
  sessionMediaObjectUrls.delete(entry.objectUrl);
  sessionMediaBytes = Math.max(0, sessionMediaBytes - entry.size);
  revokeObjectUrlWhenPossible(entry.objectUrl);
};

const touchSessionMediaEntry = (key: string): SessionMediaEntry | undefined => {
  const entry = sessionMediaCache.get(key);
  if (!entry) {
    return undefined;
  }

  sessionMediaCache.delete(key);
  sessionMediaCache.set(key, entry);

  return entry;
};

const trimSessionMediaCache = () => {
  while (
    sessionMediaCache.size > 1 &&
    (sessionMediaCache.size > MAX_SESSION_MEDIA_ITEMS ||
      sessionMediaBytes > MAX_SESSION_MEDIA_BYTES)
  ) {
    const oldestKey = sessionMediaCache.keys().next().value;
    if (!oldestKey) {
      return;
    }

    removeSessionMediaEntry(oldestKey);
  }
};

const setSessionMediaEntry = (key: string, objectUrl: string, size: number) => {
  removeSessionMediaEntry(key);

  sessionMediaCache.set(key, {
    objectUrl,
    size,
  });
  sessionMediaObjectUrls.add(objectUrl);
  sessionMediaBytes += size;

  trimSessionMediaCache();
};

export const getSessionMediaCacheKey = (
  kind: string,
  mediaUrl: string,
  mimeType?: string
): string => `${kind}::${mimeType ?? ''}::${mediaUrl}`;

export const loadSessionMediaUrl = async (
  key: string,
  loadBlob: () => Promise<Blob>
): Promise<string> => {
  const cachedEntry = touchSessionMediaEntry(key);
  if (cachedEntry) {
    return cachedEntry.objectUrl;
  }

  const pendingEntry = pendingSessionMedia.get(key);
  if (pendingEntry) {
    return pendingEntry;
  }

  bindCleanup();

  const loadPromise = loadBlob().then((mediaBlob) => {
    const objectUrl = URL.createObjectURL(mediaBlob);
    setSessionMediaEntry(key, objectUrl, mediaBlob.size);
    return objectUrl;
  });

  pendingSessionMedia.set(key, loadPromise);

  try {
    return await loadPromise;
  } finally {
    pendingSessionMedia.delete(key);
  }
};

export const isSessionMediaObjectUrl = (url?: string): boolean =>
  typeof url === 'string' && sessionMediaObjectUrls.has(url);
