import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('desktop image previews use per-session labels and close exact abandoned windows', async () => {
  const lifecycleSource = await readSource('src/app/utils/nativeImagePreview.ts');
  const dialogSource = await readSource('src/app/components/image-viewer/ImageViewerDialog.tsx');
  const windowSource = await readSource(
    'src/app/components/image-viewer/NativeImagePreviewWindow.tsx'
  );

  assert.match(lifecycleSource, /getNativeImagePreviewWindowLabel = \(previewId: string\)/);
  assert.match(lifecycleSource, /`\$\{NATIVE_IMAGE_PREVIEW_WINDOW_LABEL\}-\$\{previewId\.replace/);
  assert.match(
    lifecycleSource,
    /const label = getNativeImagePreviewWindowLabel\(payload\.previewId\)/
  );
  assert.match(
    lifecycleSource,
    /await existingWindow\.show\(\);\s*await existingWindow\.setFocus\(\);\s*} catch \(error\)/
  );
  assert.match(dialogSource, /const openAbortController = new AbortController\(\)/);
  assert.match(dialogSource, /openAbortController\.abort\(\)/);
  assert.match(
    lifecycleSource,
    /await Promise\.race\(\[windowCreated, windowDestroyed, openingAborted, creationTimedOut\]\)/
  );
  assert.doesNotMatch(lifecycleSource, /initialPayloadDelivered/);
  assert.match(dialogSource, /src: '',[\s\S]*loading: true/);
  assert.match(windowSource, /if \(!payload\?\.src\)/);
  assert.match(lifecycleSource, /Object\.assign\(payload, nextPayload\)/);
  assert.match(dialogSource, /nativePreview\.updatePayload\(payload\)/);
  assert.match(
    dialogSource,
    /nativePreview\.unlistenDestroyed\(\);[\s\S]*closeNativeImagePreviewWindow\(nativePreview\.label\)/
  );
  assert.match(windowSource, /emitCloseAction\(\)\s*\.then\(closeCurrentNativeWindow\)/);
  assert.doesNotMatch(windowSource, /addEventListener\('pagehide'/);
});

test('desktop Bible windows reject stale registry entries and stale close events', async () => {
  const lifecycleSource = await readSource('src/app/utils/nativeBibleWindow.ts');
  const windowSource = await readSource('src/app/components/bible/NativeBibleWindow.tsx');
  const capabilitySource = await readSource('src-tauri/capabilities/default.json');

  assert.match(lifecycleSource, /label: `\$\{NATIVE_BIBLE_WINDOW_LABEL\}-\$\{id\}`/);
  assert.match(lifecycleSource, /url: getNativeBibleWindowUrl\(nextWindow\.id\)/);
  assert.match(lifecycleSource, /visible: false/);
  assert.match(lifecycleSource, /await bibleWindow\.show\(\);\s*await bibleWindow\.setFocus\(\)/);
  assert.match(
    lifecycleSource,
    /if \(!windowId \|\| windowId !== latestNativeBibleWindowId\) return/
  );
  assert.match(lifecycleSource, /nativeBibleWindowOperation \+= 1/);
  assert.match(windowSource, /emitClose\(\)\s*\.then\(closeCurrentNativeWindow\)/);
  assert.doesNotMatch(windowSource, /addEventListener\('pagehide'/);
  assert.match(capabilitySource, /"bible-window-\*"/);
});
