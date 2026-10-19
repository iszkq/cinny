import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/app/components/calculator/recovery.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
function setup(responses) {
  const calls = [];
  const exports = {};
  vm.runInNewContext(output, { exports, URL, AbortSignal, fetch: async (url, options) => {
    calls.push({url,options});
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return {ok:response.ok ?? true,status:response.status ?? 200,json:async()=>response.body};
  }});
  return {verify:exports.verifyRecoveryLogin,calls};
}
const identity = {baseUrl:'https://chat.example.com',userId:'@me:chat.example.com'};
test('recovery verifies original account without sending PIN or replacing saved session', async () => {
  const {verify,calls} = setup([{body:{user_id:identity.userId,access_token:'temporary-token'}},{}]);
  await verify(identity,'account-password',new AbortController().signal);
  assert.equal(calls.length,2);
  assert.deepEqual(JSON.parse(calls[0].options.body),{
    type:'m.login.password',identifier:{type:'m.id.user',user:identity.userId},password:'account-password',initial_device_display_name:'计算器 PIN 恢复验证',
  });
  assert.equal(calls[1].url,'https://chat.example.com/_matrix/client/v3/logout');
  assert.equal(calls[1].options.headers.Authorization,'Bearer temporary-token');
  assert.equal(calls[1].options.body,'{}');
});
test('incorrect password rejects recovery', async () => {
  const {verify,calls} = setup([{ok:false,status:403}]);
  await assert.rejects(verify(identity,'bad',new AbortController().signal),/不正确/);
  assert.equal(calls.length,1);
});
test('different account cannot authorize a reset and temporary session is revoked', async () => {
  const {verify,calls} = setup([{body:{user_id:'@other:chat.example.com',access_token:'other-token'}},{}]);
  await assert.rejects(verify(identity,'password',new AbortController().signal),/原账户/);
  assert.equal(calls[1].options.headers.Authorization,'Bearer other-token');
});
test('canceled recovery never authorizes reset even after successful login', async () => {
  const controller = new AbortController(); controller.abort();
  const {verify,calls} = setup([{body:{user_id:identity.userId,access_token:'temporary-token'}},{}]);
  await assert.rejects(verify(identity,'password',controller.signal),/取消/);
  assert.equal(calls.length,2);
});
