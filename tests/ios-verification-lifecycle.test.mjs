import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {EventEmitter} from 'node:events';
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function fixture() {
 const api={},records=[],timers=new Map();let serial=0;
 const win=new EventTarget();
 const events={UserTrustStatusChanged:'trust',KeysChanged:'keys',KeyBackupDecryptionKeyCached:'backup',VerificationRequestReceived:'received'};
 vm.runInNewContext(compile(readFileSync(new URL('../src/app/utils/iosVerification.ts',import.meta.url),'utf8')),{
  exports:api,Error,Event,window:win,setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),
  require:()=>({CryptoEvent:events,ClientEvent:{Sync:'sync'},recordAndroidDiagnostic:(...args)=>records.push(args)})
 });
 return {api,records,win,flush(){const batch=[...timers.values()];timers.clear();batch.forEach(fn=>fn());}};
}
test('iOS known-device verification bypasses failing forced key query',async()=>{
 const {api}=fixture();const request={};let calls=0;
 const mx={getDeviceId:()=> 'PHONE',getSafeUserId:()=> '@a:test',getCrypto:()=>({requestDeviceVerification:async(u,d)=>{assert.equal(d,'PC');calls++;return request;},userHasCrossSigningKeys:()=>assert.fail('must not refresh a known peer')})};
 assert.equal(await api.requestIOSDeviceVerification(mx,'PC'),request);assert.equal(calls,1);
});
test('iOS does not resend an ambiguously failed verification request',async()=>{
 const {api,records}=fixture();let calls=0;
 const mx={getDeviceId:()=> 'PHONE',getSafeUserId:()=> '@a:test',getCrypto:()=>({requestDeviceVerification:async()=>{calls++;throw new Error('network');}})};
 await assert.rejects(api.requestIOSDeviceVerification(mx,'PC'),/network/);assert.equal(calls,1);assert.equal(records.at(-1)[1].stage,'target_request');
});
test('iOS identity notifications leave Rust callbacks and coalesce; cleanup cancels reads',()=>{
 const f=fixture(),mx=new EventEmitter();let reads=0;
 const stop=f.api.observeIOSIdentityChanges(mx,'@a:test',()=>reads++);
 mx.emit('trust','@other:test');f.flush();assert.equal(reads,0);
 mx.emit('trust','@a:test');mx.emit('keys');mx.emit('backup');assert.equal(reads,0);f.flush();assert.equal(reads,1);
 mx.emit('keys');stop();f.flush();assert.equal(reads,1);assert.equal(mx.listenerCount('keys'),0);
});
test('iOS recovers incoming verification received before dialog mount, without reopening it every sync',()=>{
 const f=fixture(),mx=new EventEmitter();let received=0;
 const incoming={transactionId:'incoming',initiatedByMe:false,pending:true};
 mx.getSafeUserId=()=> '@a:test';mx.getCrypto=()=>({getVerificationRequestsToDeviceInProgress:()=>[{transactionId:'outgoing',initiatedByMe:true,pending:true},incoming]});
 const stop=f.api.observeIOSPendingVerification(mx,r=>{assert.equal(r,incoming);received++;});
 assert.equal(received,0);f.flush();assert.equal(received,1);
 mx.emit('sync');f.flush();assert.equal(received,1);
 stop();assert.equal(mx.listenerCount('sync'),0);
});
test('iOS absent database probe waits for aborted transaction cleanup before resolving',async()=>{
 const api={};let request,settled=false;
 vm.runInNewContext(compile(readFileSync(new URL('../src/client/rustCryptoStore.ts',import.meta.url),'utf8')),{exports:api,require:()=>({isNativeApp:()=>true,isAndroidApp:()=>false}),global:{indexedDB:{open:()=>request={transaction:{abort(){}}}}}});
 const pending=api.findExistingRustCryptoDatabasePrefixes(['fresh']).then(result=>{settled=true;return result;});
 request.onupgradeneeded();await Promise.resolve();assert.equal(settled,false);
 request.onerror();assert.equal((await pending).size,0);
});

test('iOS live requests leave the native Rust callback and are not reopened by a later sync',()=>{
 const f=fixture(),mx=new EventEmitter();let count=0;
 const incoming={transactionId:'live',initiatedByMe:false,pending:true};
 mx.getSafeUserId=()=> '@a:test';mx.getCrypto=()=>({getVerificationRequestsToDeviceInProgress:()=>[incoming]});
 const stop=f.api.observeIOSPendingVerification(mx,()=>count++);
 mx.emit('received',incoming);assert.equal(count,0);f.flush();assert.equal(count,1);
 mx.emit('sync');f.flush();assert.equal(count,1);stop();assert.equal(mx.listenerCount('received'),0);
});
