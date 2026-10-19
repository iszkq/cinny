import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { restoreDefaultAIConfig } from './prepare-client-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(readFileSync(path.join(root, 'windows-baseline.json'), 'utf8'));
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const target = path.resolve(root, process.argv[2] ?? 'windows-client');
if (target === root) throw new Error('Windows baseline must use a separate checkout.');
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid application version.');

const git = (...args) => execFileSync('git', ['-C', target, ...args], { encoding: 'utf8' }).trim();
if (git('rev-parse', 'HEAD') !== baseline.ref)
  throw new Error('Unexpected Windows baseline commit.');

// Fail if any tracked application source changed before preparing the package.
git('diff', '--quiet', 'HEAD');
const updateJson = (name, transform) => {
  const file = path.join(target, name);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  transform(json);
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
};
updateJson('package.json', (json) => {
  json.version = version;
});
updateJson('package-lock.json', (json) => {
  json.version = version;
  json.packages[''].version = version;
});
updateJson('src-tauri/tauri.conf.json', (json) => {
  json.version = version;
});
const cargo = path.join(target, 'src-tauri/Cargo.toml');
writeFileSync(
  cargo,
  readFileSync(cargo, 'utf8').replace(/^version = "[^"]+"/m, `version = "${version}"`)
);
const lock = path.join(target, 'src-tauri/Cargo.lock');
if (existsSync(lock)) {
  writeFileSync(
    lock,
    readFileSync(lock, 'utf8').replace(
      /(name = "cinny-desktop"\r?\nversion = ")[^"]+"/,
      `$1${version}"`
    )
  );
}
restoreDefaultAIConfig(path.join(target, 'config.json'));

git(
  'diff',
  '--quiet',
  'HEAD',
  '--',
  'src',
  'public',
  'index.html',
  'vite.config.js',
  'build.config.ts',
  'src-tauri/src'
);
console.log(`Windows source verified unchanged from ${baseline.version} (${baseline.ref}).`);
console.log(`Installer metadata set to ${version}; shared native-client port is not used.`);
