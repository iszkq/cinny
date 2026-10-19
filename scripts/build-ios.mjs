import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
};

if (process.platform !== 'darwin') throw new Error('iOS 编译需要装有完整 Xcode 的 Mac。');
// Set DEVELOPER_DIR to use an Xcode installation without changing the system default.
if (!process.env.DEVELOPER_DIR && existsSync('/Applications/Xcode.app/Contents/Developer')) {
  process.env.DEVELOPER_DIR = '/Applications/Xcode.app/Contents/Developer';
}
run('xcodebuild', ['-version']);
run('xcrun', ['--sdk', 'iphoneos', '--show-sdk-path']);
process.env.VITE_IOS_APP = 'true';
run('npm', ['run', 'test:ios:crypto']);
run('npm', ['run', 'ios:sync']);

const derived = path.join(root, 'ios/DerivedData');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
run('xcodebuild', [
  '-project', 'ios/App/App.xcodeproj', '-scheme', 'App',
  '-configuration', 'Release', '-sdk', 'iphoneos',
  '-destination', 'generic/platform=iOS', '-derivedDataPath', derived,
  'IPHONEOS_DEPLOYMENT_TARGET=16.0', `MARKETING_VERSION=${version}`,
  'CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO', 'CODE_SIGN_IDENTITY=',
  'build',
]);

const app = path.join(derived, 'Build/Products/Release-iphoneos/App.app');
if (!existsSync(path.join(app, 'App'))) throw new Error('没有找到已编译的 iOS 可执行文件。');
const outputDir = path.resolve(root, '../安装包');
mkdirSync(outputDir, { recursive: true });
const output = path.join(outputDir, `Calculator_${version}_build26_iOS16.ipa`);
const staging = mkdtempSync(path.join(tmpdir(), 'starfire-ios-'));
try {
  cpSync(app, path.join(staging, 'Payload/App.app'), { recursive: true });
  const archive = path.join(staging, 'package.ipa');
  run('/usr/bin/ditto', ['-c', '-k', '--keepParent', 'Payload', archive], staging);
  run('/usr/bin/unzip', ['-tq', archive]);
  cpSync(archive, output);
  console.log(`已生成未签名 IPA（需要巨魔等兼容安装方式）：${output}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
