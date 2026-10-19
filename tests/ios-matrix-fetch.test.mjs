import assert from 'node:assert/strict';import test from 'node:test';import vm from 'node:vm';import{readFileSync}from'node:fs';import ts from'typescript';
import {createClient} from 'matrix-js-sdk';
function fixture(){const api={},records=[];vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/client/iosMatrixFetch.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api,URL,Request,Response,Headers,DOMException,Error,Promise,globalThis,require:()=>({recordAndroidDiagnostic:(...args)=>records.push(args)})});return {api,records};}
test('iOS native Matrix reads retain encoded query, auth, server status and long-poll allowance',async()=>{
 const {api,records}=fixture();let options;const fetcher=api.createIOSMatrixFetch(async opts=>{options=opts;return {status:200,headers:{'content-type':'application/json'},data:{next_batch:'done'}};},()=>assert.fail('WebKit path must not run'),true);
 const url='https://example.com/_matrix/client/v3/sync?since=a%2Fb&timeout=30000';const response=await fetcher(url,{headers:{Authorization:'Bearer TEST_ONLY'}});
 assert.equal(options.url,url);assert.equal(options.headers.authorization,'Bearer TEST_ONLY');assert.ok(options.readTimeout>30000);assert.deepEqual(await response.json(),{next_batch:'done'});assert.ok(!JSON.stringify(records).includes('TEST_ONLY'));assert.ok(!JSON.stringify(records).includes(url));
});
test('actual SDK can refresh a token after a native GET returns M_UNKNOWN_TOKEN',async()=>{
 const {api}=fixture();let reads=0,refreshes=0;
 const fetcher=api.createIOSMatrixFetch(async opts=>{reads++;if(reads===1)return {status:401,headers:{'content-type':'application/json'},data:{errcode:'M_UNKNOWN_TOKEN',error:'expired'}};assert.equal(opts.headers.authorization,'Bearer A2');return {status:200,headers:{'content-type':'application/json'},data:{devices:[{device_id:'TEST'}]}};},()=>assert.fail('browser fetch unnecessary'),true);
 const mx=createClient({baseUrl:'https://example.com',userId:'@test:example.com',deviceId:'TEST',accessToken:'A1',refreshToken:'R1',fetchFn:fetcher,tokenRefreshFunction:async()=>{refreshes++;return {accessToken:'A2',refreshToken:'R2'};}});
 assert.equal((await mx.getDevices()).devices[0].device_id,'TEST');assert.equal(refreshes,1);assert.equal(reads,2);mx.stopClient();
});
test('writes and ordinary web clients keep browser fetch, with no native replay',async()=>{
 const {api}=fixture();let calls=0;const browser=async()=>{calls++;throw new Error('network');};const native=()=>assert.fail('must not invoke native');
 await assert.rejects(api.createIOSMatrixFetch(native,browser,true)('https://example.com/_matrix/client/v3/send',{method:'PUT'}),/network/);
 await assert.rejects(api.createIOSMatrixFetch(native,browser,false)('https://example.com/_matrix/client/v3/devices'),/network/);assert.equal(calls,2);
});
test('SDK abort stops waiting on native GET; a late response cannot complete it',async()=>{
 const {api}=fixture();let finish;const controller=new AbortController();
 const fetcher=api.createIOSMatrixFetch(()=>new Promise(resolve=>{finish=resolve;}),()=>assert.fail(),true);
 const pending=fetcher('https://example.com/_matrix/client/v3/sync',{signal:controller.signal});await Promise.resolve();controller.abort();await assert.rejects(pending,e=>e.name==='AbortError');finish({status:200,headers:{},data:{}});await Promise.resolve();
});
