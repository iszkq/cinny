import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const values = new Map();
const api = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/client/nativeSessionFailure.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, {
  exports: api,
  localStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  },
});
const identity = { baseUrl: 'https://example.com', userId: '@test:example.com', deviceId: 'TEST' };
test('rejected native credentials stay blocked across reloads without storing tokens', () => {
  api.markNativeSessionFailure({ ...identity, accessToken: 'secret-token', refreshToken: 'secret-refresh' }, true);
  assert.equal(api.readNativeSessionFailure(identity)?.softLogout, true);
  const serialized = [...values.values()].join('');
  assert.ok(!serialized.includes('secret-token'));
  assert.ok(!serialized.includes('secret-refresh'));
  assert.equal(api.readNativeSessionFailure({ ...identity, deviceId: 'OTHER' }), undefined);
  assert.equal(api.readNativeSessionFailure(undefined), undefined);
});
test('explicit recovery or successful sign-in clears the rejected-session guard', () => {
  api.clearNativeSessionFailure();
  assert.equal(api.readNativeSessionFailure(identity), undefined);
  api.markNativeSessionFailure(identity, false);
  assert.equal(api.readNativeSessionFailure(identity)?.softLogout, false);
  api.clearNativeSessionFailure();
});
