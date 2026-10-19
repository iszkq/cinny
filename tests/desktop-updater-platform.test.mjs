import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(
  readFileSync(new URL('../src/app/utils/desktopUpdater.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText;
const baseUrl = 'https://github.com/iszkq/cinny/releases/download/v2.0.1';
const windowsUrl = `${baseUrl}/Starfire_2.0.1_x64-setup.exe`;
const macUrl = `${baseUrl}/Starfire_2.0.1_universal.dmg`;
const releasePage = 'https://github.com/iszkq/cinny/releases/tag/v2.0.1';
const assets = [
  { name: 'Starfire_2.0.1_x64-setup.exe', browser_download_url: windowsUrl },
  { name: 'Starfire_2.0.1_aarch64.dmg', browser_download_url: `${baseUrl}/arm-only.dmg` },
  { name: 'Starfire_2.0.1_universal.dmg', browser_download_url: macUrl },
  { name: 'Starfire-v2.0.1.apk', browser_download_url: `${baseUrl}/Starfire-v2.0.1.apk` },
];

function updater({
  platform = 'MacIntel',
  userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  desktop = true,
  releaseVersion = '2.0.1',
  manifestVersion = '2.0.1',
  manifestKey = 'windows-x86_64',
  manifestFails = false,
  githubFails = false,
  releaseAssets = assets,
} = {}) {
  const api = {};
  const calls = [];
  vm.runInNewContext(source, {
    exports: api,
    window: {
      ...(desktop ? { __TAURI_INTERNALS__: {} } : {}),
      navigator: { platform, userAgent },
    },
    fetch: async (url) => {
      calls.push(url);
      const isManifest = url.endsWith('latest.json');
      if (isManifest ? manifestFails : githubFails) throw new Error('Network unavailable');
      return {
        ok: true,
        json: async () =>
          isManifest
            ? { version: manifestVersion, platforms: { [manifestKey]: { url: windowsUrl } } }
            : {
                tag_name: `v${releaseVersion}`,
                assets: releaseAssets,
                html_url: `https://github.com/iszkq/cinny/releases/tag/v${releaseVersion}`,
              },
      };
    },
  });
  return { api, calls };
}

test('Mac desktop selects the universal DMG even with a Windows-only updater manifest', async () => {
  const { api, calls } = updater();
  const release = await api.fetchLatestDesktopRelease();
  assert.equal(release.downloadUrl, macUrl);
  assert.equal(release.releasePageUrl, releasePage);
  assert.equal(release.androidDownloadUrl, `${baseUrl}/Starfire-v2.0.1.apk`);
  assert.equal(calls.length, 2);
});

test('Mac platform detection works with an empty navigator.platform', async () => {
  const { api } = updater({ platform: '' });
  assert.equal((await api.fetchLatestDesktopRelease()).downloadUrl, macUrl);
});

test('Mac uses the GitHub DMG when the Windows manifest is unavailable or stale', async () => {
  for (const options of [{ manifestFails: true }, { manifestVersion: '1.9.10' }]) {
    const { api } = updater(options);
    const release = await api.fetchLatestDesktopRelease();
    assert.equal(release.version, '2.0.1');
    assert.equal(release.downloadUrl, macUrl);
  }
});

test('Mac falls back to the release page if the DMG or GitHub API is unavailable', async () => {
  for (const options of [
    { githubFails: true },
    { releaseAssets: assets.filter((asset) => !asset.name.endsWith('.dmg')) },
    { githubFails: true, manifestKey: 'windows-x86_64-pc-windows-msvc' },
  ]) {
    const { api } = updater(options);
    const release = await api.fetchLatestDesktopRelease();
    assert.equal(release.downloadUrl, undefined);
    assert.equal(release.releasePageUrl, releasePage);
  }
});

test('Windows desktop keeps its EXE and legacy Windows manifest paths', async () => {
  for (const manifestKey of ['windows-x86_64', 'windows-x86_64-pc-windows-msvc']) {
    const { api } = updater({
      platform: 'Win32',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      githubFails: true,
      manifestKey,
    });
    assert.equal((await api.fetchLatestDesktopRelease()).downloadUrl, windowsUrl);
  }
  const { api } = updater({ platform: 'Win32', userAgent: 'Windows NT 10.0', manifestFails: true });
  assert.equal((await api.fetchLatestDesktopRelease()).downloadUrl, windowsUrl);
});

test('ordinary Mac browsers retain the Windows link used by the existing download page', async () => {
  const { api } = updater({ desktop: false });
  assert.equal((await api.fetchLatestDesktopRelease()).downloadUrl, windowsUrl);
});

test('Mac discovers future patch and minor releases without a fixed version or Windows manifest', async () => {
  for (const version of ['2.0.2', '2.1.0', '3.0.0']) {
    const url = `https://github.com/iszkq/cinny/releases/download/v${version}/Starfire_${version}_universal.dmg`;
    const { api } = updater({
      releaseVersion: version,
      // Publishing the Mac first must not depend on the Windows manifest version.
      manifestVersion: '2.0.1',
      releaseAssets: [
        assets[0],
        { name: `Starfire_${version}_universal.dmg`, browser_download_url: url },
      ],
    });
    const release = await api.fetchLatestDesktopRelease();
    assert.equal(release.version, version);
    assert.equal(release.downloadUrl, url);
    assert.equal(api.isDesktopUpdateVersionNewer(release.version, '2.0.1'), true);
    assert.equal(api.isDesktopUpdateVersionNewer('2.0.1', release.version), false);
  }
});

test('Mac never falls back to EXE while the next release DMG is still being published', async () => {
  const { api } = updater({
    releaseVersion: '2.0.2',
    manifestVersion: '2.0.2',
    releaseAssets: [{ name: 'Starfire_2.0.2_x64-setup.exe', browser_download_url: windowsUrl }],
  });
  const release = await api.fetchLatestDesktopRelease();
  assert.equal(release.version, '2.0.2');
  assert.equal(release.downloadUrl, undefined);
  assert.equal(release.releasePageUrl, 'https://github.com/iszkq/cinny/releases/tag/v2.0.2');
});

test('Mac recovers to the next version release page when the GitHub API is unavailable', async () => {
  const { api } = updater({ githubFails: true, manifestVersion: '2.0.2' });
  const release = await api.fetchLatestDesktopRelease();
  assert.equal(release.version, '2.0.2');
  assert.equal(release.downloadUrl, undefined);
  assert.equal(release.releasePageUrl, 'https://github.com/iszkq/cinny/releases/tag/v2.0.2');
});
