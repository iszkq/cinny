import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/components/verification/methods.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,Uint8ClampedArray,Error});
const {matrixQrBytes,ANDROID_VERIFICATION_METHODS,verificationFailure}=exports;
const bytes=Uint8ClampedArray.from([77,65,84,82,73,88,2,0,0,4,116,101,115,116,...Array.from({length:80},(_,i)=>(i*137)%256)]);
test('Matrix QR codes preserve binary key bytes through QR generation and decoding',()=>{
 const qr=QRCode.create([{data:new Uint8Array(bytes),mode:'byte'}],{errorCorrectionLevel:'M'});
 const size=(qr.modules.size+8)*6;const pixels=new Uint8ClampedArray(size*size*4);pixels.fill(255);
 for(let row=0;row<qr.modules.size;row++)for(let col=0;col<qr.modules.size;col++)if(qr.modules.get(row,col)){
  for(let y=0;y<6;y++)for(let x=0;x<6;x++){const offset=(((row+4)*6+y)*size+(col+4)*6+x)*4;pixels[offset]=0;pixels[offset+1]=0;pixels[offset+2]=0;}
 }
 const scanned=jsQR(pixels,size,size);assert.ok(scanned);assert.deepEqual(matrixQrBytes(scanned.binaryData),bytes);
});
test('QR scanner rejects URLs, invalid protocol versions and oversized payloads before SDK verification',()=>{
 assert.throws(()=>matrixQrBytes(new TextEncoder().encode('https://example.com/login')),/不是设备验证二维码/);
 const invalid=bytes.slice();invalid[6]=1;assert.throws(()=>matrixQrBytes(invalid));
 assert.throws(()=>matrixQrBytes(new Uint8Array(5000)));assert.throws(()=>matrixQrBytes([]));
});
test('Android advertises SAS and both directions of reciprocal QR verification',()=>{
 for(const method of ['m.sas.v1','m.qr_code.show.v1','m.qr_code.scan.v1','m.reciprocate.v1'])assert.ok(ANDROID_VERIFICATION_METHODS.includes(method));
});
test('camera permission and missing camera errors offer verification alternatives',()=>{
 const denied=new Error();denied.name='NotAllowedError';assert.match(verificationFailure(denied),/表情／数字/);
 const missing=new Error();missing.name='NotFoundError';assert.match(verificationFailure(missing),/未找到相机/);
});
