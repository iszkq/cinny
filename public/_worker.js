const HASHED_ASSET_PREFIX = '/assets/';

const missingAssetResponse = () =>
  new Response('Not found', {
    status: 404,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = await env.ASSETS.fetch(request);

    // Cloudflare Pages normally rewrites every unknown SPA path to index.html. That must never
    // happen below /assets: the HTML response can otherwise be cached as immutable JavaScript and
    // keep breaking clients even after a successful deployment.
    if (url.pathname.startsWith(HASHED_ASSET_PREFIX)) {
      const contentType = response.headers.get('content-type') ?? '';
      if (response.status === 404 || contentType.includes('text/html')) {
        return missingAssetResponse();
      }
      return response;
    }

    if (response.status !== 404 || (request.method !== 'GET' && request.method !== 'HEAD')) {
      return response;
    }

    const indexUrl = new URL('/index.html', url);
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
