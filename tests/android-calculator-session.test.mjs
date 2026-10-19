import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const exports={};
const local=new Map();
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/components/calculator/androidSession.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,Date,window:{},localStorage:{getItem:key=>local.get(key)??null,setItem:(key,value)=>local.set(key,value)},require:()=>({registerPlugin:()=>({})})});
const {resolveAndroidSession:resolve}=exports;
const unlocked={locked:false,lastSeen:1000,delaySeconds:300,instanceId:'A'};
test('initial load, page reload and long foreground usage do not create a lock',()=>{
 assert.equal(resolve(undefined,300,100000,'navigate').locked,false);
 assert.equal(resolve(unlocked,300,1000000,'reload',{instanceId:'A'}).locked,false);
 assert.equal(resolve(unlocked,0,1000000,'navigate',{instanceId:'A'}).locked,false);
});
test('one minute outside does not lock with a five minute threshold; five minutes does',()=>{
 const away={...unlocked,awayAt:1000};
 assert.equal(resolve(away,300,61000,'navigate').locked,false);
 assert.equal(resolve(away,300,300999,'navigate').locked,false);
 assert.equal(resolve(away,300,301000,'navigate').locked,true);
});
test('native process restart preserves remaining time and applies timeout after app closure',()=>{
 assert.equal(resolve(unlocked,300,61000,'navigate',{instanceId:'B'}).locked,false);
 assert.equal(resolve(unlocked,300,301000,'navigate',{instanceId:'B'}).locked,true);
});
test('manual lock survives reload, cold restart and an arbitrary amount of time',()=>{
 for(const navigation of ['reload','navigate','back_forward'])assert.equal(resolve({...unlocked,locked:true},300,2000,navigation).locked,true);
});
test('slow initial loading is not counted as time outside after native activity resumed',()=>{
 const lifecycle={foreground:true,awayAt:1000,resumedAt:61000,instanceId:'B'};
 assert.equal(resolve(unlocked,300,1000000,'navigate',lifecycle).locked,false);
 assert.equal(resolve(unlocked,300,1000000,'navigate',{...lifecycle,resumedAt:301000}).locked,true);
});
test('actual background timeout remains in force even on page reload',()=>{
 assert.equal(resolve({...unlocked,awayAt:1000},300,301000,'reload').locked,true);
 assert.equal(resolve({...unlocked,awayAt:1000},0,1000,'reload').locked,true);
});

test('temporary config read failure retains saved five-minute policy instead of shortening it',()=>{
 exports.saveAndroidSession({...unlocked,awayAt:1000});
 assert.equal(exports.restoreAndroidSession(undefined,'reload',61000).locked,false);
 assert.equal(exports.restoreAndroidSession(undefined,'reload',301000).locked,true);
});
