import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const api = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../src/app/utils/messageNumbers.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(api);
test('meeting IDs and phone numbers are recognized in Chinese messages', () => {
  assert.deepEqual(api.findMessageNumbers('会议号：123 456 789，电话13800138000').map(m => m[0]), ['123 456 789', '13800138000']);
});
test('numbers inside links, email, identifiers and decimals are left untouched', () => {
  for (const value of ['https://example.com/123456789', 'www.example.com/123456', 'abc123456', '123456@example.com', '123456.78']) {
    assert.equal(api.findMessageNumbers(value).length, 0, value);
  }
});
