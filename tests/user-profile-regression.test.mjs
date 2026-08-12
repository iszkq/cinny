import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('profile message action opens an existing DM or creates an encrypted one directly', async () => {
  const source = await readSource('src/app/components/user-profile/UserRoomProfile.tsx');

  assert.match(source, /const existingRoom = getDMRoomFor\(mx, userId\)/);
  assert.match(source, /directs\.includes\(existingRoom\.roomId\)/);
  assert.match(source, /await addRoomIdToMDirect\(mx, existingRoom\.roomId, userId\)/);
  assert.match(
    source,
    /initialState: ICreateRoomStateEvent\[\] = \[createRoomEncryptionState\(\)\]/
  );
  assert.match(source, /is_direct: true/);
  assert.match(source, /invite: \[userId\]/);
  assert.match(source, /preset: Preset\.TrustedPrivateChat/);
  assert.match(source, /await addRoomIdToMDirect\(mx, result\.room_id, userId\)/);
  assert.match(source, /navigate\(getDirectRoomPath\(roomId\)\);\s*closeUserRoomProfile\(\)/);
  assert.doesNotMatch(source, /withSearchParam\(getDirectCreatePath\(\)/);
  assert.match(source, /disabled=\{messageOpening\}/);
});
