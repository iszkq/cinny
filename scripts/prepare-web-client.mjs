import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(readFileSync(path.join(root, 'windows-baseline.json'), 'utf8'));
const target = path.resolve(root, process.argv[2] ?? 'web-client');
if (target === root) throw new Error('Web baseline must use a separate checkout.');
const git = (...args) => execFileSync('git', ['-C', target, ...args], { encoding: 'utf8' }).trim();
if (git('rev-parse', 'HEAD') !== baseline.ref) throw new Error('Unexpected Web baseline commit.');
git('diff', '--quiet', 'HEAD');

// Do not publish credentials from the historical configuration.
const configFile = path.join(target, 'config.json');
const config = JSON.parse(readFileSync(configFile, 'utf8'));
config.audioTranscription.defaultAihubmixApiKey = '';
config.imageOcr.defaultAihubmixApiKey = '';
writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);

// Every other tracked file, including package versions and lockfiles, stays unchanged.
git('diff', '--quiet', 'HEAD', '--', '.', ':(exclude)config.json');
console.log(`Web source and version preserved at ${baseline.version} (${baseline.ref}).`);
