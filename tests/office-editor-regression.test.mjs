import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Office attachment actions use compact hover targets', async () => {
  const cssSource = await readSource('src/app/components/file-viewer/OfficeFileEditor.css.ts');

  assert.match(cssSource, /padding: `\$\{toRem\(5\)\} \$\{toRem\(6\)\}`/);
  assert.match(cssSource, /export const actionLabel/);
  assert.match(cssSource, /minHeight: toRem\(32\)/);
  assert.match(cssSource, /borderRadius: toRem\(999\)/);
  assert.match(
    cssSource,
    /\$\{actionButton\}:hover:not\(:disabled\) &[\s\S]*background: color\.SurfaceVariant\.Container/
  );
  assert.doesNotMatch(cssSource, /background: color\.Primary\.Container/);
});

test('host-window Office shortcuts prevent browser downloads and use the bridge save path', async () => {
  const source = await readSource('src/app/components/file-viewer/OfficeFileEditor.tsx');

  assert.match(source, /\(event\.ctrlKey \|\| event\.metaKey\)/);
  assert.match(source, /event\.key\.toLowerCase\(\) === 's'/);
  assert.match(
    source,
    /const handleSaveShortcut[\s\S]*event\.preventDefault\(\);[\s\S]*requestSave\(false\)/
  );
  assert.match(source, /window\.addEventListener\('keydown', handleSaveShortcut, true\)/);
  assert.match(
    source,
    /OFFICE_BRIDGE_SAVING[\s\S]*beginSaveOperation\(false, false, event\.data\.saveId\)/
  );
  assert.match(source, /postToOffice\(\{ type: OFFICE_BRIDGE_SAVE, saveId: operation\.id \}\)/);
});

