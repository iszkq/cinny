import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Reproduce Safari 16.0–16.3 rejecting lookbehind at module initialization.
class IOS16RegExp extends RegExp {
  constructor(pattern, flags) {
    if (/\(\?<[=!]/.test(String(pattern))) {
      throw new SyntaxError('Invalid regular expression: invalid group specifier name');
    }
    super(pattern, flags);
  }
}
const cache = new Map();
function load(relative) {
  const url = new URL(relative, import.meta.url);
  if (cache.has(url.href)) return cache.get(url.href);
  const source = readFileSync(url, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  cache.set(url.href, exports);
  vm.runInNewContext(output, {
    exports,
    RegExp: IOS16RegExp,
    require(id) {
      const resolved = new URL(`${id}.ts`, url);
      return load(resolved.href);
    },
  });
  return exports;
}
const { URL_REG } = load('../src/app/utils/regex.ts');
const { OutsideUrlRegExp } = load('../src/app/utils/regexContext.ts');
const rules = load('../src/app/plugins/markdown/inline/rules.ts');

test('iOS 16 imports URL and markdown rules without unsupported lookbehind', () => {
  assert.equal(rules.BoldRule.html((s) => s, rules.BoldRule.match('a **bold** b')), '<strong data-md="**">bold</strong>');
  assert.deepEqual(Array.from('go https://example.com/a?x=1. now'.match(URL_REG)), ['https://example.com/a?x=1']);
});
test('markdown keeps escapes, URL boundaries, and multiline handling', () => {
  assert.equal(rules.BoldRule.match('https://example.com/**file**'), null);
  assert.equal(rules.BoldRule.match('\\**escaped**'), null);
  assert.equal(rules.BoldRule.match('**two\nlines**'), null);
  const m = rules.BoldRule.match('https://example.com/**file** **real**');
  assert.equal(m[1], 'real');
  assert.equal(m.index, 29);
  const escapedClose = rules.ItalicRule1.match('*one\\*two*');
  assert.equal(escapedClose[1], 'one\\*two');
  assert.equal(rules.EscapeRule.html((s) => s, rules.EscapeRule.match('\\*')), '*');
});
test('emoji and markdown global matching skip URL contents and reset correctly', () => {
  const regex = new OutsideUrlRegExp('😀');
  const text = 'https://example.com/😀 😀 😀';
  assert.equal(regex.exec(text).index, 23);
  assert.equal(regex.exec(text).index, 26);
  assert.equal(regex.exec(text), null);
  assert.equal(regex.exec('😀').index, 0);
});
