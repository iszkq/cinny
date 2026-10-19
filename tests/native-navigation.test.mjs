import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/utils/nativeBack.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
const {isBackSwipe,parentRoute}=exports;
test('right swipe returns on all pages; left swipe returns only in chat',()=>{
 const swipe={startX:80,startY:100,endX:200,endY:110,elapsed:250,chat:false};
 assert.equal(isBackSwipe(swipe),true);
 assert.equal(isBackSwipe({...swipe,startX:200,endX:80}),false);
 assert.equal(isBackSwipe({...swipe,startX:200,endX:80,chat:true}),true);
});
test('vertical scrolling, short movement and long holds do not navigate back',()=>{
 const swipe={startX:80,startY:100,endX:200,endY:110,elapsed:250,chat:true};
 assert.equal(isBackSwipe({...swipe,endY:230}),false);
 assert.equal(isBackSwipe({...swipe,endX:110}),false);
 assert.equal(isBackSwipe({...swipe,elapsed:1000}),false);
});
test('deep linked lobby and room always return to their own space list',()=>{
 assert.equal(parentRoute('/!space%3Aserver/lobby/'),'/!space%3Aserver/');
 assert.equal(parentRoute('/%23community%3Aserver/!room%3Aserver/'), '/%23community%3Aserver/');
 assert.equal(parentRoute('/!space%3Aserver/'),'spaces');
});
test('notifications return home instead of entering an index redirect loop',()=>{
 assert.equal(parentRoute('/inbox/notifications/'),'/home/');
 assert.equal(parentRoute('/home/!room%3Aserver/'),'/home/');
 assert.equal(parentRoute('/direct/!room%3Aserver/'),'/direct/');
 assert.equal(parentRoute('/home/'),'spaces');
});

test('login back locks calculator instead of following an automatic redirect loop',()=>{
 assert.equal(parentRoute('/login/mtx01.cc/'),'calculator');
 assert.equal(parentRoute('/register/mtx01.cc/'),'/login/');
});
