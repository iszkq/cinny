/// <reference lib="WebWorker" />

export type {};
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: unknown[] };

// Keep the injectManifest marker, but do not route hashed application modules through Workbox.
// Netlify removes old hashed files on every deploy; an older service worker intercepting those
// module URLs can otherwise strand the app on the startup screen. The browser HTTP cache already
// handles immutable assets, while the service worker remains responsible only for Matrix media.
self.addEventListener('install', (event) => {
  // Referencing the injected list makes each deployment install a fresh worker without caching it.
  event.waitUntil(
    Promise.all([Promise.resolve(self.__WB_MANIFEST).then(() => undefined), self.skipWaiting()])
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      const legacyPrecacheNames = cacheNames.filter((name) => name.startsWith('workbox-precache'));
      await Promise.all(legacyPrecacheNames.map((name) => caches.delete(name)));
      await self.clients.claim();
      await cleanupDeadClients();
    })()
  );
});

type SessionInfo = {
  accessToken: string;
  baseUrl: string;
  userId?: string;
};

/**
 * Store session per client (tab)
 */
const sessions = new Map<string, SessionInfo>();
let mediaFetchSessionGeneration = 0;

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

function setSession(clientId: string, accessToken: unknown, baseUrl: unknown, userId: unknown) {
  const previousSession = sessions.get(clientId);
  if (typeof accessToken === 'string' && typeof baseUrl === 'string') {
    sessions.set(clientId, {
      accessToken,
      baseUrl,
      ...(typeof userId === 'string' ? { userId } : {}),
    });
  } else {
    // Logout or invalid session
    sessions.delete(clientId);
  }

  const nextSession = sessions.get(clientId);
  if (
    previousSession?.accessToken !== nextSession?.accessToken ||
    previousSession?.baseUrl !== nextSession?.baseUrl ||
    previousSession?.userId !== nextSession?.userId
  ) {
    mediaFetchSessionGeneration += 1;
    pendingMediaFetches.clear();
    failedMediaFetches.clear();
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
  timeoutMs = 750
): Promise<SessionInfo | undefined> {
  const client = await self.clients.get(clientId);
  if (!client) return undefined;

  const sessionPromise = requestSession(client);

  const timeout = new Promise<undefined>((resolve) => {
    setTimeout(() => resolve(undefined), timeoutMs);
  });

  return Promise.race([sessionPromise, timeout]);
}

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl =
    typeof event.notification.data?.url === 'string'
      ? event.notification.data.url
      : self.registration.scope;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (windowClients) => {
        const matchingClient = windowClients.find((client) => client.url === targetUrl);
        if (matchingClient) return matchingClient.focus();
        if (windowClients[0]) return windowClients[0].focus();
        return self.clients.openWindow(targetUrl);
      })
  );
});

