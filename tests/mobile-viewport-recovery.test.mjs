import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1]).find((source) => source.includes('const applyViewportSize'));
function setup() {
  const properties = new Map();
  const listeners = {};
  const viewportListeners = {};
  let focused = false;
  const viewport = { height: 530, width: 390, offsetTop: 40, offsetLeft: 0,
    addEventListener: (name, fn) => { viewportListeners[name] = fn; } };
  const document = { activeElement: { matches: () => focused },
    documentElement: { style: { setProperty: (key, value) => properties.set(key, value) } },
    addEventListener: (name, fn) => { listeners[name] = fn; } };
  const window = { innerHeight: 844, innerWidth: 390, visualViewport: viewport,
    addEventListener: (name, fn) => { listeners[name] = fn; }, scrollTo() {} };
  vm.runInNewContext(script, { window, document, setTimeout: (fn) => fn() });
  return { properties, viewport, viewportListeners, listeners, window, focus: (value) => { focused = value; } };
}
test('keyboard pan moves shell without adding hidden space beneath the composer', () => {
  const f = setup();
  f.focus(true);
  f.listeners.focusin();
  assert.equal(f.properties.get('--app-top'), '40px');
  assert.equal(f.properties.get('--app-height'), '530px');
  f.viewport.offsetTop = 180;
  f.viewport.height = 310;
  f.viewportListeners.scroll();
  assert.equal(f.properties.get('--app-top'), '180px');
  assert.equal(f.properties.get('--app-height'), '310px');
});
test('dismissal restores full shell even when WebKit reports stale keyboard dimensions', () => {
  const f = setup();
  f.focus(true);
  f.listeners.focusin();
  f.focus(false);
  f.listeners.focusout();
  assert.equal(f.properties.get('--app-top'), '0px');
  assert.equal(f.properties.get('--app-height'), '844px');
});
test('native resized WebView is not reduced by keyboard height twice', () => {
  const f = setup();
  f.window.innerHeight = 390;
  f.viewport.height = 390;
  f.viewport.offsetTop = 0;
  f.focus(true);
  f.listeners.resize();
  assert.equal(f.properties.get('--app-height'), '390px');
  assert.equal(f.properties.get('--app-top'), '0px');
});
test('without VisualViewport editing retains a usable full-size shell', () => {
  const f = setup();
  f.window.visualViewport = undefined;
  f.focus(true);
  f.listeners.focusin();
  assert.equal(f.properties.get('--app-height'), '844px');
});
