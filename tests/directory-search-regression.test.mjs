import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('sidebar search queries both Matrix homeserver directories', async () => {
  const source = await readSource('src/app/features/search/directorySearch.ts');

  assert.match(source, /searchUserDirectory\(\{ term: query, limit:/);
  assert.match(source, /\.publicRooms\(\{/);
  assert.match(source, /generic_search_term: query/);
  assert.match(source, /room_types: getRoomTypes\(scope\)/);
  assert.match(source, /Promise\.allSettled\(requests\)/);
  assert.match(source, /isRoomAlias\(query\)/);
  assert.match(source, /getRoomIdForAlias\(query\)/);
  assert.match(source, /getRoomSummary\(query\)/);
});

test('directory results lead to existing add-user and join-room flows', async () => {
  const source = await readSource('src/app/features/search/Search.tsx');

  assert.match(source, /getDirectCreatePath\(\)/);
  assert.match(source, /DirectCreateSearchParams = \{ userId \}/);
  assert.match(source, /getHomeRoomPath\(roomIdOrAlias\)/);
  assert.match(source, /getSpacePath\(roomIdOrAlias\)/);
  assert.match(source, /!directUserIds\.has\(item\.user\.user_id\)/);
  assert.match(source, /joinedRoomIdentifiers\.has\(item\.room\.room_id\)/);
  assert.match(source, /const item = itemsToRender\[listFocus\.index\]/);
  assert.match(
    source,
    /derivedSearchRoomType === SearchRoomType\.Rooms && isRoomAlias\(trimmedValue\)/
  );
});
