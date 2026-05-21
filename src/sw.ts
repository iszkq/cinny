/// <reference lib="WebWorker" />

export type {};
declare const self: ServiceWorkerGlobalScope;

type SessionInfo = {
  accessToken: string;
  baseUrl: string;
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

function setSession(clientId: string, accessToken: any, baseUrl: any) {
  if (typeof accessToken === 'string' && typeof baseUrl === 'string') {
    sessions.set(clientId, { accessToken, baseUrl });
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
    cleanupDeadClients();
  }
});

const MEDIA_PATHS = ['/_matrix/client/v1/media/download', '/_matrix/client/v1/media/thumbnail'];
const AUTH_MEDIA_PATH_TO_FALLBACK_PATH: Record<string, string[]> = {
  '/_matrix/client/v1/media/download': [
    '/_matrix/media/v3/download',
    '/_matrix/media/r0/download',
  ],
  '/_matrix/client/v1/media/thumbnail': [
    '/_matrix/media/v3/thumbnail',
    '/_matrix/media/r0/thumbnail',
  ],
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
    const fallbackPaths = Object.entries(AUTH_MEDIA_PATH_TO_FALLBACK_PATH).find(([path]) =>
      mediaUrl.pathname.startsWith(path)
    )?.[1];

    if (!fallbackPaths) {
      return [];
    }

    return fallbackPaths.map((fallbackPath) => {
      const fallbackUrl = new URL(mediaUrl.toString());
      fallbackUrl.pathname = mediaUrl.pathname.replace(
        /^\/_matrix\/client\/v1\/media\/(download|thumbnail)/,
        fallbackPath
      );
      return fallbackUrl.toString();
    });
  } catch {
    return [];
  }
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
  if (session && validMediaRequest(request.url, session.baseUrl)) {
    const authedResponse = await fetch(request.url, fetchConfig(session.accessToken)).catch(
      () => undefined
    );
    if (authedResponse?.ok) {
      const safeAuthedResponse = await toSafeMediaResponse(authedResponse);
      if (safeAuthedResponse) {
        return safeAuthedResponse;
      }
    }
  }

  const originalResponse = await fetch(request).catch(() => undefined);
  if (originalResponse?.ok) {
    const safeOriginalResponse = await toSafeMediaResponse(originalResponse);
    if (safeOriginalResponse) {
      return safeOriginalResponse;
    }
  }

  const fallbackUrls = getPublicMediaFallbackUrls(request.url);
  for (const fallbackUrl of fallbackUrls) {
    // eslint-disable-next-line no-await-in-loop
    const fallbackResponse = await fetch(fallbackUrl).catch(() => undefined);
    if (fallbackResponse?.ok) {
      // eslint-disable-next-line no-await-in-loop
      const safeFallbackResponse = await toSafeMediaResponse(fallbackResponse);
      if (safeFallbackResponse) {
        return safeFallbackResponse;
      }
    }
  }

  if (originalResponse && !originalResponse.ok) {
    return originalResponse;
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
    requestSessionWithTimeout(clientId).then((s) => {
      return fetchMediaWithFallback(event.request, s);
    })
  );
});
