import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { selectClientTarget } from '../scripts/run-client.mjs';

test('ordinary browser development, build and preview select the frozen Web client', () => {
  assert.equal(selectClientTarget({}), 'web');
  assert.equal(selectClientTarget({ VITE_ANDROID_APP: 'false', VITE_IOS_APP: 'false' }), 'web');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const command of ['start', 'build', 'preview']) {
    assert.equal(pkg.scripts[command], `node scripts/run-client.mjs ${command}`);
  }
});

test('mobile and Tauri builds continue selecting the existing native source', () => {
  for (const env of [
    { VITE_ANDROID_APP: 'true' },
    { VITE_IOS_APP: 'true' },
    { TAURI_ENV_PLATFORM: 'darwin' },
    { TAURI_ENV_PLATFORM: 'windows' },
    { TAURI_ENV_PLATFORM: 'linux' },
  ])
    assert.equal(selectClientTarget(env), 'native');
  assert.equal(selectClientTarget({}, true), 'native');
  const tauri = JSON.parse(
    readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8')
  );
  assert.equal(tauri.build.beforeBuildCommand, 'npm run build:native');
  assert.match(tauri.build.beforeDevCommand, /^npm run start:native/);
});
