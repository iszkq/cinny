import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('profile message action opens the prefilled chat creation route without inviting directly', async () => {
  const source = await readSource('src/app/components/user-profile/UserRoomProfile.tsx');

  assert.match(source, /const directSearchParam: DirectCreateSearchParams = \{\s*userId,\s*\}/);
  assert.match(
    source,
    /navigate\(withSearchParam\(getDirectCreatePath\(\), directSearchParam\)\);\s*closeUserRoomProfile\(\)/
  );
  assert.doesNotMatch(source, /mx\.createRoom\(/);
  assert.doesNotMatch(source, /invite: \[userId\]/);
});
