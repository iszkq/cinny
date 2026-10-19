import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

test('native retry shares the unfinished crypto initialization and releases only when it settles', async () => {
  const source = readFileSync(new URL('../src/client/initMatrix.ts', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('const pendingNativeClients'), source.indexOf('const initClientInternal'));
  const api = {};
  let complete;
  let calls = 0;
  vm.runInNewContext(compile(block), { exports: api, isNativeApp: () => true, initClientInternal: () => { calls++; return new Promise(resolve => { complete = resolve; }); } });
  const identity = { baseUrl: 'https://example.com', userId: '@test:example.com', deviceId: 'A' };
  const first = api.initClient(identity);
  const retry = api.initClient(identity);
  assert.equal(first, retry);
  assert.equal(calls, 1);
  const client = {};
  complete(client);
  assert.equal(await first, client);
  assert.equal(await retry, client);
  api.initClient(identity);
  assert.equal(calls, 2);
});

test('iOS database detection opens exact databases without depending on database enumeration', async () => {
  const api = {};
  let opened = 0;
  let closed = 0;
  vm.runInNewContext(compile(readFileSync(new URL('../src/client/rustCryptoStore.ts', import.meta.url), 'utf8')), {
    exports: api,
    require: () => ({ isAndroidApp: () => false, isNativeApp: () => true }),
    global: { indexedDB: {
      databases: () => assert.fail('iOS must not wait for database enumeration'),
      open: () => {
        opened++;
        const request = { result: { close: () => closed++ } };
        queueMicrotask(() => request.onsuccess());
        return request;
      },
    } },
  });
  const existing = await api.findExistingRustCryptoDatabasePrefixes(['saved-prefix']);
  assert.ok(existing.has('saved-prefix'));
  assert.equal(opened, 1);
  assert.equal(closed, 1);
});

test('startup phase diagnostics never copy raw SDK errors or secret arguments', () => {
  const api = {};
  const records = [];
  const forwarded = [];
  const base = Object.fromEntries(['trace','debug','info','warn','error'].map(name => [name, function(...args) { assert.equal(this, base); forwarded.push(args); }]));
  base.getChild = () => base;
  vm.runInNewContext(compile(readFileSync(new URL('../src/client/startupLogger.ts', import.meta.url), 'utf8')), {
    exports: api, require: () => ({ recordAndroidDiagnostic: (...args) => records.push(args) }),
  });
  const logger = api.createStartupLogger(base);
  logger.debug('Opening Rust CryptoStore', 'SECRET');
  logger.getChild('crypto').debug('Opening Rust CryptoStore', { privateKey: 'SECRET' });
  logger.error('unrelated token SECRET');
  assert.equal(records.length, 1);
  assert.ok(!JSON.stringify(records).includes('SECRET'));
  assert.equal(forwarded.length, 3);
});
