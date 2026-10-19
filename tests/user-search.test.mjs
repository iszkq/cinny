import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const api = {};
new Function('exports', ts.transpileModule(fs.readFileSync(new URL('../src/app/utils/searchUsers.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(api);
const client = (overrides={}) => ({ getUsers: () => [], searchUserDirectory: async () => ({ results: [] }), ...overrides });
test('full remote ID uses profile even when directory omits the user, including server ports', async () => {
  let queried;
  const users = await api.searchUsers(client({getProfileInfo: async id => { queried=id; return { displayname:'朋友' }; }}), 'alice:remote.test:8448');
  assert.equal(queried, '@alice:remote.test:8448');
  assert.equal(users[0].display_name, '朋友');
});
test('known contacts remain searchable on directory failure', async () => {
  const users = await api.searchUsers(client({ getUsers: () => [{ userId: '@friend:test', displayName: '小明' }], searchUserDirectory: async () => { throw Error('offline'); } }), '小明');
  assert.equal(users[0].user_id, '@friend:test');
});
test('directory and local matches are deduplicated and full ID is first', async () => {
  const users = await api.searchUsers(client({ getUsers: () => [{userId:'@alice:test',displayName:'old'}], searchUserDirectory: async () => ({results:[{user_id:'@alice:test',display_name:'new'}]}),getProfileInfo:async()=>({displayname:'profile'}) }), '@alice:test');
  assert.equal(users.length,1); assert.equal(users[0].display_name,'profile');
});
test('failure is distinct from a successful search with no matches', async () => {
  assert.deepEqual(await api.searchUsers(client(), 'missing'), []);
  await assert.rejects(api.searchUsers(client({searchUserDirectory:async()=>{throw Error('offline');}}),'missing'), /搜索暂时不可用/);
});
