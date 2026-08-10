import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('client waits for initial Matrix sync before mounting room features', async () => {
  const source = await readSource('src/app/pages/client/ClientRoot.tsx');

  assert.match(source, /const \[loading, setLoading\] = useState\(true\)/);
  assert.match(source, /INITIAL_SYNC_TIMEOUT_MS = 20_000/);
  assert.match(source, /startupFailed \? \(/);
  assert.match(source, /showInitialSyncTimeout \? \(/);
  assert.match(source, /: !clientReady \? \(/);
  assert.match(source, /clientReady \? \(/);
});

test('initial sync cannot remain an unactionable infinite spinner', async () => {
  const rootSource = await readSource('src/app/pages/client/ClientRoot.tsx');
  const statusSource = await readSource('src/app/pages/client/SyncStatus.tsx');

  assert.match(rootSource, /房间同步超时/);
  assert.match(rootSource, /清理房间缓存并重载/);
  assert.match(rootSource, /const retryInitialSync[\s\S]*window\.location\.reload\(\)/);
  assert.doesNotMatch(rootSource, /mx\.stopClient\(\)[\s\S]*startMatrix\(mx\)/);
  assert.doesNotMatch(statusSource, /!syncEstablished\s*&&\s*isVisibleConnectionIssue/);
});
