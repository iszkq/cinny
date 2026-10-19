import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/app/utils/dom.ts',import.meta.url),'utf8');
const block=source.slice(source.indexOf('export const copyToClipboard ='),source.indexOf('export const setFavicon'));
function load(ios,native,browser,legacy){const api={};vm.runInNewContext(ts.transpileModule(block,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api,isIOSApp:()=>ios,NativeClipboard:{writeText:native},navigator:{clipboard:{writeText:browser}},copyToClipboardLegacy:legacy});return api.copyToClipboard;}
test('iOS asynchronously generated diagnostics use verified native clipboard even when WebKit denies copying',async()=>{
 let written;
 const copy=load(true,async({text})=>{await new Promise(r=>setTimeout(r,5));written=text;return {verified:true};},()=>assert.fail('must use native clipboard first'),()=>false);
 assert.equal(await copy('解密诊断：测试'),true);assert.equal(written,'解密诊断：测试');
});
test('Android and browser clipboard behavior remains unchanged',async()=>{
 let web=0;const copy=load(false,()=>assert.fail('Android must not enter new iOS plugin path'),async()=>web++,()=>false);
 assert.equal(await copy('text'),true);assert.equal(web,1);
});
test('failed native and web clipboard writes report failure for selectable fallback',async()=>{
 const copy=load(true,async()=>{throw new Error('not available');},async()=>{throw new Error('denied');},()=>false);
 assert.equal(await copy('report'),false);
});
