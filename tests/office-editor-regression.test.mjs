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
  assert.match(cssSource, /whiteSpace: 'nowrap'/);
  assert.match(cssSource, /max-width: 410px[\s\S]*fontSize: toRem\(12\)/);
  assert.match(cssSource, /borderRadius: toRem\(999\)/);
  assert.match(
    cssSource,
    /\$\{actionButton\}:hover:not\(:disabled\) &[\s\S]*background: color\.SurfaceVariant\.Container/
  );
  assert.doesNotMatch(cssSource, /background: color\.Primary\.Container/);
});

test('encrypted Word, spreadsheet, and presentation files are unlocked locally', async () => {
  const source = await readSource('src/app/components/file-viewer/OfficeFileEditor.tsx');
  const cryptoSource = await readSource('src/app/plugins/officecrypto.ts');

  assert.match(source, /isOfficeDocumentEncrypted\(source\)/);
  assert.match(source, /setPasswordRequired\(true\)/);
  assert.match(source, /decryptOfficeDocument\(source, password\)/);
  assert.match(cryptoSource, /import\('officecrypto-tool'\)/);
  assert.match(source, /密码仅用于本次解密，不会保存到设备或上传到聊天服务器/);
});

test('PDF uses the Office card in read-only mode without an edit action', async () => {
  const source = await readSource('src/app/components/file-viewer/OfficeFileEditor.tsx');
  const mimeSource = await readSource('src/app/utils/mimeTypes.ts');

  assert.match(mimeSource, /normalizedMimeType === 'application\/pdf' \|\| ext === 'pdf'/);
  assert.match(source, /pdf: \{ label: 'PDF', color: '#e53935' \}/);
  assert.match(source, /const canEdit = officeKind !== 'pdf' && Boolean\(/);
  assert.match(
    source,
    /mobileOfficeShell \|\| officeKind === 'pdf'[\s\S]*\? 'repeat\(2, minmax\(0, 1fr\)\)'/
  );
});

test('the protected PDF prompt remains interactive while the document awaits a password', async () => {
  const source = await readSource('src/app/components/file-viewer/OfficeFileEditor.tsx');

  assert.match(source, /OFFICE_BRIDGE_PASSWORD_REQUIRED = 'xinghuo-office-password-required'/);
  assert.match(source, /data\.type === OFFICE_BRIDGE_PASSWORD_REQUIRED/);
  assert.match(
    source,
    /OFFICE_BRIDGE_PASSWORD_REQUIRED[\s\S]*window\.clearTimeout\(documentOpenedTimeoutRef\.current\)/
  );
  assert.match(source, /OFFICE_BRIDGE_PASSWORD_REQUIRED[\s\S]*setPhase\('ready'\)/);
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
    /OFFICE_BRIDGE_SAVING[\s\S]*beginSaveOperation\(false, false, data\.saveId\)/
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
  assert.match(source, /data\.buffer\.byteLength === 0/);
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
  const beginSave = source.indexOf('beginSaveOperation(false, false, data.saveId)', dirtyGuard);

  assert.ok(bridgeStart > -1);
  assert.ok(bridgeStart < dirtyGuard);
  assert.ok(dirtyGuard < beginSave);
  assert.match(
    source,
    /dirtyRef\.current = hasNewerChanges;\s*setDirty\(hasNewerChanges\);\s*setErrorMessage/
  );
  assert.match(
    source,
    /OFFICE_BRIDGE_DIRTY && data\.dirty === true\) \{\s*dirtyRevisionRef\.current \+= 1;\s*dirtyRef\.current = true/
  );
});

test('successive Office saves preserve edits made after the exported snapshot', async () => {
  const source = await readSource('src/app/components/file-viewer/OfficeFileEditor.tsx');

  assert.match(source, /dirtyRevision: number/);
  assert.match(source, /dirtyRevision: dirtyRevisionRef\.current/);
  assert.match(
    source,
    /OFFICE_BRIDGE_DIRTY && data\.dirty === true\) \{\s*dirtyRevisionRef\.current \+= 1/
  );
  assert.match(
    source,
    /const hasNewerChanges =\s*dirtyRevisionRef\.current > activeOperation\.dirtyRevision/
  );
  assert.match(source, /setPhase\(hasNewerChanges \? 'ready' : 'saved'\)/);
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

test('desktop Office uses an isolated native window and raw bounded binary exchange', async () => {
  const editorSource = await readSource('src/app/components/file-viewer/OfficeFileEditor.tsx');
  const windowSource = await readSource('src/app/utils/nativeOfficeWindow.ts');
  const nativeViewSource = await readSource(
    'src/app/components/file-viewer/NativeOfficeWindow.tsx'
  );
  const rustSource = await readSource('src-tauri/src/office_binary_exchange.rs');
  const rootSource = await readSource('src/index.tsx');
  const capabilitySource = await readSource('src-tauri/capabilities/default.json');

  assert.match(editorSource, /nativeSessionId: string/);
  assert.match(editorSource, /sessionId: session\.nativeSessionId/);
  assert.match(editorSource, /requestId: session\.requestId/);
  assert.match(editorSource, /writeNativeOfficeBinary\(nativeSessionId, buffer\)/);
  assert.match(
    editorSource,
    /if \(nativeWindowStateRef\.current === 'fallback'\) \{[\s\S]*transferSourceIfReady\(\)/
  );
  assert.match(editorSource, /nativeWindowState === 'fallback'/);
  assert.match(windowSource, /NATIVE_OFFICE_WINDOW_LABEL_PREFIX = 'office-window-'/);
  assert.match(windowSource, /NATIVE_OFFICE_REQUEST_QUERY_PARAM/);
  assert.match(windowSource, /write_office_session_binary/);
  assert.match(windowSource, /consume_office_session_binary/);
  assert.doesNotMatch(windowSource, /base64|data:/i);
  assert.match(nativeViewSource, /getNativeOfficeRequestId/);
  assert.match(nativeViewSource, /nextPayload\.requestId !== requestId/);
  assert.match(nativeViewSource, /const sourceBinaryToken = payload\?\.sourceBinary\?\.token/);
  assert.match(nativeViewSource, /sourceBinaryByteLength,/);
  assert.match(nativeViewSource, /css\.promptCard\} \$\{css\.nativePromptCard/);
  assert.match(nativeViewSource, /css\.saveStatus\} \$\{css\.nativeSaveStatus/);
  assert.match(
    await readSource('src/app/components/file-viewer/OfficeFileEditor.css.ts'),
    /nativePromptCard[\s\S]*background: '#ffffff'[\s\S]*nativeSaveStatus[\s\S]*background: 'rgba\(255, 255, 255, 0\.96\)'/
  );
  assert.doesNotMatch(
    nativeViewSource,
    /consumeNativeOfficeBinary[\s\S]{0,900}\}, \[emitSessionAction, payload,/
  );
  assert.match(rustSource, /OFFICE_BINARY_MAX_BYTES: usize = 256 \* 1024 \* 1024/);
  assert.match(rustSource, /InvokeBody::Raw\(bytes\)/);
  assert.match(rustSource, /Ok\(Response::new\(bytes\)\)/);
  assert.match(rootSource, /isNativeOfficeWindow/);
  assert.match(rootSource, /<LazyNativeOfficeWindow \/>/);
  assert.match(capabilitySource, /"office-window-\*"/);
});

test('Office opening is bounded and mobile layout respects the viewport safe area', async () => {
  const editorSource = await readSource('src/app/components/file-viewer/OfficeFileEditor.tsx');
  const styleSource = await readSource('src/app/components/file-viewer/OfficeFileEditor.css.ts');
  const orientationSource = await readSource('src/app/utils/officeOrientation.ts');
  const mainActivitySource = await readSource(
    'android/app/src/main/java/com/iszkq/starfire/MainActivity.java'
  );
  const orientationPluginSource = await readSource(
    'android/app/src/main/java/com/iszkq/starfire/OfficeOrientationPlugin.java'
  );
  const nativePlatformSource = await readSource('src/app/utils/nativePlatform.ts');
  const capacitorSource = await readSource('capacitor.config.ts');
  const androidManifest = await readSource('android/app/src/main/AndroidManifest.xml');
  const configSource = await readSource('config.json');

  assert.match(editorSource, /SOURCE_LOAD_TIMEOUT_MS = 60_000/);
  assert.match(editorSource, /IFRAME_BRIDGE_READY_TIMEOUT_MS = 30_000/);
  assert.match(editorSource, /DOCUMENT_OPENED_TIMEOUT_MS = 45_000/);
  assert.match(editorSource, /MOBILE_IFRAME_BRIDGE_READY_TIMEOUT_MS = 60_000/);
  assert.match(editorSource, /MOBILE_DOCUMENT_OPENED_TIMEOUT_MS = 150_000/);
  assert.match(editorSource, /lockOfficeLandscape\(\)/);
  assert.match(editorSource, /unlockOfficeOrientation\(\)/);
  assert.match(editorSource, /OFFICE_BRIDGE_SOURCE_RECEIVED/);
  assert.match(editorSource, /OFFICE_BRIDGE_SOURCE_BEGIN/);
  assert.match(editorSource, /OFFICE_BRIDGE_SOURCE_CHUNK_RECEIVED/);
  assert.match(editorSource, /OFFICE_BRIDGE_DIAGNOSTIC/);
  assert.match(editorSource, /recordDiagnostic\('timeout_document_opened'/);
  assert.match(editorSource, /recordDiagnostic\('chunk_ack'/);
  assert.match(editorSource, /recordDiagnostic\('iframe_load'/);
  assert.match(editorSource, /window\.addEventListener\('unhandledrejection'/);
  assert.match(editorSource, /diagnosticError\(data\.message\)/);
  assert.match(editorSource, /copyDiagnosticReport/);
  assert.match(editorSource, /sendDiagnosticReport/);
  assert.match(editorSource, /mx\.sendMessage\(room\.roomId/);
  assert.match(editorSource, /Starfire Office 诊断信息/);
  assert.match(editorSource, /navigator\.share/);
  assert.match(editorSource, /发送诊断信息/);
  assert.match(editorSource, /复制诊断信息/);
  assert.match(editorSource, /ANDROID_SOURCE_CHUNK_BYTES = 64 \* 1024/);
  assert.match(editorSource, /ANDROID_SOURCE_CHUNK_ACK_TIMEOUT_MS = 8_000/);
  assert.match(editorSource, /ANDROID_SOURCE_CHUNK_MAX_ATTEMPTS = 4/);
  assert.match(editorSource, /sendAndroidChunkWithAck/);
  assert.match(editorSource, /encodeBase64Chunk/);
  assert.match(editorSource, /Android 文档传输失败/);
  assert.match(editorSource, /supportsChunkedSource !== true/);
  assert.match(editorSource, /mode === 'edit' && \(!canEdit \|\| mobileOfficeShell\)/);
  assert.match(editorSource, /mobileOfficeShell \|\| officeKind === 'pdf'/);
  assert.doesNotMatch(editorSource, /className=\{css\.mobileCloseButton\}/);
  assert.match(editorSource, /postMessage\(message, targetOrigin, \[buffer\]\)/);
  assert.match(editorSource, /compactViewport && mode === 'preview' \? '1' : '0'/);
  assert.match(
    editorSource,
    /DEFAULT_OFFICE_EDITOR_URL = 'https:\/\/124\.222\.193\.241:6258\/editor'/
  );
  assert.match(configSource, /"url": "https:\/\/124\.222\.193\.241:6258\/editor"/);
  assert.match(editorSource, /Office 页面连接超时/);
  assert.match(editorSource, /Office 打开文档超时/);
  assert.match(editorSource, />重新打开</);
  assert.match(editorSource, /compactToolbar/);
  assert.match(editorSource, /phase === 'loading' && !passwordRequired/);
  const nativeViewSource = await readSource(
    'src/app/components/file-viewer/NativeOfficeWindow.tsx'
  );
  assert.match(nativeViewSource, /payload\.phase === 'loading' && !payload\.passwordRequired/);
  assert.match(editorSource, /isCompactOfficeViewport/);
  assert.match(editorSource, /if \(isCompactOfficeViewport\(\)\) return Promise\.resolve\(\)/);
  assert.match(editorSource, /window\.visualViewport\?\.height/);
  assert.match(editorSource, /activeElement instanceof HTMLElement/);
  assert.match(editorSource, /密码不正确，文档未发送到 Office 服务/);
  assert.match(styleSource, /var\(--safe-area-top/);
  assert.match(styleSource, /var\(--safe-area-right/);
  assert.match(styleSource, /var\(--safe-area-bottom/);
  assert.match(styleSource, /orientation: landscape/);
  assert.match(styleSource, /var\(--office-viewport-height/);
  assert.doesNotMatch(styleSource, /mobileCloseButton/);
  assert.match(editorSource, /handleMobileClosePointerDown/);
  assert.match(styleSource, /max-height: 520px[\s\S]*pointer: coarse/);
  assert.match(capacitorSource, /allowNavigation: \['124\.222\.193\.241'\]/);
  assert.doesNotMatch(capacitorSource, /office\.221819\.best/);
  assert.match(androidManifest, /android:screenOrientation="unspecified"/);
  assert.match(androidManifest, /android:windowSoftInputMode="adjustResize"/);
  assert.match(orientationSource, /registerPlugin<OfficeOrientationPlugin>\('OfficeOrientation'\)/);
  assert.match(orientationSource, /NativeOfficeOrientation\.lockLandscape\(\)/);
  assert.match(orientationSource, /NativeOfficeOrientation\.unlock\(\)/);
  assert.match(mainActivitySource, /registerPlugin\(OfficeOrientationPlugin\.class\)/);
  assert.match(mainActivitySource, /ApplicationInfo\.FLAG_DEBUGGABLE/);
  assert.match(mainActivitySource, /WebView\.setWebContentsDebuggingEnabled\(true\)/);
  assert.match(orientationPluginSource, /SCREEN_ORIENTATION_SENSOR_LANDSCAPE/);
  assert.match(orientationPluginSource, /SCREEN_ORIENTATION_FULL_USER/);
  assert.match(orientationPluginSource, /OrientationEventListener/);
  assert.match(orientationPluginSource, /SCREEN_ORIENTATION_UNSPECIFIED/);
  assert.match(editorSource, /ANDROID_BACK_BUTTON_EVENT/);
  assert.match(nativePlatformSource, /cinny-android-service-worker-cleanup-reload/);
  assert.match(nativePlatformSource, /wasControlled/);
  assert.match(nativePlatformSource, /window\.location\.reload\(\)/);
});
