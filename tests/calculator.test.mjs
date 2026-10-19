import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { calculatorEntry } from '../scripts/ios-calculator-entry.mjs';
const storage = new Map();
function load(name) {
  const exports = {};
  const source = readFileSync(new URL(`../src/app/components/calculator/${name}.ts`, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, crypto: webcrypto, TextEncoder, Date, localStorage: { getItem: k => storage.get(k) },
  });
  return exports;
}
const engine = load('engine');
const lock = load('lock');
const run = keys => keys.reduce(engine.calculatorKey, engine.initialCalculator());
test('calculator arithmetic, decimals, repeated equals and zero division', () => {
  assert.equal(run(['1','2','+','3','=']).display, '15');
  assert.equal(run(['0','.','1','+','0','.','2','=','=']).display, '0.5');
  assert.equal(run(['9','÷','0','=']).display, '错误');
  assert.equal(run(['5','0','%']).display, '0.5');
});
test('unlock candidate exists immediately on digits and never on calculation operands/results', () => {
  assert.equal(run(['0','9','0','5']).secret, '0905');
  assert.equal(run(['1','+','0','9','0','5']).secret, undefined);
  assert.equal(run(['9','0','0','+','5','=']).secret, undefined);
  assert.equal(run(['9','=','0','9','0','5']).secret, '0905');
});
test('time accepts local current and previous minute including midnight', async () => {
  const now = new Date(2026, 9, 15, 0, 0, 10).getTime();
  assert.equal(await lock.verifyCalculatorCode('0000', {mode:'time'}, now), true);
  assert.equal(await lock.verifyCalculatorCode('2359', {mode:'time'}, now), true);
  assert.equal(await lock.verifyCalculatorCode('2358', {mode:'time'}, now), false);
});
test('PIN is salted, preserves leading zeros and rejects wrong digits', async () => {
  const pin = await lock.createCalculatorPin('001234');
  assert.equal(pin.length, 6);
  assert.equal(await lock.verifyCalculatorCode('001234', {mode:'pin',pin}), true);
  assert.equal(await lock.verifyCalculatorCode('1234', {mode:'pin',pin}), false);
  assert.notEqual((await lock.createCalculatorPin('001234')).hash, pin.hash);
});
test('invalid persisted PIN fails closed and timeout handles clock rollback', () => {
  storage.set(lock.CALCULATOR_CONFIG_KEY, JSON.stringify({mode:'pin',backgroundSeconds:30,idleMinutes:5}));
  assert.throws(() => lock.readCalculatorConfig());
  assert.equal(lock.hasLockExpired(29999,30),false);
  assert.equal(lock.hasLockExpired(30000,30),true);
  assert.equal(lock.hasLockExpired(-1,30),true);
});
test('iOS bootstrap contains calculator and no chat loading message', () => {
  const html = calculatorEntry(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const root = html.slice(html.indexOf('<div id="root">'), html.indexOf('<div id="portalContainer">'));
  assert.match(root, /calculator-keypad/);
  assert.doesNotMatch(root, /登录|会话|服务器|星火/);
});
