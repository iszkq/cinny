import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { restoreDefaultAIConfig } from './prepare-client-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(readFileSync(path.join(root, 'windows-baseline.json'), 'utf8'));
const target = path.resolve(root, process.argv[2] ?? 'web-client');
if (target === root) throw new Error('Web baseline must use a separate checkout.');
const git = (...args) => execFileSync('git', ['-C', target, ...args], { encoding: 'utf8' }).trim();
if (git('rev-parse', 'HEAD') !== baseline.ref) throw new Error('Unexpected Web baseline commit.');
const patches = [
  'web-pin-lock.patch',
  'web-settings-compat.patch',
  'web-background-recovery.patch',
].map((file) => path.join(root, 'scripts/patches', file));
let preparedThrough = -1;
if (process.argv.includes('--reuse')) {
  preparedThrough = patches.findLastIndex(
    (patchFile) =>
      spawnSync('git', ['-C', target, 'apply', '--reverse', '--check', patchFile], {
        stdio: 'ignore',
      }).status === 0
  );
}
if (preparedThrough < 0) git('diff', '--quiet', 'HEAD');

// Upgrade already prepared historical checkouts without changing their UI baseline.
for (const patchFile of patches.slice(preparedThrough + 1)) {
  git('apply', '--check', patchFile);
  git('apply', patchFile);
}
// Use the same working defaults as native builds, including reused checkouts.
restoreDefaultAIConfig(path.join(target, 'config.json'));
// No general layout/style changes may sneak into the frozen Web checkout.
const pinFiles = patches.flatMap((patchFile) =>
  [...readFileSync(patchFile, 'utf8').matchAll(/^\+\+\+ b\/(.+)$/gm)].map((match) => match[1])
);
git(
  'diff',
  '--quiet',
  'HEAD',
  '--',
  '.',
  ':(exclude)config.json',
  ...pinFiles.map((file) => `:(exclude)${file}`)
);
// Application version and dependencies remain on the historical baseline.
git('diff', '--quiet', 'HEAD', '--', 'package.json', 'package-lock.json');
console.log(`Web ${baseline.version} (${baseline.ref}) prepared with PIN and background recovery.`);
