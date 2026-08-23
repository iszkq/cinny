import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('login retries a stale reused device once without masking valid credentials', async () => {
  const source = await readSource('src/app/pages/auth/login/loginUtil.ts');

  assert.match(source, /err\?\.httpStatus === 403 && canReuseDeviceId/);
  assert.match(source, /mx\.loginRequest\(data\)/);
  assert.match(source, /reusedDeviceId = false/);
  assert.match(source, /error: err\.data\?\.error \?\? err\.message/);
});

test('media seeking ignores non-finite values and clamps to duration', async () => {
  const seekSource = await readSource('src/app/hooks/media/useMediaSeek.ts');
  const audioSource = await readSource('src/app/components/message/content/AudioContent.tsx');

  assert.match(seekSource, /!Number\.isFinite\(time\)/);
  assert.match(seekSource, /Math\.min\(time, duration\)/);
  assert.match(seekSource, /targetEl\.currentTime = boundedTime/);
  assert.match(audioSource, /Number\.isFinite\(ct\)/);
  assert.match(audioSource, /Number\.isFinite\(nextTime\)/);
});

test('login shows server-specific 403 reasons instead of always blaming credentials', async () => {
  const source = await readSource('src/app/pages/auth/login/PasswordLoginForm.tsx');

  assert.match(source, /getForbiddenLoginMessage/);
  assert.match(source, /device\.?limit|maximum number|\u8bbe\u5907/);
  assert.match(source, /return `\\u767b\\u5f55\\u88ab\\u670d\\u52a1\\u5668\\u62d2\\u7edd/);
  assert.match(source, /invalid username\\\/password/);
  assert.match(source, /isDeviceLimitLoginError/);
  assert.match(source, /account_management_uri/);
  assert.match(source, /打开服务器账户管理页面删除设备/);
});

test('device settings offer safe inactive-device selection instead of silent deletion', async () => {
  const source = await readSource('src/app/features/settings/devices/OtherDevices.tsx');

  assert.match(source, /getInactiveDeviceIds/);
  assert.match(source, /DEVICE_CLEANUP_PRESETS = \[7, 30\]/);
  assert.match(source, /last_seen_ts/);
  assert.match(source, /不会自动删除/);
  assert.match(source, /完成身份验证/);
  assert.match(source, /authMetadata \? '在账户管理中处理' : '退出登录'/);
  assert.match(source, /handleSelectedDeviceAction/);
});
