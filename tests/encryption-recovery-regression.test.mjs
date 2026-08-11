import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('an expired Matrix session keeps the local encryption store', async () => {
  const clientSource = await readSource('src/client/initMatrix.ts');
  const rootSource = await readSource('src/app/pages/client/ClientRoot.tsx');

  const start = clientSource.indexOf('export const clearExpiredSessionAfterLogout');
  const end = clientSource.indexOf('export const logoutClient', start);
  const body = clientSource.slice(start, end);

  assert.match(body, /removeFallbackAccessToken\(\)/);
  assert.doesNotMatch(body, /removeFallbackSession\(\)/);
  assert.match(body, /await mx\?\.store\.deleteAllData\(\)/);
  assert.doesNotMatch(body, /clearStores\(\)/);
  assert.doesNotMatch(body, /localStorage\.clear\(\)/);
  assert.match(rootSource, /await clearExpiredSessionAfterLogout\(mx\)/);
});

test('Rust Crypto storage is isolated per account and device', async () => {
  const source = await readSource('src/client/initMatrix.ts');

  assert.match(source, /getRustCryptoDatabasePrefix/);
  assert.match(source, /encodeURIComponent\(session\.userId\)/);
  assert.match(source, /encodeURIComponent\(session\.deviceId\)/);
  assert.match(source, /LEGACY_RUST_CRYPTO_DATABASE_PREFIX = 'matrix-js-sdk'/);
  assert.match(source, /findExistingRustCryptoDatabasePrefixes/);
  assert.match(source, /existingPrefixes\.has\(LEGACY_RUST_CRYPTO_DATABASE_PREFIX\)/);
  assert.match(source, /isRustCryptoAccountMismatch/);
  assert.match(source, /RUST_CRYPTO_DATABASE_SELECTION_KEY_PREFIX/);
  assert.match(source, /saveRustCryptoDatabasePrefix\(session, prefix\)/);
  assert.match(source, /rustCryptoDatabasePrefixes\.set\(mx, cryptoDatabasePrefix\)/);
  assert.match(source, /cryptoDatabasePrefix: rustCryptoDatabasePrefixes\.get\(mx\)/);
});

test('re-login reuses the saved Matrix device identity for the same homeserver', async () => {
  const sessionSource = await readSource('src/app/state/sessions.ts');
  const loginSource = await readSource('src/app/pages/auth/login/loginUtil.ts');

  assert.match(sessionSource, /getFallbackSessionIdentity/);
  assert.match(sessionSource, /removeFallbackAccessToken/);
  assert.match(loginSource, /normalizeHomeserverUrl\(savedIdentity\.baseUrl\)/);
  assert.match(loginSource, /device_id: savedIdentity\.deviceId/);
  assert.match(loginSource, /mx\.loginRequest\(loginRequest\)/);
});

test('verified devices restore the upstream encrypted-backup status and progress tile', async () => {
  const devicesSource = await readSource('src/app/features/settings/devices/Devices.tsx');
  const backupSource = await readSource('src/app/components/BackupRestore.tsx');
  const verificationSource = await readSource('src/app/features/settings/devices/Verification.tsx');

  assert.match(devicesSource, /verificationStatus === VerificationStatus\.Verified/);
  assert.match(devicesSource, /<BackupRestoreTile/);
  assert.match(backupSource, /<ProgressBar/);
  assert.match(backupSource, /解密密钥已恢复/);
  assert.match(verificationSource, /VerifyCurrentDeviceTile/);
});

