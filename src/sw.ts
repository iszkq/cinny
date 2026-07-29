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

      if (legacyPrecacheNames.length > 0) {
        const windowClients = await self.clients.matchAll({ type: 'window' });
        await Promise.all(
          windowClients.map((client) =>
            'navigate' in client ? client.navigate(client.url).catch(() => undefined) : undefined
          )
        );
      }
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

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await cleanupDeadClients();
    })()
  );
});

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

const MEDIA_PATHS = ['/_matrix/client/v1/media/download', '/_matrix/client/v1/media/thumbnail'];
const AUTH_MEDIA_PATH_TO_FALLBACK_PATH: Record<string, string[]> = {
  '/_matrix/client/v1/media/download': ['/_matrix/media/v3/download', '/_matrix/media/r0/download'],
  '/_matrix/client/v1/media/thumbnail': [
    '/_matrix/media/v3/thumbnail',
    '/_matrix/media/r0/thumbnail',
  ],
};
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
  const requestUrls = [url, strippedUrl];

  getPublicMediaFallbackUrls(url).forEach((fallbackUrl) => {
    requestUrls.push(fallbackUrl);
  });
  getPublicMediaFallbackUrls(strippedUrl).forEach((fallbackUrl) => {
    requestUrls.push(fallbackUrl);
  });

  return requestUrls.filter(
    (requestUrl, index) =>
      requestUrl.length > 0 && requestUrls.findIndex((value) => value === requestUrl) === index
  );
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

async function fetchMediaWithFallback(
  request: Request,
  session: SessionInfo | undefined
): Promise<Response> {
  const requestUrls = getMediaRequestUrls(request.url);
  let lastResponse: Response | undefined;

  for (const requestUrl of requestUrls) {
    const shouldTryAuth = !!session && validMediaRequest(requestUrl, session.baseUrl);
    const requestAttempts = shouldTryAuth ? [true, false] : [false];

    for (const useAuth of requestAttempts) {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(
        useAuth ? requestUrl : new Request(requestUrl, request),
        useAuth && session ? fetchConfig(session.accessToken) : undefined
      ).catch(() => undefined);

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
  }

  if (lastResponse && !lastResponse.ok) {
    return lastResponse;
  }

  return new Response(null, {
    status: 502,
    statusText: 'Media fetch failed',
  });
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
