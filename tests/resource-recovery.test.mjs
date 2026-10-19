import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/utils/resourceRecovery.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,Error});
const {isResourceLoadError,canAutomaticallyRecoverResources}=exports;
test('ordinary chat and media network failures never trigger a document reload',()=>{
 for(const message of ['网络错误','NetworkError when attempting to fetch resource.','TypeError: Failed to fetch','Load failed','HTTP 502 Bad Gateway']) {
  assert.equal(isResourceLoadError(new Error(message)),false,message);
  assert.equal(canAutomaticallyRecoverResources(new Error(message),false),false,message);
  assert.equal(canAutomaticallyRecoverResources(new Error(message),true),false,message);
 }
});
test('web module recovery remains available while native packaged assets never auto reload',()=>{
 for(const message of ['Failed to fetch dynamically imported module: /assets/chat.js','Unable to preload CSS for /assets/chat.css','ChunkLoadError: Loading chunk 42 failed']){
  assert.equal(canAutomaticallyRecoverResources(new Error(message),false),true,message);
  assert.equal(canAutomaticallyRecoverResources(new Error(message),true),false,message);
 }
});