test('the device page separates current-device trust from other devices', async () => {
  const devicesSource = await readSource('src/app/features/settings/devices/Devices.tsx');
  const verificationSource = await readSource('src/app/features/settings/devices/Verification.tsx');
  const otherDevicesSource = await readSource('src/app/features/settings/devices/OtherDevices.tsx');
  const deviceVerificationSource = await readSource('src/app/components/DeviceVerification.tsx');
  const routerSource = await readSource('src/app/pages/Router.tsx');

  assert.match(devicesSource, /BackupRestoreTile/);
  assert.match(devicesSource, /恢复密钥只验证正在使用的本机/);
  assert.match(devicesSource, /const currentDeviceId = mx\.getDeviceId\(\)/);
  assert.match(verificationSource, /CurrentDeviceVerificationBadge/);
  assert.doesNotMatch(devicesSource, /<CurrentDeviceVerificationBadge/);
  assert.match(verificationSource, /OtherDevicesVerificationBadge/);
  assert.match(verificationSource, /本机已验证/);
  assert.match(verificationSource, /本机验证状态暂不可用/);
  assert.match(verificationSource, /正在读取其他设备状态/);
  assert.match(verificationSource, /台其他设备未验证/);
  assert.match(verificationSource, /其他设备均已验证/);
  assert.doesNotMatch(verificationSource, /其他设备状态暂不可用/);
  assert.match(verificationSource, /VerifyCurrentDeviceTile/);
  assert.match(verificationSource, /VerifyOtherDeviceTile/);
  assert.match(otherDevicesSource, /<VerifyOtherDeviceTile/);
  assert.match(deviceVerificationSource, /ReceiveSelfDeviceVerification/);
  assert.match(routerSource, /<ReceiveSelfDeviceVerification/);
});

test('the sidebar keeps a critical security reminder on first login', async () => {
  const source = await readSource('src/app/pages/client/sidebar/UnverifiedTab.tsx');

  assert.match(source, /useClientSyncReady\(mx\)/);
  assert.match(source, /const currentDeviceId = mx\.getDeviceId\(\)/);
  assert.match(
    source,
    /securitySyncReady &&[\s\S]*!crossSigningActive \|\|[\s\S]*VerificationStatus\.Unverified/
  );
  assert.match(source, /设备验证尚未启用/);
  assert.match(source, /<Badge variant="Critical" size="200"/);
  assert.doesNotMatch(source, /if \(!crossSigningActive\) return null/);
});

