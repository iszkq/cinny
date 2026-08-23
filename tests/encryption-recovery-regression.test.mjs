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
  assert.doesNotMatch(body, /clearStores\(\)|localStorage\.clear\(\)/);
  assert.match(rootSource, /await clearExpiredSessionAfterLogout\(mx\)/);
});

test('Rust Crypto storage remains isolated per account and device', async () => {
  const source = await readSource('src/client/initMatrix.ts');
  const storeSource = await readSource('src/client/rustCryptoStore.ts');

  assert.match(storeSource, /getRustCryptoDatabasePrefix/);
  assert.match(storeSource, /encodeURIComponent\(session\.userId\)/);
  assert.match(storeSource, /encodeURIComponent\(session\.deviceId/);
  assert.match(storeSource, /LEGACY_RUST_CRYPTO_DATABASE_PREFIX = 'matrix-js-sdk'/);
  assert.match(storeSource, /findExistingRustCryptoDatabasePrefixes/);
  assert.match(source, /isRustCryptoAccountMismatch/);
  assert.match(source, /saveRustCryptoDatabasePrefix\(session, prefix\)/);
  assert.match(source, /cryptoDatabasePrefix: rustCryptoDatabasePrefixes\.get\(mx\)/);
});

test('re-login only reuses a saved Matrix device when its crypto identity still exists', async () => {
  const sessionSource = await readSource('src/app/state/sessions.ts');
  const loginSource = await readSource('src/app/pages/auth/login/loginUtil.ts');
  const cryptoStoreSource = await readSource('src/client/rustCryptoStore.ts');
  const clientSource = await readSource('src/client/initMatrix.ts');
  const rootSource = await readSource('src/app/pages/client/ClientRoot.tsx');

  assert.match(sessionSource, /getFallbackSessionIdentity/);
  assert.match(sessionSource, /removeFallbackAccessToken/);
  assert.match(loginSource, /normalizeHomeserverUrl\(savedIdentity\.baseUrl\)/);
  assert.match(loginSource, /loginMatchesSavedUser\(data, savedIdentity\.userId\)/);
  assert.match(loginSource, /await hasPersistedRustCryptoStore\(savedIdentity\)/);
  assert.match(loginSource, /device_id: savedIdentity!\.deviceId/);
  assert.match(loginSource, /mx\.loginRequest\(loginRequest\)/);
  assert.match(loginSource, /allowNewRustCryptoStore/);
  assert.match(cryptoStoreSource, /getRustCryptoDatabasePrefix/);
  assert.match(cryptoStoreSource, /hasPersistedRustCryptoStore/);
  assert.match(cryptoStoreSource, /isNewRustCryptoStoreAllowed/);
  assert.match(clientSource, /removeFallbackAccessToken\(\)/);
  assert.match(clientSource, /class MissingCryptoStoreError extends Error/);
  assert.match(rootSource, /loadState\.error instanceof MissingCryptoStoreError/);
});

test('device settings use the upstream Cinny device and verification flow', async () => {
  const devicesSource = await readSource('src/app/features/settings/devices/Devices.tsx');
  const otherDevicesSource = await readSource('src/app/features/settings/devices/OtherDevices.tsx');
  const verificationSource = await readSource('src/app/features/settings/devices/Verification.tsx');
  const setupSource = await readSource('src/app/components/DeviceVerificationSetup.tsx');
  const manualSource = await readSource('src/app/components/ManualVerification.tsx');

  assert.match(devicesSource, /useSplitCurrentDevice\(devices\)/);
  assert.match(devicesSource, /<EnableVerification visible=\{!crossSigningActive\} \/>/);
  assert.match(devicesSource, /<VerificationStatusBadge/);
  assert.match(devicesSource, /<VerifyCurrentDeviceTile/);
  assert.match(devicesSource, /<LocalBackup \/>/);
  assert.match(otherDevicesSource, /openExternalUrl\(/);
  assert.match(otherDevicesSource, /accountManagementActions\.sessionEnd/);
  assert.doesNotMatch(otherDevicesSource, /window\.open\(/);
  assert.match(
    verificationSource,
    /crypto\.requestDeviceVerification\(mx\.getSafeUserId\(\), deviceId\)/
  );
  assert.match(setupSource, /await crypto\.bootstrapSecretStorage\(/);
  assert.match(setupSource, /await crypto\.bootstrapCrossSigning\(/);
  assert.match(setupSource, /await crypto\.resetKeyBackup\(\)/);
  assert.match(manualSource, /await crypto\.bootstrapCrossSigning\(\{\}\)/);
  assert.match(manualSource, /await crypto\.bootstrapSecretStorage\(\{\}\)/);
});

test('upstream device verification uses SDK trust and verifier state', async () => {
  const verificationSource = await readSource('src/app/components/DeviceVerification.tsx');
  const statusSource = await readSource('src/app/hooks/useDeviceVerificationStatus.ts');
  const cryptoSource = await readSource('src/app/utils/matrix-crypto.ts');

  assert.match(verificationSource, /request\.verifier/);
  assert.match(verificationSource, /<SasVerification verifier=\{request\.verifier\}/);
  assert.match(verificationSource, /request\.cancel\(\)/);
  assert.match(statusSource, /verifiedDevice\(crypto, userId, deviceId\)/);
  assert.match(statusSource, /useDeviceListChange/);
  assert.doesNotMatch(statusSource, /getAndroidSecureValue|VerificationStatus\.Unavailable/);
  assert.match(cryptoSource, /status\.crossSigningVerified/);
  assert.doesNotMatch(cryptoSource, /status\.localVerified|setDeviceVerified|crossSignDevice/);
});

test('backup restore after verification uses the existing client-scoped progress atom', async () => {
  const hookSource = await readSource('src/app/hooks/useRestoreBackupOnVerification.ts');
  const stateSource = await readSource('src/app/state/backupRestore.ts');

  assert.match(hookSource, /getBackupRestoreAtoms\(mx\)/);
  assert.match(hookSource, /useKeyBackupDecryptionKeyCached/);
  assert.match(hookSource, /crypto\.restoreKeyBackup\(\{/);
  assert.match(hookSource, /progressCallback\(progress\)/);
  assert.match(stateSource, /new WeakMap<MatrixClient, BackupRestoreAtoms>/);
});

test('Android secure storage and database compatibility remain intact', async () => {
  const secureStorageSource = await readSource('src/client/secretStorageKeys.js');
  const initSource = await readSource('src/client/initMatrix.ts');

  assert.match(secureStorageSource, /cinny_android_backup_trusted:/);
  assert.match(secureStorageSource, /session-backup-private-key/);
  assert.match(initSource, /restoreAndroidBackupKey\(crypto\)/);
  assert.match(initSource, /persistAndroidBackupKey\(crypto/);
  assert.match(initSource, /requestPersistentAndroidStorage\(\)/);
  assert.match(initSource, /loadAndroidClientSnapshot/);
});

test('the sidebar stays critical until both device and key backup are verified', async () => {
  const sidebarSource = await readSource('src/app/pages/client/sidebar/UnverifiedTab.tsx');
  const backupHookSource = await readSource('src/app/hooks/useKeyBackup.ts');

  assert.match(sidebarSource, /useKeyBackupStatus\(crypto\)/);
  assert.match(sidebarSource, /useKeyBackupInfo\(crypto\)/);
  assert.match(sidebarSource, /useKeyBackupTrust\(crypto, backupInfo\)/);
  assert.match(sidebarSource, /verificationStatus === VerificationStatus\.Unverified/);
  assert.match(sidebarSource, /!backupEnabled/);
  assert.match(sidebarSource, /deviceUnverified \|\| backupUnverified/);
  assert.match(backupHookSource, /CryptoEvent\.KeyBackupStatus/);
  assert.match(backupHookSource, /useKeyBackupDecryptionKeyCached\(fetchTrust\)/);
});

test('automatic room-key recovery requests are enabled for verified own devices', async () => {
  const initSource = await readSource('src/client/initMatrix.ts');
  const recoverySource = await readSource('src/app/utils/decryptionRecovery.ts');
  const featuresSource = await readSource('src/app/pages/client/ClientNonUIFeatures.tsx');

  assert.doesNotMatch(initSource, /enableMissingRoomKeyRequests/);
  assert.match(initSource, /roomKeyRequestsEnabled\?\s*:\s*boolean/);
  assert.match(initSource, /roomKeyRequestsEnabled\s*=\s*true/);
  assert.doesNotMatch(initSource, /roomKeyForwardingEnabled\s*=\s*true/);
  assert.match(recoverySource, /restoreSessionFromBackup/);
  assert.match(recoverySource, /trust\.matchesDecryptionKey !== true/);
  assert.match(recoverySource, /crypto\.importBackedUpRoomKeys\(keys, activeVersion\)/);
  assert.match(featuresSource, /useEffect\(\(\) => startDecryptionRecovery\(mx\), \[mx\]\)/);
});

test('decryption diagnostics exclude message and key secrets', async () => {
  const diagnosticSource = await readSource('src/app/utils/decryptionDiagnostics.ts');

  assert.match(diagnosticSource, /mEvent\.decryptionFailureReason/);
  assert.match(diagnosticSource, /wireContent\.session_id/);
  assert.match(diagnosticSource, /cryptoDeviceCreationTimeMs/);
  assert.match(diagnosticSource, /serverCurve25519MatchesLocal/);
  assert.match(diagnosticSource, /serverEd25519MatchesLocal/);
  assert.match(diagnosticSource, /serverCurve25519MatchesEvent/);
  assert.match(diagnosticSource, /roomKeyWithheldStatusObserved/);
  assert.match(diagnosticSource, /mx\.downloadKeysForUsers\(keyQueryUsers\)/);
  assert.match(diagnosticSource, /No message body, ciphertext, access token/);
  assert.doesNotMatch(diagnosticSource, /wireContent\.ciphertext/);
});

test('pre-join encrypted history is hidden without masking other failures', async () => {
  const visibilitySource = await readSource('src/app/utils/decryptionVisibility.ts');
  const encryptedContentSource = await readSource(
    'src/app/features/room/message/EncryptedContent.tsx'
  );
  const timelineSource = await readSource('src/app/features/room/RoomTimeline.tsx');

  assert.match(visibilitySource, /HISTORICAL_MESSAGE_USER_NOT_JOINED/);
  assert.match(visibilitySource, /mEvent\.isEncrypted\(\)/);
  assert.match(visibilitySource, /decryptionFailureReason/);
  assert.match(visibilitySource, /return true/);
  assert.doesNotMatch(visibilitySource, /hasEncryptionStateEvent\(\)/);
  assert.match(encryptedContentSource, /shouldHideHistoricalDecryptionFailure/);
  assert.match(timelineSource, /shouldHideHistoricalDecryptionFailure\(mEvent\)/);
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
});
