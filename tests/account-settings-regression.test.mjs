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

test('account settings link to the server account management page', async () => {
  const accountSource = await readSource('src/app/features/settings/account/Account.tsx');
  const profileSource = await readSource('src/app/features/settings/account/Profile.tsx');

  assert.doesNotMatch(accountSource, /AccountPassword/);
  assert.match(profileSource, /账户管理/);
  assert.match(profileSource, /authMetadata\?\.account_management_uri/);
  assert.match(profileSource, /openExternalUrl\(accountManagementUrl\)/);
  assert.match(
    profileSource,
    /account\.\$\{homeserverUrl\.hostname\.slice\('matrix\.'\.length\)\}/
  );
});
