import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') throw new Error('macOS 安装包需要在 Mac 上构建。');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productName = 'Starfire';
const universal = process.argv.includes('--universal');
const bundleOnly = process.argv.includes('--bundle-only');
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
};
if (!bundleOnly) {
  run(process.execPath, [path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'build', '--bundles', 'app', ...(universal ? ['--target', 'universal-apple-darwin'] : [])]);
}
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const bundleDir = path.join(root, 'src-tauri/target', ...(universal ? ['universal-apple-darwin'] : []), 'release/bundle');
const app = path.join(bundleDir, `macos/${productName}.app`);
if (!existsSync(app)) throw new Error('找不到已构建的 Starfire.app');
const arch = universal ? 'universal' : process.arch === 'arm64' ? 'aarch64' : 'x64';
const dmgDir = path.join(bundleDir, 'dmg');
mkdirSync(dmgDir, { recursive: true });
const output = path.join(dmgDir, `Starfire_${version}_${arch}.dmg`);
const staging = mkdtempSync(path.join(tmpdir(), 'starfire-installer-'));
try {
  cpSync(app, path.join(staging, `${productName}.app`), { recursive: true, verbatimSymlinks: true });
  symlinkSync('/Applications', path.join(staging, 'Applications'));
  run('hdiutil', ['create', '-volname', `${productName} ${version}`, '-srcfolder', staging, '-ov', '-format', 'UDZO', output]);
  run('hdiutil', ['verify', output]);
  console.log(`macOS 安装包已生成：${output}`);
} finally { rmSync(staging, { recursive: true, force: true }); }
