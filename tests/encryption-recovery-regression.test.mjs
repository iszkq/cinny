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

  assert.match(source, /getRustCryptoDatabasePrefix/);
  assert.match(source, /encodeURIComponent\(session\.userId\)/);
  assert.match(source, /encodeURIComponent\(session\.deviceId\)/);
  assert.match(source, /LEGACY_RUST_CRYPTO_DATABASE_PREFIX = 'matrix-js-sdk'/);
  assert.match(source, /findExistingRustCryptoDatabasePrefixes/);
  assert.match(source, /isRustCryptoAccountMismatch/);
  assert.match(source, /saveRustCryptoDatabasePrefix\(session, prefix\)/);
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

test('automatic room-key request and forwarding policy is left at the SDK default', async () => {
  const initSource = await readSource('src/client/initMatrix.ts');
  const recoverySource = await readSource('src/app/utils/decryptionRecovery.ts');
  const featuresSource = await readSource('src/app/pages/client/ClientNonUIFeatures.tsx');

  assert.doesNotMatch(initSource, /enableMissingRoomKeyRequests/);
  assert.doesNotMatch(initSource, /roomKeyRequestsEnabled\s*=\s*true/);
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
  assert.match(diagnosticSource, /No message body, ciphertext, access token/);
  assert.doesNotMatch(diagnosticSource, /wireContent\.ciphertext/);
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