/**
 * Receive session updates from clients
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const client = event.source as Client | null;
  if (!client) return;

  const { type, accessToken, baseUrl, userId } = event.data || {};

  if (type === 'setSession') {
    setSession(client.id, accessToken, baseUrl, userId);
    cleanupDeadClients();
  }
});

const MEDIA_PATHS = [
  '/_matrix/client/v1/media/download',
  '/_matrix/client/v1/media/thumbnail',
  '/_matrix/media/v3/download',
  '/_matrix/media/v3/thumbnail',
  '/_matrix/media/r0/download',
  '/_matrix/media/r0/thumbnail',
];
const AUTH_MEDIA_PATH_TO_FALLBACK_PATH: Record<string, string[]> = {
  '/_matrix/client/v1/media/download': ['/_matrix/media/v3/download', '/_matrix/media/r0/download'],
  '/_matrix/client/v1/media/thumbnail': [
    '/_matrix/media/v3/thumbnail',
    '/_matrix/media/r0/thumbnail',
  ],
};
const MEDIA_FETCH_FAILURE_BASE_RETRY_MS = 3_000;
const MEDIA_FETCH_NOT_FOUND_BASE_RETRY_MS = 5_000;
const MEDIA_FETCH_MAX_RETRY_MS = 60_000;
const MEDIA_FETCH_FAILURE_RESET_MS = 5 * 60 * 1000;
const MAX_MEDIA_FETCH_FAILURES = 512;

type MediaFetchFailure = {
  retryAt: number;
  status: number;
  attempts: number;
  failedAt: number;
};

const pendingMediaFetches = new Map<string, Promise<Response>>();
const failedMediaFetches = new Map<string, MediaFetchFailure>();
const removeAllowRedirectParam = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('allow_redirect');
    return parsed.toString();
  } catch {
    return url;
  }
};

function mediaPath(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return MEDIA_PATHS.some((p) => pathname.startsWith(p));
  } catch {
    return false;
  }
}

function isAuthenticatedClientMediaRequest(url: string, baseUrl: string): boolean {
  try {
    const mediaUrl = new URL(url);
    const homeserverUrl = new URL(baseUrl);
    return (
      mediaUrl.origin === homeserverUrl.origin &&
      /^\/_matrix\/client\/[^/]+\/media\/(?:download|thumbnail)\//i.test(mediaUrl.pathname)
    );
  } catch {
    return false;
  }
}

function getPublicMediaFallbackUrls(url: string): string[] {
  try {
    const mediaUrl = new URL(url);
    const matchingEntry = Object.entries(AUTH_MEDIA_PATH_TO_FALLBACK_PATH).find(([path]) =>
      mediaUrl.pathname.startsWith(path)
    );
    const fallbackPaths = matchingEntry?.[1];
    const matchingPath = matchingEntry?.[0];

    if (!fallbackPaths || !matchingPath) {
      return [];
    }

    return fallbackPaths.map((fallbackPath) => {
      const fallbackUrl = new URL(mediaUrl.toString());
      fallbackUrl.pathname = `${fallbackPath}${mediaUrl.pathname.slice(matchingPath.length)}`;
      return fallbackUrl.toString();
    });
  } catch {
    return [];
  }
}

function getMediaRequestUrls(url: string): string[] {
  const strippedUrl = removeAllowRedirectParam(url);
  const requestUrls = [strippedUrl];
  getPublicMediaFallbackUrls(strippedUrl).forEach((fallbackUrl) => {
    requestUrls.push(fallbackUrl);
  });

  return requestUrls
    .filter(
      (requestUrl, index) =>
        requestUrl.length > 0 && requestUrls.findIndex((value) => value === requestUrl) === index
    )
    .slice(0, 3);
}

async function toSafeMediaResponse(response: Response): Promise<Response | undefined> {
  try {
    const mediaBlob = await response.blob();
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.delete('transfer-encoding');

    return new Response(mediaBlob, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return undefined;
  }
}

async function performMediaFetchWithFallback(
  request: Request,
  session: SessionInfo | undefined
): Promise<Response> {
  // Complete the compatibility chain in one layer. The canonical failure is recorded only after
  // client/v1, v3 and r0 have all failed; subsequent app-layer candidates then hit that cooldown
  // instead of repeating network requests.
  const requestUrls = getMediaRequestUrls(request.url);
  let lastResponse: Response | undefined;
  let lastError: unknown;

  for (const requestUrl of requestUrls) {
    const shouldTryAuth =
      !!session && isAuthenticatedClientMediaRequest(requestUrl, session.baseUrl);
    const requestHeaders = new Headers(request.headers);
    if (shouldTryAuth && session) {
      requestHeaders.set('Authorization', `Bearer ${session.accessToken}`);
    } else {
      requestHeaders.delete('Authorization');
    }
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(requestUrl, {
      headers: requestHeaders,
      cache: 'default',
    }).catch((error) => {
      lastError = error;
      return undefined;
    });

    if (!response) {
      continue;
    }

    if (response.ok) {
      // eslint-disable-next-line no-await-in-loop
      const safeResponse = await toSafeMediaResponse(response);
      if (safeResponse) {
        return safeResponse;
      }
    }

    lastResponse = response;
  }

  if (lastResponse && !lastResponse.ok) {
    return lastResponse;
  }

  if (isAbortError(lastError)) {
    throw lastError;
  }

  return new Response(null, {
    status: 502,
    statusText: 'Media fetch failed',
  });
}

function getCanonicalMediaFetchUrl(url: string): string {
  try {
    const mediaUrl = new URL(removeAllowRedirectParam(url));
    mediaUrl.searchParams.delete('access_token');
    mediaUrl.pathname = mediaUrl.pathname.replace(
      /^\/_matrix\/media\/(?:v3|r0)\/(download|thumbnail)\//i,
      '/_matrix/client/v1/media/$1/'
    );
    mediaUrl.searchParams.sort();
    return mediaUrl.toString();
  } catch {
    return url;
  }
}

function getMediaFetchKey(request: Request, session: SessionInfo | undefined): string {
  return `${mediaFetchSessionGeneration}\n${session?.baseUrl?.toLowerCase() ?? 'guest'}\n${
    session?.userId?.toLowerCase() ?? 'guest'
  }\n${getCanonicalMediaFetchUrl(request.url)}\n${request.headers.get('range') ?? ''}`;
}

function rememberMediaFetchFailure(key: string, status: number) {
  const now = Date.now();
  const previousFailure = failedMediaFetches.get(key);
  const attempts =
    previousFailure && now - previousFailure.failedAt < MEDIA_FETCH_FAILURE_RESET_MS
      ? previousFailure.attempts + 1
      : 1;
  const baseDelay =
    status === 404 ? MEDIA_FETCH_NOT_FOUND_BASE_RETRY_MS : MEDIA_FETCH_FAILURE_BASE_RETRY_MS;
  const retryDelay = Math.min(baseDelay * 2 ** Math.min(attempts - 1, 4), MEDIA_FETCH_MAX_RETRY_MS);

  failedMediaFetches.delete(key);
  failedMediaFetches.set(key, {
    retryAt: now + retryDelay,
    status: status >= 400 && status <= 599 ? status : 502,
    attempts,
    failedAt: now,
  });

  while (failedMediaFetches.size > MAX_MEDIA_FETCH_FAILURES) {
    const oldestKey = failedMediaFetches.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    failedMediaFetches.delete(oldestKey);
  }
}

function getActiveMediaFetchFailure(key: string): MediaFetchFailure | undefined {
  const failure = failedMediaFetches.get(key);
  return failure && failure.retryAt > Date.now() ? failure : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function fetchMediaWithFallback(
  request: Request,
  session: SessionInfo | undefined
): Promise<Response> {
  const fetchKey = getMediaFetchKey(request, session);
  const recentFailure = getActiveMediaFetchFailure(fetchKey);
  if (recentFailure) {
    return new Response(null, {
      status: recentFailure.status,
      statusText: 'Media request temporarily unavailable',
    });
  }

  const pendingFetch = pendingMediaFetches.get(fetchKey);
  if (pendingFetch) {
    return (await pendingFetch).clone();
  }

  let requestPromise: Promise<Response>;
  requestPromise = performMediaFetchWithFallback(request, session)
    .then((response) => {
      if (response.ok) {
        failedMediaFetches.delete(fetchKey);
      } else {
        rememberMediaFetchFailure(fetchKey, response.status);
      }
      return response;
    })
    .catch((error) => {
      if (!isAbortError(error)) {
        rememberMediaFetchFailure(fetchKey, 502);
      }
      throw error;
    })
    .finally(() => {
      if (pendingMediaFetches.get(fetchKey) === requestPromise) {
        pendingMediaFetches.delete(fetchKey);
      }
    });

  pendingMediaFetches.set(fetchKey, requestPromise);
  return requestPromise;
}

self.addEventListener('fetch', (event: FetchEvent) => {
  const { url, method } = event.request;

  if (method !== 'GET' || !mediaPath(url)) return;

  const { clientId } = event;
  if (!clientId) return;

  const session = sessions.get(clientId);
  if (session) {
    event.respondWith(fetchMediaWithFallback(event.request, session));
    return;
  }

  event.respondWith(
    requestSessionWithTimeout(clientId).then((s) => fetchMediaWithFallback(event.request, s))
  );
});
