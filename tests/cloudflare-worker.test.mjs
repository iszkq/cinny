import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../public/_worker.js';

const runWorker = async (url, responses, method = 'GET') => {
  let responseIndex = 0;
  const env = {
    ASSETS: {
      fetch: async () => responses[Math.min(responseIndex++, responses.length - 1)],
    },
  };

  return worker.fetch(new Request(url, { method }), env);
};

test('returns valid hashed assets unchanged', async () => {
  const response = await runWorker('https://example.test/assets/app.js', [
    new Response('export {};', {
      status: 200,
      headers: { 'Content-Type': 'application/javascript' },
    }),
  ]);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/javascript');
  assert.equal(await response.text(), 'export {};');
});

test('never serves SPA HTML as a hashed asset', async () => {
  const response = await runWorker('https://example.test/assets/missing.js', [
    new Response('<html>SPA fallback</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  ]);

  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('rewrites missing application routes to index.html', async () => {
  const response = await runWorker('https://example.test/room/example', [
    new Response('Not found', { status: 404 }),
    new Response('<html>Application</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  ]);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(await response.text(), '<html>Application</html>');
});
