import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const selectClientTarget = (env, forceNative = false) =>
  forceNative ||
  env.VITE_ANDROID_APP === 'true' ||
  env.VITE_IOS_APP === 'true' ||
  Boolean(env.TAURI_ENV_PLATFORM)
    ? 'native'
    : 'web';

const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
};

export function prepareWebClient() {
  const baseline = JSON.parse(readFileSync(path.join(root, 'windows-baseline.json'), 'utf8'));
  const target = path.join(root, 'web-client');
  if (!existsSync(target)) {
    const localBaseline = spawnSync(
      'git',
      ['-C', root, 'cat-file', '-e', `${baseline.ref}^{commit}`],
      { stdio: 'ignore' }
    );
    if (localBaseline.status === 0) {
      run('git', ['-C', root, 'worktree', 'add', '--detach', target, baseline.ref]);
    } else {
      run('git', [
        'clone',
        '--no-checkout',
        '--filter=blob:none',
        '--depth',
        '1',
        'https://github.com/iszkq/cinny.git',
        target,
      ]);
      run('git', ['-C', target, 'fetch', '--depth', '1', 'origin', baseline.ref]);
      run('git', ['-C', target, 'checkout', '--detach', baseline.ref]);
    }
  }
  // Reuse only a checkout on the pinned commit; never reset a developer's changes.
  run(process.execPath, [path.join(root, 'scripts/prepare-web-client.mjs'), target, '--reuse']);
  return target;
}

export function runClient(command, args = [], env = process.env) {
  if (!['start', 'build', 'preview'].includes(command)) throw new Error('Unknown client command.');
  const target = selectClientTarget(env, args.includes('--native'));
  const viteArgs = args.filter((arg) => arg !== '--native');
  if (target === 'native') {
    run(process.execPath, [
      path.join(root, 'node_modules/vite/bin/vite.js'),
      ...(command === 'start' ? [] : [command]),
      ...viteArgs,
    ]);
    if (command === 'build')
      run(process.execPath, [path.join(root, 'scripts/verify-build-assets.mjs')]);
    return;
  }

  console.log('Web client: classic 1.9.10 UI with PIN protection.');
  const webRoot = prepareWebClient();
  const npmCli = process.env.npm_execpath;
  if (!npmCli)
    throw new Error('Run this command through npm start / npm run build / npm run preview.');
  if (!existsSync(path.join(webRoot, 'node_modules/vite/bin/vite.js'))) {
    run(process.execPath, [npmCli, 'ci', '--no-audit', '--no-fund'], webRoot);
  }
  run(
    process.execPath,
    [npmCli, 'run', command, ...(viteArgs.length ? ['--', ...viteArgs] : [])],
    webRoot
  );
  if (command === 'build') {
    // Keep existing static-hosting instructions and Docker's /src/dist output path.
    cpSync(path.join(webRoot, 'dist'), path.join(root, 'dist'), { recursive: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runClient(process.argv[2] ?? 'start', process.argv.slice(3));
}
