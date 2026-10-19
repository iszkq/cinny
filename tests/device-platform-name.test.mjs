import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const api={};
new Function('exports', ts.transpileModule(readFileSync(new URL('../src/app/utils/deviceName.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(api);
test('native device names distinguish Windows, Mac and mobile, while browsers stay Web',()=>{
 for(const [input,expected] of [
  [{desktop:true,userAgent:'Windows NT 10.0'},'星火 Windows'],
  [{desktop:true,userAgent:'Macintosh; Intel Mac OS X'},'星火 Mac'],
  [{userAgent:'Macintosh; Intel Mac OS X'},'星火 Web'],
  [{android:true},'星火 Android'],
  [{ios:true,userAgent:'iPhone'},'星火 iPhone'],
  [{ios:true,userAgent:'Macintosh',touchPoints:5},'星火 iPad'],
 ]) assert.equal(api.deviceNameForPlatform(input),expected);
});
test('automatic rename preserves user chosen device names',()=>{
 assert.equal(api.shouldUpgradeDeviceName('星火 Web'),true);
 assert.equal(api.shouldUpgradeDeviceName('办公室电脑'),false);
 assert.equal(api.shouldUpgradeDeviceName('星火 Mac'),false);
});
