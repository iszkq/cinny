/// <reference lib="WebWorker" />

export type {};
declare const self: ServiceWorkerGlobalScope;

type DeviceMemoryNavigator = Navigator & {
  deviceMemory?: number;
};

type SessionInfo = {
  accessToken: string;
  baseUrl: string;
};

const AUTH_MEDIA_CACHE = 'cinny-auth-media-v2';
const AUTH_MEDIA_CACHE_PREFIX = 'cinny-auth-media-v';

const getAuthMediaCacheEntryLimit = () => {
  const deviceMemory = (self.navigator as DeviceMemoryNavigator | undefined)?.deviceMemory;

  if (typeof deviceMemory === 'number') {
    if (deviceMemory <= 4) {
      return 600;
    }

    if (deviceMemory >= 8) {
      return 2400;
    }
  }

  return 1200;
};

const MAX_AUTH_MEDIA_CACHE_ENTRIES = getAuthMediaCacheEntryLimit();

/**
 * Store session per client (tab)
 */
const sessions = new Map<string, SessionInfo>();

const clientToResolve = new Map<string, (value: SessionInfo | undefined) => void>();
const clientToSessionPromise = new Map<string, Promise<SessionInfo | undefined>>();

async function cleanupDeadClients() {
  const activeClients = await self.clients.matchAll();
  const activeIds = new Set(activeClients.map((c) => c.id));

  Array.from(sessions.keys()).forEach((id) => {
    if (!activeIds.has(id)) {
      sessions.delete(id);
      clientToResolve.delete(id);
      clientToSessionPromise.delete(id);
    }
  });
}

async function clearAuthMediaCache() {
  await caches.delete(AUTH_MEDIA_CACHE);
}

async function cleanupStaleCaches() {
  const cacheKeys = await caches.keys();
  const staleKeys = cacheKeys.filter(
    (key) => key.startsWith(AUTH_MEDIA_CACHE_PREFIX) && key !== AUTH_MEDIA_CACHE
  );

  await Promise.all(staleKeys.map((key) => caches.delete(key)));
}

function setSession(clientId: string, accessToken: any, baseUrl: any) {
  const previousSession = sessions.get(clientId);

  if (typeof accessToken === 'string' && typeof baseUrl === 'string') {
    const nextSession = { accessToken, baseUrl };
    sessions.set(clientId, nextSession);

    if (
      previousSession &&
      (previousSession.accessToken !== nextSession.accessToken ||
        previousSession.baseUrl !== nextSession.baseUrl)
    ) {
      void clearAuthMediaCache();
    }
  } else {
    if (previousSession) {
      void clearAuthMediaCache();
    }
    sessions.delete(clientId);
  }

  const resolveSession = clientToResolve.get(clientId);
  if (resolveSession) {
    resolveSession(sessions.get(clientId));
    clientToResolve.delete(clientId);
    clientToSessionPromise.delete(clientId);
  }
}

function requestSession(client: Client): Promise<SessionInfo | undefined> {
  const promise =
    clientToSessionPromise.get(client.id) ??
    new Promise((resolve) => {
      clientToResolve.set(client.id, resolve);
      client.postMessage({ type: 'requestSession' });
    });

  if (!clientToSessionPromise.has(client.id)) {
    clientToSessionPromise.set(client.id, promise);
  }

  return promise;
}

async function requestSessionWithTimeout(
  clientId: string,
  timeoutMs = 3000
): Promise<SessionInfo | undefined> {
  const client = await self.clients.get(clientId);
  if (!client) return undefined;

  const sessionPromise = requestSession(client);

  const timeout = new Promise<undefined>((resolve) => {
    setTimeout(() => resolve(undefined), timeoutMs);
  });

  return Promise.race([sessionPromise, timeout]);
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await cleanupDeadClients();
      await cleanupStaleCaches();
    })()
  );
});

/**
 * Receive session updates from clients
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const client = event.source as Client | null;
  if (!client) return;

  const { type, accessToken, baseUrl } = event.data || {};

  if (type === 'setSession') {
    setSession(client.id, accessToken, baseUrl);
    void cleanupDeadClients();
  }
});

const MEDIA_PATHS = ['/_matrix/client/v1/media/download', '/_matrix/client/v1/media/thumbnail'];

function mediaPath(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return MEDIA_PATHS.some((p) => pathname.startsWith(p));
  } catch {
    return false;
  }
}

function validMediaRequest(url: string, baseUrl: string): boolean {
  return MEDIA_PATHS.some((p) => {
    const validUrl = new URL(p, baseUrl);
    return url.startsWith(validUrl.href);
  });
}

function fetchConfig(token: string): RequestInit {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'default',
  };
}

async function trimAuthMediaCache(cache: Cache) {
  const cachedRequests = await cache.keys();
  if (cachedRequests.length <= MAX_AUTH_MEDIA_CACHE_ENTRIES) {
    return;
  }

  await Promise.all(
    cachedRequests
      .slice(0, cachedRequests.length - MAX_AUTH_MEDIA_CACHE_ENTRIES)
      .map((request) => cache.delete(request))
  );
}

async function touchCachedMedia(cache: Cache, url: string, response: Response) {
  await cache.delete(url);
  await cache.put(url, response);
}

async function getCachedMedia(url: string): Promise<Response | undefined> {
  const cache = await caches.open(AUTH_MEDIA_CACHE);
  const cachedResponse = await cache.match(url);

  if (!cachedResponse) {
    return undefined;
  }

  await touchCachedMedia(cache, url, cachedResponse.clone());
  return cachedResponse;
}

async function fetchAndCacheMedia(url: string, token: string): Promise<Response> {
  const response = await fetch(url, fetchConfig(token));

  if (response.ok) {
    const cache = await caches.open(AUTH_MEDIA_CACHE);
    await cache.put(url, response.clone());
    await trimAuthMediaCache(cache);
  }

  return response;
}

self.addEventListener('fetch', (event: FetchEvent) => {
  const { url, method } = event.request;

  if (method !== 'GET' || !mediaPath(url)) return;

  const { clientId } = event;
  if (!clientId) return;

  event.respondWith(
    (async () => {
      const session = sessions.get(clientId) ?? (await requestSessionWithTimeout(clientId));

      if (!session || !validMediaRequest(url, session.baseUrl)) {
        return fetch(event.request);
      }

      const cachedResponse = await getCachedMedia(url);
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetchAndCacheMedia(url, session.accessToken);
    })()
  );
});
