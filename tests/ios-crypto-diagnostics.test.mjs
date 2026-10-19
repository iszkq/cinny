import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
function fixture(){const api={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/client/iosCryptoDiagnostics.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api,Error,Promise,require:()=>({})});return api;}
test('iOS crypto diagnostics preserve arguments, receiver, result and original failures without logging secrets',async()=>{
 const api=fixture(),records=[];const originalError=new Error('attempted to take ownership of Rust value while it was borrowed SECRET');
 class Device{requestVerification(value){assert.equal(this,device);assert.equal(value,'SECRET');throw originalError;}free(){return 42;}}
 class OlmMachine{async getDevice(value){assert.equal(value,'SECRET');throw originalError;}}
 const device=new Device(),machine=new OlmMachine();
 api.installIOSCryptoCallDiagnostics({Device,OlmMachine},(...args)=>records.push(args));
 assert.throws(()=>device.requestVerification('SECRET'),e=>e===originalError);
 await assert.rejects(machine.getDevice('SECRET'),e=>e===originalError);
 assert.equal(device.free(),42);
 assert.equal(records.length,2);assert.ok(!JSON.stringify(records).includes('SECRET'));
 assert.equal(records[0][1].operation,'Device.requestVerification');assert.equal(records[1][1].operation,'OlmMachine.getDevice');
});
test('iOS diagnostic installation and repeated failures do not duplicate wrappers or flood the report',()=>{
 const api=fixture();let records=0,calls=0;
 class Device{free(){calls++;throw new Error('Out of bounds table access');}}
 const bindings={Device};api.installIOSCryptoCallDiagnostics(bindings,()=>records++);const wrapper=Device.prototype.free;
 api.installIOSCryptoCallDiagnostics(bindings,()=>records++);assert.equal(Device.prototype.free,wrapper);
 const device=new Device();for(let i=0;i<5;i++)assert.throws(()=>device.free());
 assert.equal(records,1);assert.equal(calls,5);
});
