import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as sdk from 'matrix-js-sdk';

const api = {};
const local = new Map();
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/client/nativeTokenRefresh.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, {
  exports: api, Date, Error,
  require: id => id === 'matrix-js-sdk' ? sdk : { recordAndroidDiagnostic() {} },
  localStorage: {
    getItem: key => local.get(key) ?? null,
    setItem: (key, value) => local.set(key, value),
    removeItem: key => local.delete(key),
  },
});
const session = { baseUrl: 'https://example.com', userId: '@test:example.com', deviceId: 'TEST', accessToken: 'old-access', refreshToken: 'refresh-0' };
const response = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('SDK retries temporary refresh HTTP failures without logout, rotates both tokens, and serializes concurrent requests', async () => {
  local.clear();
  let refreshCount = 0;
  let temporaryFailure = true;
  let generation = 0;
  let accessValid = false;
  const saved = [];
  let logouts = 0;
  const fetchFn = async (url, options) => {
    if (new URL(url).pathname.endsWith('/refresh')) {
      refreshCount++;
      if (temporaryFailure) return response(503, { errcode: 'M_UNKNOWN', error: 'temporarily unavailable' });
      assert.equal(JSON.parse(options.body).refresh_token, `refresh-${generation}`);
      generation++;
      accessValid = true;
      return response(200, { access_token: `access-${generation}`, refresh_token: `refresh-${generation}`, expires_in_ms: 3600000 });
    }
    if (!accessValid) return response(401, { errcode: 'M_UNKNOWN_TOKEN', soft_logout: true });
    assert.equal(options.headers.Authorization, `Bearer access-${generation}`);
    return response(200, { ok: true });
  };
  const makeClient = s => sdk.createClient({
    ...s, fetchFn,
    tokenRefreshFunction: api.createNativeTokenRefresh(s,
      token => sdk.createClient({ baseUrl: s.baseUrl, fetchFn }).refreshToken(token),
      async value => saved.push(value)),
  });
  const client = makeClient(session);
  client.on(sdk.HttpApiEvent.SessionLoggedOut, () => logouts++);
  assert.equal(refreshCount, 0, 'startup must not contact refresh endpoint');
  await assert.rejects(client.http.authedRequest(sdk.Method.Get, '/test'));
  assert.equal(logouts, 0, '503 must not become terminal session expiry');
  temporaryFailure = false;
  await Promise.all([client.http.authedRequest(sdk.Method.Get, '/test'), client.http.authedRequest(sdk.Method.Get, '/test')]);
  assert.equal(refreshCount, 2, 'one failed attempt, then one shared successful attempt');
  assert.equal(logouts, 0);
  assert.equal(local.get('cinny_refresh_token'), 'refresh-1');
  assert.equal(local.get('cinny_access_token'), 'access-1');
  assert.equal(saved.at(-1).refreshToken, 'refresh-1');
  accessValid = false;
  const restarted = makeClient({ ...session, accessToken: local.get('cinny_access_token'), refreshToken: local.get('cinny_refresh_token') });
  await restarted.http.authedRequest(sdk.Method.Get, '/test');
  assert.equal(local.get('cinny_refresh_token'), 'refresh-2');
  assert.equal(refreshCount, 3);
});

test('only explicit credential rejection is terminal; rate limiting and server errors remain retryable', async () => {
  for (const [status, errcode, terminal] of [[401,'M_UNKNOWN_TOKEN',true],[403,'M_FORBIDDEN',true],[429,'M_LIMIT_EXCEEDED',false],[500,'M_UNKNOWN',false],[502,'M_UNKNOWN',false],[503,'M_UNAVAILABLE',false]]) {
    const error = new sdk.MatrixError({ errcode }, status);
    assert.equal(api.isTerminalRefreshError(error), terminal);
    const refresh = api.createNativeTokenRefresh(session, async () => { throw error; }, async () => assert.fail('failed refresh must not persist'));
    await assert.rejects(refresh('refresh-0'), e => terminal ? e === error : !(e instanceof sdk.MatrixError));
  }
});

test('iOS requests, saves and restores refresh tokens just like Android', async () => {
  const sessions = {};
  const values = new Map();
  const source = ts.transpileModule(readFileSync(new URL('../src/app/state/sessions.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  let persisted;
  vm.runInNewContext(source, {
    exports: sessions,
    require: id => id.includes('nativePlatform') ? { isNativeApp: () => true } : id.includes('nativeSessionFailure') ? { clearNativeSessionFailure() {} } : { persistAndroidSession: async s => { persisted = s; }, removeAndroidPersistedSession: async () => {} },
    localStorage: { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) },
  });
  await sessions.setFallbackSession('ios-access', 'IOS_DEVICE', '@test:example.com', 'https://example.com', 30000, 'ios-refresh');
  assert.equal(sessions.getFallbackSession().refreshToken, 'ios-refresh');
  assert.equal(sessions.getFallbackSession().expiresInMs, 30000);
  assert.equal(persisted.refreshToken, 'ios-refresh');
  const loginSource = readFileSync(new URL('../src/app/pages/auth/login/loginUtil.ts', import.meta.url), 'utf8');
  assert.match(loginSource, /isNativeApp\(\) \? \{ \.\.\.data, refresh_token: true \}/);
});
