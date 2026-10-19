import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const store = new Map();
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/components/calculator/androidReload.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,sessionStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},Date});
const {saveAndroidReloadUnlock:save,readAndroidReloadUnlock:read,clearAndroidReloadUnlock:clear}=exports;
const config={mode:'time',idleMinutes:5,backgroundSeconds:30};
test('Android reload preserves unlocked session and original idle time',()=>{
 save(config,1000);const state=read(config,true,'reload',2000);
 assert.equal(state.idleAt,1000);assert.equal(read(config,true,'reload',2000),undefined);
});
test('cold starts, history navigation and iOS never restore Android reload marker',()=>{
 for(const [android,kind] of [[true,'navigate'],[true,'back_forward'],[false,'reload']]){
  save(config,1000);assert.equal(read(config,android,kind,2000),undefined);
 }
});
test('reload cannot bypass manual lock, idle timeout, background timeout or changed PIN',()=>{
 save(config,1000);clear();assert.equal(read(config,true,'reload',2000),undefined);
 save(config,1000);assert.equal(read(config,true,'reload',301000),undefined);
 save(config,1000,2000);assert.equal(read(config,true,'reload',32000),undefined);
 save(config,1000,2000);assert.equal(read(config,true,'reload',3000).awayAt,2000);
 const pin={...config,mode:'pin',pin:{salt:'first'}};
 save(pin,1000);assert.equal(read({...pin,pin:{salt:'second'}},true,'reload',2000),undefined);
});
test('immediate background locking and invalid or future timestamps remain locked',()=>{
 const immediate={...config,backgroundSeconds:0};
 save(immediate,1000);assert.equal(read(immediate,true,'reload',2000).idleAt,1000);
 save(immediate,1000,1500);assert.equal(read(immediate,true,'reload',2000),undefined);
 save(config,3000);assert.equal(read(config,true,'reload',2000),undefined);
 save(config,1000);store.set([...store.keys()][0],'broken');assert.equal(read(config,true,'reload',2000),undefined);
});
