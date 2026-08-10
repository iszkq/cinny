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
  assert.match(source, /hasRustCryptoDatabase\(LEGACY_RUST_CRYPTO_DATABASE_PREFIX\)/);
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

test('the recovery-key input remains reachable outside the unverified state', async () => {
  const devicesSource = await readSource('src/app/features/settings/devices/Devices.tsx');
  const verificationSource = await readSource('src/app/features/settings/devices/Verification.tsx');

  assert.match(devicesSource, /verificationStatus !== VerificationStatus\.Unverified/);
  assert.match(devicesSource, /<RecoveryKeyAccessTile/);
  assert.match(verificationSource, /输入恢复密钥/);
  assert.match(verificationSource, /initialMethod=\{ManualVerificationMethod\.RecoveryKey\}/);
});

test('device verification accepts both cross-signing and local SDK trust', async () => {
  const source = await readSource('src/app/utils/matrix-crypto.ts');

  assert.match(source, /status\.crossSigningVerified \|\| status\.localVerified/);
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
});

test('backup restoration is not blocked by cross-signing failures', async () => {
  const source = await readSource('src/app/components/ManualVerification.tsx');

  assert.match(source, /Do not make restoring[\s\S]*conditional on device verification/);
  assert.match(source, /await crypto\.loadSessionBackupPrivateKeyFromSecretStorage\(\)/);
  assert.match(source, /await crypto\.checkKeyBackupAndEnable\(\)/);
  assert.match(source, /crypto\.restoreKeyBackup\(\)/);
});
