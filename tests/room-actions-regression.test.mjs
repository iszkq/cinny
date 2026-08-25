import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('room and space exits wait for the server and update local membership', async () => {
  const roomPrompt = await readSource('src/app/components/leave-room-prompt/LeaveRoomPrompt.tsx');
  const spacePrompt = await readSource(
    'src/app/components/leave-space-prompt/LeaveSpacePrompt.tsx'
  );

  for (const source of [roomPrompt, spacePrompt]) {
    assert.match(source, /await mx\.leave\(roomId\)/);
    assert.match(source, /updateMyMembership\(Membership\.Leave\)/);
  }
});

test('redactions rely on the SDK local echo after the homeserver accepts them', async () => {
  const source = await readSource('src/app/features/room/message/Message.tsx');
  const timelineSource = await readSource('src/app/features/room/RoomTimeline.tsx');

  assert.match(source, /deleteState\.status !== AsyncStatus\.Success/);
  assert.doesNotMatch(source, /mEvent\.setUnsigned\(/);
  assert.match(timelineSource, /mEvent\.getType\(\) === EventType\.RoomRedaction/);
  assert.match(timelineSource, /onRedaction\(\);[\s\S]*return;/);
});

test('space exit returns home and editable parent hierarchy is cleaned up', async () => {
  const spacePrompt = await readSource(
    'src/app/components/leave-space-prompt/LeaveSpacePrompt.tsx'
  );
  const hierarchySource = await readSource('src/app/utils/space.ts');

  assert.match(spacePrompt, /navigate\(getHomePath\(\), \{ replace: true \}\)/);
  assert.match(hierarchySource, /permissions\.stateEvent\(StateEvent\.SpaceChild/);
  assert.match(
    hierarchySource,
    /sendStateEvent\(space\.roomId, StateEvent\.SpaceChild as any, \{\}, roomId\)/
  );
});

test('chat creation and invitations search the homeserver user directory', async () => {
  const createChat = await readSource('src/app/features/create-chat/CreateChat.tsx');
  const invitePrompt = await readSource(
    'src/app/components/invite-user-prompt/InviteUserPrompt.tsx'
  );

  assert.match(createChat, /useUserDirectorySearch/);
  assert.match(invitePrompt, /useUserDirectorySearch/);
  assert.match(invitePrompt, /UserDirectorySearchMenu/);
});
