import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/app/features/room/message/Message.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('Message.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = [];
function walk(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'handleContextMenu') handlers.push(node.initializer.getText(tree));
  ts.forEachChild(node, walk);
}
walk(tree);
function run(source, { selection = '选中的文字', altKey = false, edit = false, link = false, touch = false } = {}) {
  const result = {};
  const window = { getSelection: () => ({ toString: () => selection, removeAllRanges: () => { result.cleared = true; } }) };
  const js = ts.transpileModule(`const handler = ${source};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const handler = new Function('window', 'edit', 'setMenuSelectedText', 'setMenuAnchor', 'openMessageMenu', 'longPress', `${js};return handler;`)(window, edit, text => result.text = text, anchor => result.anchor = anchor, anchor => result.anchor = anchor, {isTouchContext:()=>touch,cancel:()=>{}});
  handler({ altKey, target: { closest: () => link }, clientX: 120, clientY: 240, preventDefault: () => result.prevented = true, stopPropagation: () => result.stopped = true });
  return result;
}
test('selected text right-click opens message menu and snapshots text before selection clears', () => {
  assert.equal(handlers.length, 2);
  for (const handler of handlers) {
    const result = run(handler);
    assert.equal(result.prevented, true);
    assert.equal(result.stopped, true);
    assert.equal(result.text, '选中的文字');
    assert.deepEqual(result.anchor, { x: 120, y: 240, width: 0, height: 0 });
  }
});
test('Alt-right-click and unselected links retain native menu; editing keeps native text actions', () => {
  for (const handler of handlers) {
    assert.deepEqual(run(handler, { altKey: true }), {});
    assert.deepEqual(run(handler, { selection: '', link: true }), {});
    assert.equal(run(handler, { link: true }).prevented, true);
  }
  assert.deepEqual(run(handlers[0], { edit: true }), {});
});

test('late native touch context menu cannot reopen the custom message menu', () => { const result=run(handlers[0], {touch:true}); assert.equal(result.prevented,true); assert.equal(result.stopped,true); assert.equal(result.anchor,undefined); });
