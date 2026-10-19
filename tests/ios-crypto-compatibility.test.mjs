import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const directory=new URL('../vendor/ios-matrix-sdk-crypto-wasm/',import.meta.url);
test('iOS compatibility binary and both generated bindings match their reviewed artifact checksums',()=>{
 const integrity=JSON.parse(readFileSync(new URL('integrity.json',directory)));
 assert.equal(integrity.upstream,'18.4.0');
 for(const [file,hash]of Object.entries(integrity.sha256))assert.equal(createHash('sha256').update(readFileSync(new URL('pkg/'+file,directory))).digest('hex'),hash,file);
});
test('iOS crypto uses legacy JS heap and stack return ABI instead of externref table and multivalue returns',()=>{
 const binary=readFileSync(new URL('pkg/matrix_sdk_crypto_wasm_bg.wasm',directory));
 const exports=WebAssembly.Module.exports(new WebAssembly.Module(binary)).map(e=>e.name);
 assert.ok(!exports.includes('__wbindgen_externrefs'));assert.ok(exports.includes('__wbindgen_add_to_stack_pointer'));
 const glue=readFileSync(new URL('pkg/matrix_sdk_crypto_wasm_bg.js',directory),'utf8');
 assert.ok(glue.includes('function getObject('));assert.ok(!glue.includes('takeFromExternrefTable0'));
});
