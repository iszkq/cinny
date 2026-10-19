import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/components/native-chat/preview.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,Date});
const {previewText,previewTime}=exports;
test('previews remove reply fallback and retain plain text',()=>{
 assert.equal(previewText('m.room.message',{body:'> @me:server: quoted\n> next\n\n新的消息\n第二行'}),'新的消息 第二行');
});
test('encrypted, redacted and attachment previews do not expose stale body text',()=>{
 assert.equal(previewText('m.room.encrypted',{body:'ciphertext'}),'加密消息');
 assert.equal(previewText('m.room.message',{body:'old secret'},true),'消息已撤回');
 assert.equal(previewText('m.room.message',{msgtype:'m.image',body:'private-filename.jpg'}),'[图片]');
 assert.equal(previewText('m.room.message',{msgtype:'m.audio'}),'[语音]');
});
test('preview timestamps distinguish today and yesterday across midnight',()=>{
 const now=new Date(2026,9,15,0,5).getTime();
 assert.equal(previewTime(new Date(2026,9,15,0,2).getTime(),now),'00:02');
 assert.equal(previewTime(new Date(2026,9,14,23,59).getTime(),now),'昨天');
 assert.equal(previewTime(0,now),'');
});
