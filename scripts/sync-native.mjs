import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const platform = process.argv[2];
if (platform !== 'android' && platform !== 'ios') {
  throw new Error('Expected android or ios');
}
if (!process.env.npm_execpath) throw new Error('Run this script through npm run.');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {
  ...process.env,
  VITE_ANDROID_APP: String(platform === 'android'),
  VITE_IOS_APP: String(platform === 'ios'),
};
const run = (script, args) => {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} failed (${result.status})`);
};

run(process.env.npm_execpath, ['run', 'build']);
run(path.join(root, 'node_modules/@capacitor/cli/bin/capacitor'), ['sync', platform]);