test('Office saves are deduplicated and bounded by export and upload timeouts', async () => {
  const source = await readSource('src/app/components/file-viewer/OfficeFileEditor.tsx');
  const configSource = await readSource('config.json');
  const configTypeSource = await readSource('src/app/hooks/useClientConfig.ts');

  assert.match(source, /if \(saveOperationRef\.current\) return saveOperationRef\.current/);
  assert.match(source, /lastSettledSaveIdRef/);
  assert.match(source, /armSaveTimeout\(\s*operation,\s*exportTimeoutMs/);
  assert.match(source, /armSaveTimeout\(\s*operation,\s*prepareTimeoutMs/);
  assert.match(source, /armSaveTimeout\(\s*activeOperation,\s*uploadTimeoutMs/);
  assert.match(source, /event\.data\.buffer\.byteLength === 0/);
  assert.match(source, /保存超时：Office 未能生成最新文件/);
  assert.match(source, /文件准备超时：未能完成加密或文件处理/);
  assert.match(source, /上传超时：聊天服务器未完成媒体上传/);
  assert.match(configSource, /"exportTimeoutSeconds": 45/);
  assert.match(configSource, /"prepareTimeoutSeconds": 60/);
  assert.match(configSource, /"uploadTimeoutSeconds": 120/);
  assert.match(configTypeSource, /publishing the room event is intentionally excluded/);
});

test('legacy Office exports cannot retry after an uncorrelated result becomes stale', async () => {
  const source = await readSource('src/app/components/file-viewer/OfficeFileEditor.tsx');

  assert.match(source, /type BridgeSaveProtocol = 'unknown' \| 'legacy' \| 'save-id'/);
  assert.match(source, /bridgeSaveProtocolRef\.current = 'legacy'/);
  assert.match(source, /return !legacyExportInvalidatedRef\.current/);
  assert.match(
    source,
    /operation\.stage === 'exporting' && bridgeSaveProtocolRef\.current !== 'save-id'/
  );
  assert.match(source, /legacyExportInvalidatedRef\.current = true/);
  assert.match(source, /setLegacyRetryBlocked\(true\)/);
  assert.match(source, /请关闭 Office 窗口后重新打开再试/);
  assert.match(source, /session\.mode === 'edit' && dirty && !legacyRetryBlocked/);
  assert.match(source, /if \(legacyRetryBlocked\) \{\s*closeModal\(\)/);
});

test('a late legacy SAVING message cannot restart a clean or already-saved document', async () => {
  const source = await readSource('src/app/components/file-viewer/OfficeFileEditor.tsx');
  const bridgeStart = source.indexOf(
    '// The bridge can initiate this path for an Office-internal Ctrl/Cmd+S.'
  );
  const dirtyGuard = source.indexOf('if (!dirtyRef.current) return;', bridgeStart);
  const beginSave = source.indexOf(
    'beginSaveOperation(false, false, event.data.saveId)',
    dirtyGuard
  );

  assert.ok(bridgeStart > -1);
  assert.ok(bridgeStart < dirtyGuard);
  assert.ok(dirtyGuard < beginSave);
  assert.match(source, /dirtyRef\.current = false;\s*setDirty\(false\);\s*setErrorMessage/);
  assert.match(
    source,
    /OFFICE_BRIDGE_DIRTY && event\.data\.dirty === true\) \{\s*dirtyRef\.current = true/
  );
});

test('media upload timeout ends before the non-cancellable publish stage', async () => {
  const source = await readSource('src/app/components/file-viewer/OfficeFileEditor.tsx');
  const uploadStart = source.indexOf('const uploadPromise = mx.uploadContent');
  const uploadTimeout = source.indexOf('uploadTimeoutMs', uploadStart);
  const uploadAwait = source.indexOf('const upload = await uploadPromise', uploadTimeout);
  const clearTimeout = source.indexOf(
    'window.clearTimeout(publishingOperation.timeoutId)',
    uploadAwait
  );
  const clearPromise = source.indexOf(
    'publishingOperation.uploadPromise = undefined',
    clearTimeout
  );
  const publishing = source.indexOf("publishingOperation.stage = 'publishing'", clearPromise);
  const sendMessage = source.indexOf('await mx.sendMessage', publishing);

  assert.ok(uploadStart > -1);
  assert.ok(uploadStart < uploadTimeout);
  assert.ok(uploadTimeout < uploadAwait);
  assert.ok(uploadAwait < clearTimeout);
  assert.ok(clearTimeout < clearPromise);
  assert.ok(clearPromise < publishing);
  assert.ok(publishing < sendMessage);
  assert.doesNotMatch(source.slice(publishing, sendMessage), /armSaveTimeout/);
});

test('publishing detaches on close or unmount and remains single-flight until settled', async () => {
  const source = await readSource('src/app/components/file-viewer/OfficeFileEditor.tsx');

  assert.match(source, /stage: 'exporting' \| 'uploading' \| 'publishing'/);
  assert.match(source, /if \(operation\.stage === 'publishing'\) \{\s*operation\.detached = true/);
  assert.match(
    source,
    /const publishing = operation\?\.stage === 'publishing';[\s\S]*operation\.detached = true;[\s\S]*setBackgroundPublishing\(publishing\)/
  );
  assert.match(
    source,
    /if \(operation\?\.stage === 'publishing'\) \{\s*operation\.detached = true;\s*\} else \{\s*cancelSaveOperation\(\)/
  );
  assert.match(source, /if \(!mountedRef\.current \|\| detached\) return/);
  assert.match(source, /关闭窗口（继续发布）/);
  assert.match(source, /disabled=\{!canEdit \|\| backgroundPublishing\}/);
});

test('Office exporting and media upload can be cancelled or closed without trapping the user', async () => {
  const source = await readSource('src/app/components/file-viewer/OfficeFileEditor.tsx');

  assert.match(source, /mx\.cancelUpload\(operation\.uploadPromise\)/);
  assert.match(
    source,
    /postToOffice\(\{ type: OFFICE_BRIDGE_CANCEL_SAVE, saveId: operation\.id \}\)/
  );
  assert.match(source, /if \(publishing && operation\)/);
  assert.match(source, /取消保存并关闭 Office 文档/);
  assert.match(source, /'取消并关闭'/);
  assert.doesNotMatch(source, /disabled=\{busy\}/);
  assert.match(source, />重试保存</);
  assert.match(source, /setErrorMessage\(failureMessage\)/);
});
