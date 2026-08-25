import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('room and space exits wait for the server and forget the local room', async () => {
  const roomPrompt = await readSource('src/app/components/leave-room-prompt/LeaveRoomPrompt.tsx');
  const spacePrompt = await readSource(
    'src/app/components/leave-space-prompt/LeaveSpacePrompt.tsx'
  );

  for (const source of [roomPrompt, spacePrompt]) {
    assert.match(source, /await mx\.leave\(roomId\)/);
    assert.match(source, /await mx\.forget\(roomId\)\.catch/);
  }
});

test('redactions update the visible event after the homeserver accepts them', async () => {
  const source = await readSource('src/app/features/room/message/Message.tsx');

  assert.match(source, /deleteState\.status !== AsyncStatus\.Success/);
  assert.match(source, /redacted_because/);
  assert.match(source, /type: EventType\.RoomRedaction/);
});

test('chat creation and invitations search the homeserver user directory', async () => {
  const createChat = await readSource('src/app/features/create-chat/CreateChat.tsx');
  const invitePrompt = await readSource(
    'src/app/components/invite-user-prompt/InviteUserPrompt.tsx'
  );

  for (const source of [createChat, invitePrompt]) {
    assert.match(source, /searchUserDirectory\(\{ term:/);
    assert.match(source, /display_name/);
    assert.match(source, /limit: 20/);
  }
});
