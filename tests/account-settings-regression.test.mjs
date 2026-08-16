import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('account profile no longer exposes or updates avatar frames', async () => {
  const source = await readSource('src/app/features/settings/account/Profile.tsx');

  assert.doesNotMatch(source, /ProfileAvatarFrame/);
  assert.doesNotMatch(source, /avatarFrames/);
  assert.doesNotMatch(source, /CinnyAvatarFrame/);
  assert.doesNotMatch(source, /头像框/);
  assert.match(source, /validateAvatarFile/);
  assert.match(source, /mx\.setAvatarUrl\(upload\.mxc\)/);
});

test('account password change uses Matrix capability negotiation and UIA', async () => {
  const accountSource = await readSource('src/app/features/settings/account/Account.tsx');
  const passwordSource = await readSource('src/app/features/settings/account/AccountPassword.tsx');

  assert.match(accountSource, /<AccountPassword \/>/);
  assert.match(passwordSource, /capabilities\['m\.change_password'\]/);
  assert.match(passwordSource, /mx\.setPassword\(authDict, newPassword, logoutDevices\)/);
  assert.match(passwordSource, /errorValue\.httpStatus === 401/);
  assert.match(passwordSource, /pickUIAFlow\(nextAuthData\.flows \?\? \[\]\)/);
  assert.match(passwordSource, /<ActionUIA/);
  assert.match(passwordSource, /const \[logoutDevices, setLogoutDevices\] = useState\(false\)/);
});
