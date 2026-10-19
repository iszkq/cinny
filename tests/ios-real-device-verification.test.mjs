import {createRequire} from 'node:module';import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);const sdk=require('matrix-js-sdk');const w=require('@matrix-org/matrix-sdk-crypto-wasm');const {VerificationPhase}=require('matrix-js-sdk/lib/crypto-api');
for (const mode of ['sas','qr']) test(`real SDK targeted request completes ${mode} verification with another Rust cryptographic device`, { timeout: 20000 }, async (t) => {
// Rust's verification expiry timers otherwise keep the isolated Node worker
// alive after both in-memory clients close. Track only this fixture's timers.
const originalSetTimeout=globalThis.setTimeout;
const fixtureTimers=new Set();
globalThis.setTimeout=(...args)=>{const timer=originalSetTimeout(...args);fixtureTimers.add(timer);return timer;};
t.after(()=>{globalThis.setTimeout=originalSetTimeout;for(const timer of fixtureTimers)clearTimeout(timer);});
const tsDiagnostics=require('typescript');const diagnostics={};
vm.runInNewContext(tsDiagnostics.transpileModule(readFileSync(new URL('../src/client/iosCryptoDiagnostics.ts',import.meta.url),'utf8'),{compilerOptions:{module:tsDiagnostics.ModuleKind.CommonJS}}).outputText,{exports:diagnostics,Error,Promise,require:()=>({recordAndroidDiagnostic(){}})});
diagnostics.installIOSCryptoCallDiagnostics(w,()=>{});
await w.initAsync();const user='@sdk-test:example.com';const silent={trace(){},debug(){},info(){},warn(){},error(){},getChild(){return this;}};
const peer=await w.OlmMachine.initialize(new w.UserId(user),new w.DeviceId('PEER'));
await peer.bootstrapCrossSigning(true);
const identity=await peer.getIdentity(new w.UserId(user));
const cross={master_keys:{[user]:JSON.parse(identity.masterKey)},self_signing_keys:{[user]:JSON.parse(identity.selfSigningKey)},user_signing_keys:{[user]:JSON.parse(identity.userSigningKey)}};identity.free();
const peerUpload=(await peer.outgoingRequests()).find(r=>r.type===w.RequestType.KeysUpload);const peerKeys=JSON.parse(peerUpload.body).device_keys;
let ownKeys;const peerInbox=[];const ownInbox=[];
const outgoing=(request,target,inbox)=>{const body=JSON.parse(request.body);for(const content of Object.values(body.messages[user]||{}))inbox.push({sender:user,type:request.event_type,content});};
const mx=sdk.createClient({baseUrl:'https://example.com',userId:user,deviceId:'IOS_TEST',accessToken:'test-only',logger:silent,verificationMethods:['m.sas.v1','m.qr_code.show.v1','m.qr_code.scan.v1','m.reciprocate.v1'],fetchFn:async(url,opt)=>{
 const path=new URL(url).pathname;let data={};
 if(path.endsWith('/keys/query'))data={device_keys:{[user]:{PEER:peerKeys,...(ownKeys?{IOS_TEST:ownKeys}:{})}},...cross,failures:{}};
 if(path.endsWith('/keys/upload'))data={one_time_key_counts:{signed_curve25519:50}};
 if(path.includes('/sendToDevice/')){const body=JSON.parse(opt.body);for(const content of Object.values(body.messages[user]||{}))peerInbox.push({sender:user,type:decodeURIComponent(path.split('/').at(-2)),content});}
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
}});
await mx.initRustCrypto({useIndexedDB:false});const crypto=mx.getCrypto();const machine=crypto.olmMachine;
ownKeys=JSON.parse((await machine.outgoingRequests()).find(r=>r.type===w.RequestType.KeysUpload).body).device_keys;
const peerQuery=peer.queryKeysForUsers([new w.UserId(user)]);await peer.markRequestAsSent(peerQuery.id,peerQuery.type,JSON.stringify({device_keys:{[user]:{PEER:peerKeys,IOS_TEST:ownKeys}},...cross,failures:{}}));
const ts=require('typescript');const api={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/utils/iosVerification.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api,Error,require:()=>({recordAndroidDiagnostic(){}})});
const request=await api.requestIOSDeviceVerification(mx,'PEER');
const deliver=async()=>{if(peerInbox.length)await peer.receiveSyncChanges(JSON.stringify(peerInbox.splice(0)),new w.DeviceLists(),new Map(),new Set());if(ownInbox.length)await crypto.preprocessToDeviceMessages(ownInbox.splice(0));await new Promise(r=>setTimeout(r,5));};
await deliver();const peerRequest=peer.getVerificationRequest(new w.UserId(user),request.transactionId);assert.ok(peerRequest);
const accepted=peerRequest.acceptWithMethods([w.VerificationMethod.SasV1,w.VerificationMethod.QrCodeScanV1,w.VerificationMethod.QrCodeShowV1,w.VerificationMethod.ReciprocateV1]);outgoing(accepted,'IOS_TEST',ownInbox);await deliver();
assert.equal(request.phase,VerificationPhase.Ready);console.log('PASS real Rust peer receives targeted request and accepts actual SDK negotiation');
// Render the production method chooser with a real Rust-backed request: its
// legacy methods getter throws, so a mocked methods array misses this crash.
assert.throws(()=>request.methods,/not implemented/);
const chooser={};
vm.runInNewContext(require('typescript').transpileModule(readFileSync(new URL('../src/app/components/verification/AndroidVerification.tsx',import.meta.url),'utf8'),{compilerOptions:{module:require('typescript').ModuleKind.CommonJS,jsx:require('typescript').JsxEmit.React,esModuleInterop:true}}).outputText,{exports:chooser,require:id=>{
 if(id.includes('nativePlatform'))return {isIOSApp:()=>false};
 if(id.endsWith('.css'))return {};
 if(id==='./VerificationQr')return {VerificationQrCode:()=>null,VerificationQrScanner:()=>null};
 if(id==='./methods')return {verificationFailure:e=>e.message};
 return require(id);
}});
const rendered=require('react-dom/server').renderToStaticMarkup(require('react').createElement(chooser.AndroidVerificationMethods,{request}));
for(const label of ['扫描另一台设备的二维码','出示我的验证二维码','表情符号／数字对比'])assert.ok(rendered.includes(label));
console.log('PASS real Rust request renders all negotiated native choices without calling the unimplemented methods getter');

if (mode === 'qr') {
 const qr=await peerRequest.generateQrCode();assert.ok(qr);
 const scanner=await request.scanQRCode(qr.toBytes());
 const verifying=scanner.verify();verifying.catch(()=>{});
 await deliver();
 const confirmation=peerRequest.getVerification();assert.ok(confirmation);
 const confirmed=confirmation.confirmScanning();if(confirmed)outgoing(confirmed,'IOS_TEST',ownInbox);
 for(let round=0;round<20;round++){
   for(const r of await peer.outgoingRequests())if(r.type===w.RequestType.ToDevice){outgoing(r,'IOS_TEST',ownInbox);await peer.markRequestAsSent(r.id,r.type,'{}');}
   await crypto.outgoingRequestsManager.doProcessOutgoingRequests();await deliver();
   if(request.phase===VerificationPhase.Done&&peerRequest.isDone())break;
 }
 assert.equal(request.phase,VerificationPhase.Done);assert.ok(peerRequest.isDone());await verifying;
 console.log('PASS real SDK scans real peer QR bytes and both complete reciprocal verification');
 assert.equal((await crypto.getUserVerificationStatus(user)).isCrossSigningVerified(),true);
 console.log('PASS QR establishes trust in the existing account identity');
 mx.stopClient();peer.close();return;
}
const verifier=await request.startVerification('m.sas.v1');const verificationTask=verifier.verify();verificationTask.catch(()=>{});await deliver();let peerSas=peerRequest.getVerification();assert.ok(peerSas);const accept=peerSas.accept();if(accept)outgoing(accept,'IOS_TEST',ownInbox);await deliver();
async function pump(){for(let round=0;round<12;round++){
 for(const r of await peer.outgoingRequests()){if(r.type===w.RequestType.ToDevice){outgoing(r,'IOS_TEST',ownInbox);await peer.markRequestAsSent(r.id,r.type,'{}');}}
 await crypto.outgoingRequestsManager.doProcessOutgoingRequests();await deliver();
 if(verifier.getShowSasCallbacks()&&peerSas.canBePresented())return;
}}
await pump();const sas=verifier.getShowSasCallbacks();assert.ok(sas);assert.ok(peerSas.canBePresented());const decimals=peerSas.decimals();assert.deepEqual(sas.sas.decimal,Array.from(decimals));console.log('PASS two real cryptographic devices display identical SAS numbers');
await sas.confirm();for(const r of await peerSas.confirm())outgoing(r,'IOS_TEST',ownInbox);
for(let n=0;n<15;n++){await pump();await deliver();if(request.phase===VerificationPhase.Done&&peerRequest.isDone())break;}
assert.equal(request.phase,VerificationPhase.Done);assert.ok(peerRequest.isDone());await verificationTask;console.log('PASS real SDK and Rust peer complete mutual SAS verification without ownership error');
assert.equal((await crypto.getUserVerificationStatus(user)).isCrossSigningVerified(),true);
console.log('PASS SAS establishes trust in the existing account identity');
mx.stopClient();peer.close();

});
