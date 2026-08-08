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

  assert.match(body, /removeFallbackSession\(\)/);
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
  assert.match(source, /cryptoDatabasePrefix: scopedPrefix/);
});

test('device verification accepts both cross-signing and local SDK trust', async () => {
  const source = await readSource('src/app/utils/matrix-crypto.ts');

  assert.match(source, /status\.crossSigningVerified \|\| status\.localVerified/);
});

test('completed device verification refreshes verification badges', async () => {
  const verificationSource = await readSource('src/app/components/DeviceVerification.tsx');
  const statusHookSource = await readSource('src/app/hooks/useDeviceVerificationStatus.ts');

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
