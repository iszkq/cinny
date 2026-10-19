import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {encodeRecoveryKey,decodeRecoveryKey} from 'matrix-js-sdk/lib/crypto-api/index.js';
const api={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/utils/iosVerification.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api,Error,require:()=>({recordAndroidDiagnostic(){}})});
test('iOS copied recovery keys retain their exact key bytes despite line wrapping or invisible whitespace',()=>{
 const key=Uint8Array.from({length:32},(_,i)=>i*7%256);
 const encoded=encodeRecoveryKey(key);
 const pasted='\n'+encoded.replaceAll(' ','\u00a0\n\u200b')+'\t';
 assert.deepEqual(decodeRecoveryKey(api.normalizeIOSRecoveryKey(pasted)),key);
 const changed=encoded.replace(/\S/,ch=>ch==='1'?'2':'1');
 assert.throws(()=>decodeRecoveryKey(api.normalizeIOSRecoveryKey(changed)));
});
test('Rust ownership failures are reported as internal errors rather than incorrect recovery keys',()=>{
 assert.match(api.iosVerificationError(new Error('attempted to take ownership of Rust value while it was borrowed')),/内部.*不是恢复密钥错误/);
});

test('normalized iOS recovery key passes the real SDK AES/MAC check without changing secret storage',async()=>{
 const {calculateKeyCheck}=await import('matrix-js-sdk/lib/secret-storage.js');
 const {createClient}=await import('matrix-js-sdk');
 const key=Uint8Array.from({length:32},(_,i)=>(i*11+3)%256);
 const checked=await calculateKeyCheck(key);
 const info={algorithm:'m.secret_storage.v1.aes-hmac-sha2',iv:checked.iv,mac:checked.mac};
 const mx=createClient({baseUrl:'https://example.com',fetchFn:()=>assert.fail('local key validation must not write to the server')});
 const decoded=decodeRecoveryKey(api.normalizeIOSRecoveryKey(encodeRecoveryKey(key).replaceAll(' ','\n\u00a0')));
 assert.equal(await mx.secretStorage.checkKey(decoded,info),true);
 const wrong=decoded.slice();wrong[0]^=1;
 assert.equal(await mx.secretStorage.checkKey(wrong,info),false);
});
