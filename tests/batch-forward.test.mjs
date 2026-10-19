import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const api = {};
const types = { RoomMessage: 'm.room.message', Sticker: 'm.sticker', PollStart: 'm.poll.start' };
new Function('exports', 'require', ts.transpileModule(readFileSync(new URL('../src/app/features/room/forwardMessages.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(api, (id) => {
  if (id === 'matrix-js-sdk') return { EventType: { Sticker: 'm.sticker' } };
  if (id.endsWith('/room')) return { MessageEvent: types };
  if (id.endsWith('/polls')) return { UNSTABLE_POLL_START_EVENT_TYPE: 'org.matrix.msc3381.poll.start' };
  throw Error(id);
});
test('batch forwarding delivers chronological messages to each selected room without copying reply/mention relations', async () => {
  const sent = [];
  const mx = { sendMessage: async (room, content) => sent.push([room, content]) };
  const messages = [2, 1].map(timestamp => ({ eventId: `${timestamp}`, roomId: 'source', eventType: types.RoomMessage, timestamp, content: { msgtype: 'm.text', body: `${timestamp}`, 'm.relates_to': { event_id: 'old' }, 'm.mentions': { room: true } } }));
  await api.forwardMessagesToRooms(mx, ['A', 'B', 'C'], messages);
  assert.deepEqual(sent.map(([room, content]) => [room, content.body]), [['A', '1'], ['A', '2'], ['B', '1'], ['B', '2'], ['C', '1'], ['C', '2']]);
  assert.ok(sent.every(([, content]) => !content['m.relates_to'] && !content['m.mentions']));
  assert.ok(messages[0].content['m.relates_to']);
});