test('new security stores cannot be initialized before the first Matrix sync is ready', async () => {
  const devicesSource = await readSource('src/app/features/settings/devices/Devices.tsx');
  const setupSource = await readSource('src/app/components/DeviceVerificationSetup.tsx');
  const syncReadySource = await readSource('src/app/hooks/useClientSyncReady.ts');

  assert.match(syncReadySource, /SyncState\.Prepared/);
  assert.match(syncReadySource, /SyncState\.Syncing/);
  assert.match(syncReadySource, /SyncState\.Catchup/);
  assert.match(devicesSource, /isClientSyncReady\(mx\.getSyncState\(\)\)/);
  assert.match(devicesSource, /useSyncState\(/);
  assert.match(devicesSource, /setSecuritySyncReady\(isClientSyncReady\(state\)\)/);
  assert.match(devicesSource, /securitySyncReady \? \(/);
  assert.match(devicesSource, /<EnableVerification visible \/>/);
  assert.match(devicesSource, /正在同步安全设置…/);

  assert.match(setupSource, /const assertSecuritySyncReady/);
  assert.match(setupSource, /isClientSyncReady\(mx\.getSyncState\(\)\)/);
  assert.match(setupSource, /尚未开始写入本次设置/);
  assert.match(
    setupSource,
    /assertSecuritySyncReady\(mx\);[\s\S]*clearSecretStorageKeys\(\);[\s\S]*bootstrapSecretStorage/
  );
  assert.equal((setupSource.match(/assertSecuritySyncReady\(mx\);/g) ?? []).length, 2);
  const firstWriteIndex = setupSource.indexOf('clearSecretStorageKeys();');
  assert.ok(firstWriteIndex > 0);
  assert.equal(setupSource.indexOf('assertSecuritySyncReady(mx);', firstWriteIndex), -1);
  assert.match(
    setupSource.slice(0, firstWriteIndex),
    /session\.recoveryKey = recoveryKeyData\.encodedPrivateKey/
  );
  assert.doesNotMatch(setupSource, /useAlive|if \(!alive\(\)\) return/);
  assert.match(setupSource, /<RecoveryKeyDisplay recoveryKey=\{generatedRecoveryKey\} \/>/);
  assert.match(setupSource, /本次写入可能已经使用了下面的恢复密钥/);
});

test('security setup survives dialog remounts as a single resumable transaction', async () => {
  const source = await readSource('src/app/components/DeviceVerificationSetup.tsx');

  assert.match(source, /new WeakMap<CryptoApi, VerificationSetupSession>\(\)/);
  assert.match(source, /if \(existingSession\?\.flow === flow\) return existingSession\.task/);
  assert.match(source, /session\.recoveryKey = recoveryKeyData\.encodedPrivateKey/);
  assert.match(source, /uiaAction\?: UIAAction<void>/);
  assert.match(source, /setSessionUIAAction\(crypto, session, action\)/);
  assert.match(source, /if \(activeRequest\) return activeRequest/);
  assert.match(source, /onCancel=\{uiaAction\.cancelCallback\}/);
  assert.match(
    source,
    /session\.status === VerificationSetupStatus\.Running\)[\s\S]*return;[\s\S]*verificationSetupSessions\.delete\(crypto\)/
  );
  assert.match(source, /你可以关闭窗口，重新打开后会继续显示并完成同一次设置/);
  assert.match(source, /flow=\{VerificationSetupFlow\.Enable\}/);
  assert.match(source, /flow=\{VerificationSetupFlow\.Reset\}/);
  assert.match(source, /session\.flow !== flow/);
});

test('setup and manual recovery share one destructive crypto initialization gate', async () => {
  const setupSource = await readSource('src/app/components/DeviceVerificationSetup.tsx');
  const manualSource = await readSource('src/app/components/ManualVerification.tsx');
  const gateSource = await readSource('src/app/utils/cryptoInitializationGate.ts');

  assert.match(gateSource, /new WeakMap<CryptoApi, Promise<void>>\(\)/);
  assert.match(gateSource, /const previousTurn = cryptoInitializationTails\.get\(crypto\)/);
  assert.match(gateSource, /await lease\.waitForTurn/);
  assert.match(gateSource, /finally \{\s*lease\.release\(\);/);
  assert.match(setupSource, /runCryptoInitializationExclusive\(crypto, \(\) =>/);
  assert.match(manualSource, /const initializationLease = queueCryptoInitialization\(crypto\)/);
  assert.match(
    manualSource,
    /initializationLease\.waitForTurn\.then\([\s\S]*storePrivateKey\(secretStorageKeyId, recoveryKey\)/
  );
  assert.match(
    manualSource,
    /backupRecovery\.then\(initializationLease\.release, initializationLease\.release\)/
  );
});

test('current-device verification requires cross-signing while other devices accept SDK trust', async () => {
  const cryptoSource = await readSource('src/app/utils/matrix-crypto.ts');
  const sidebarSource = await readSource('src/app/pages/client/sidebar/UnverifiedTab.tsx');
  const devicesSource = await readSource('src/app/features/settings/devices/Devices.tsx');

  assert.match(cryptoSource, /if \(requireCrossSigning\) return status\.crossSigningVerified/);
  assert.match(cryptoSource, /status\.crossSigningVerified \|\| status\.localVerified/);
  assert.match(sidebarSource, /currentDeviceId,\s*true/);
  assert.match(devicesSource, /currentDeviceId,\s*true/);
});

test('completed device verification persists trust before reporting success', async () => {
  const verificationSource = await readSource('src/app/components/DeviceVerification.tsx');
  const settingsVerificationSource = await readSource(
    'src/app/features/settings/devices/Verification.tsx'
  );
  const cryptoSource = await readSource('src/app/utils/matrix-crypto.ts');
  const statusHookSource = await readSource('src/app/hooks/useDeviceVerificationStatus.ts');

  assert.match(verificationSource, /persistCompletedDeviceVerification/);
  assert.match(verificationSource, /正在保存设备可信状态/);
  assert.match(verificationSource, /可信状态已保存/);
  assert.doesNotMatch(verificationSource, /useVerifierCancel/);
  assert.match(verificationSource, /request\.cancellationCode === 'm\.accepted'/);
  assert.match(
    settingsVerificationSource,
    /getVerificationRequestsToDeviceInProgress\(mx\.getSafeUserId\(\)\)/
  );
  assert.match(
    settingsVerificationSource,
    /request\.otherDeviceId === deviceId && request\.pending/
  );
  assert.match(cryptoSource, /request\.phase !== VerificationPhase\.Done/);
  assert.match(cryptoSource, /request\.isSelfVerification/);
  assert.match(cryptoSource, /api\.setDeviceVerified\(otherUserId, otherDeviceId, true\)/);
  assert.match(cryptoSource, /api\.crossSignDevice\(deviceId\)/);
  assert.match(cryptoSource, /persistedStatus\.localVerified/);
  assert.match(verificationSource, /CryptoEvent\.DevicesUpdated/);
  assert.match(verificationSource, /request\.otherUserId/);
  assert.match(statusHookSource, /useUserTrustStatusChange/);
  assert.match(statusHookSource, /latestRequestRef/);
  assert.match(statusHookSource, /readVerifiedDevice/);
  assert.match(statusHookSource, /DEVICE_TRUST_QUERY_TIMEOUT_MS/);
  assert.match(statusHookSource, /VerificationStatus\.Unavailable/);
  assert.match(statusHookSource, /Do not report "all verified"/);
  assert.match(statusHookSource, /trustResult\.value === null/);
  assert.match(cryptoSource, /CryptoOperationTimeoutError/);
  assert.match(cryptoSource, /CROSS_SIGN_ATTEMPT_TIMEOUT_MS/);
  assert.match(verificationSource, /可关闭此窗口，可信状态仍会在后台继续保存/);
  assert.doesNotMatch(verificationSource, /disabled=\{\s*phase === VerificationPhase\.Done/);
});

test('browser call controls do not extend the Node events shim', async () => {
  const source = await readSource('src/app/plugins/call/CallControl.ts');

  assert.match(source, /class CallControlEmitter/);
  assert.match(source, /extends CallControlEmitter/);
  assert.doesNotMatch(source, /from ['"]events['"]/);
});

test('recovery passphrases retain meaningful surrounding whitespace', async () => {
  const source = await readSource('src/app/components/SecretStorage.tsx');

  assert.match(source, /const recoveryPassphrase = recoveryPassphraseInput\.value;/);
  assert.doesNotMatch(source, /recoveryPassphraseInput\.value\.trim\(\)/);
  assert.match(source, /evt\.preventDefault\(\);\s*if \(loading\) return;/);
  assert.match(source, /submitRecoveryKey\(recoveryKey\)[\s\S]*\.catch\(\(\) => undefined\)/);
});

test('backup restoration is not blocked by cross-signing failures', async () => {
  const source = await readSource('src/app/components/ManualVerification.tsx');
  const cryptoSource = await readSource('src/app/utils/matrix-crypto.ts');

  assert.match(source, /Do not make restoring[\s\S]*conditional on device verification/);
  assert.match(source, /persistCurrentDeviceVerification\(mx\)/);
  assert.match(source, /mx\.emit\(CryptoEvent\.DevicesUpdated, \[userId\], false\)/);
  assert.match(source, /恢复密钥正确，但当前设备验证失败/);
  assert.match(source, /await crypto\.loadSessionBackupPrivateKeyFromSecretStorage\(\)/);
  assert.match(source, /await crypto\.checkKeyBackupAndEnable\(\)/);
  assert.match(source, /crypto\.restoreKeyBackup\(\{[\s\S]*progressCallback/);
  assert.match(source, /BACKUP_RECOVERY_FOREGROUND_TIMEOUT_MS/);
  assert.match(source, /SINGLE_FLIGHT_FOREGROUND_DEADLINE_MS/);
  assert.match(source, /const crossSigningBootstrapTasks = new WeakMap/);
  assert.match(source, /const backupPreparationTasks = new WeakMap/);
  assert.match(source, /const backupRecoveryTasks = new WeakMap/);
  assert.match(source, /const manualVerificationWorkflows = new WeakMap/);
  assert.match(source, /bootstrapCrossSigningSingleFlight\(crypto\)/);
  assert.doesNotMatch(source, /withTimeout\(\s*crypto\.bootstrapCrossSigning/);
  assert.match(source, /waitForTaskForegroundDeadline\(\s*workflow\.verification/);
  assert.match(source, /waitForTaskForegroundDeadline\(\s*workflow\.backupPreparation/);
  assert.match(source, /cachedPrivateKeys\.every\(Boolean\)/);
  assert.doesNotMatch(source, /privateKeysCachedLocally[\s\S]{0,160}\.some\(Boolean\)/);
  assert.match(
    source,
    /prepareKeyBackupSingleFlight\(crypto, async \(\) => \{[\s\S]*bootstrapSecretStorage[\s\S]*checkKeyBackupAndEnable/
  );
  assert.match(source, /const backupPreparation = verification\.then/);
  assert.match(source, /const backupRecovery = backupPreparation\.then/);
  assert.match(source, /recoverKeyBackupSingleFlight\(crypto, async \(\) =>/);
  assert.match(source, /const earlyBackupPreparation = recoveryKeyReady\.then/);
  assert.match(source, /await crypto\.loadSessionBackupPrivateKeyFromSecretStorage\(\)/);
  assert.match(source, /await crypto\.checkKeyBackupAndEnable\(\)/);
  assert.match(source, /const recentRooms = \[\.\.\.mx\.getRooms\(\)\]/);
  assert.ok(
    source.indexOf('const earlyBackupPreparation = recoveryKeyReady.then') <
      source.indexOf('const verification = earlyBackupPreparation.then')
  );
  assert.ok(
    source.indexOf('await crypto.loadSessionBackupPrivateKeyFromSecretStorage();') <
      source.indexOf('await bootstrapCrossSigningSingleFlight(crypto);')
  );
  assert.ok(
    source.indexOf('await bootstrapCrossSigningSingleFlight(crypto);') <
      source.indexOf('const backupPreparation = verification.then')
  );
  assert.match(source, /No backup info available/);
  assert.match(source, /type ManualVerificationResult/);
  assert.match(source, /status: 'completed' \| 'background'/);
  assert.match(source, /verifyState\.data\.status === 'background'/);
  assert.match(source, /安全恢复仍在后台处理中/);
  assert.match(source, /可以关闭此面板，稍后再回来查看/);
  const deadlineStart = source.indexOf('const waitForTaskForegroundDeadline');
  const deadlineEnd = source.indexOf('const crossSigningBootstrapTasks', deadlineStart);
  const deadlineSource = source.slice(deadlineStart, deadlineEnd);
  assert.match(deadlineSource, /task\.then\(/);
  assert.doesNotMatch(deadlineSource, /\.delete\(|taskFactory/);
  assert.match(cryptoSource, /crypto\.setDeviceVerified\(userId, deviceId, true\)/);
  assert.match(cryptoSource, /crossSignDevicesWithRetry\(crypto, \[deviceId\]\)/);
  assert.match(cryptoSource, /crypto\.getDeviceVerificationStatus\(userId, deviceId\)/);
});

test('manual recovery exposes real decrypt progress and a durable completion marker', async () => {
  const manualSource = await readSource('src/app/components/ManualVerification.tsx');
  const progressSource = await readSource('src/app/components/BackupRestore.tsx');
  const stateSource = await readSource('src/app/state/backupRestore.ts');
  const restoreSource = await readSource('src/app/utils/restoreKeyBackup.ts');

  assert.match(manualSource, /useAtom\(backupRestoreProgressAtom\)/);
  assert.match(stateSource, /new WeakMap<MatrixClient, BackupRestoreAtoms>/);
  assert.match(manualSource, /getBackupRestoreAtoms\(mx\)/);
  assert.match(manualSource, /progressCallback\(progress\)[\s\S]*setRestoreProgress\(progress\)/);
  assert.match(manualSource, /BackupProgressStatus\.Decrypting/);
  assert.match(manualSource, /BackupProgressStatus\.Done/);
  assert.match(manualSource, /<BackupRestoreProgress progress=\{restoreProgress\} \/>/);
  assert.match(manualSource, /const backgroundRecoverySettled/);
  assert.match(manualSource, /安全恢复后台任务已结束，请查看下方结果和本机验证状态/);
  assert.match(progressSource, /<ProgressBar/);
  assert.match(manualSource, /可恢复的旧消息已解密完成/);
  assert.match(progressSource, /备份密钥已恢复，旧消息将在打开时逐步解密/);
  assert.match(progressSource, /RESTORE_PROGRESS_STALL_TIMEOUT_MS = 12_000/);
  assert.match(progressSource, /BackupProgressStatus\.Background/);
  assert.match(progressSource, /恢复仍在后台继续/);
  assert.match(progressSource, /retryTimelineDecryption/);
  assert.match(progressSource, /decryptAllTimelineEvent/);
  assert.match(restoreSource, /BackupProgressStatus\.Decrypting/);
  assert.match(restoreSource, /await retryTimelineDecryption\(\)/);
  assert.match(manualSource, /assertCompleteKeyBackupRestore\(restoreResult\)/);
  assert.match(manualSource, /AsyncStatus\.Success && !recoveryFailed/);
  assert.match(restoreSource, /result\.imported < result\.total/);
  assert.match(stateSource, /BackupProgressStatus\.Decrypting/);

  const restoreIndex = manualSource.indexOf('await crypto.restoreKeyBackup({');
  const timelineDecryptIndex = manualSource.indexOf('await Promise.allSettled', restoreIndex);
  const doneIndex = manualSource.indexOf('BackupProgressStatus.Done', timelineDecryptIndex);
  assert.ok(restoreIndex > 0);
  assert.ok(timelineDecryptIndex > restoreIndex);
  assert.ok(doneIndex > timelineDecryptIndex);

  const loadKeysIndex = stateSource.indexOf('if (progress.stage === ImportRoomKeyStage.LoadKeys)');
  assert.ok(loadKeysIndex > 0);
  assert.doesNotMatch(stateSource.slice(loadKeysIndex), /BackupProgressStatus\.Done/);
});

test('recent live encrypted messages retry while room keys arrive or the desktop regains focus', async () => {
  const source = await readSource('src/app/features/room/message/EncryptedContent.tsx');

  assert.match(source, /RECENT_DECRYPTION_RETRY_WINDOW_MS = 60 \* 60 \* 1000/);
  assert.match(
    source,
    /DECRYPTION_RETRY_DELAYS_MS = \[0, 500, 2_000, 5_000, 15_000, 30_000, 60_000\]/
  );
  assert.match(source, /DECRYPTION_IN_PROGRESS_POLL_MS = 250/);
  assert.match(source, /attemptDecryption\(crypto as CryptoBackend, \{ isRetry: true \}\)/);
  assert.match(source, /if \(mEvent\.isBeingDecrypted\(\)/);
  assert.match(source, /scheduleRetry\(DECRYPTION_IN_PROGRESS_POLL_MS\)/);
  assert.match(source, /event\.isDecryptionFailure\(\) && !retryAttemptRunning/);
  assert.match(source, /document\.addEventListener\('visibilitychange'/);
  assert.match(source, /document\.removeEventListener\('visibilitychange'/);
  assert.match(source, /window\.addEventListener\('focus'/);
  assert.match(source, /window\.removeEventListener\('focus'/);
  assert.match(source, /window\.addEventListener\('online'/);
  assert.match(source, /window\.removeEventListener\('online'/);
  assert.match(source, /mx\.on\(ClientEvent\.Sync/);
  assert.match(source, /mx\.removeListener\(ClientEvent\.Sync/);
  assert.match(source, /window\.clearTimeout\(retryTimer\)/);
});
