import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('only an explicit soft logout may reuse the local Matrix device', async () => {
  const clientSource = await readSource('src/client/initMatrix.ts');
  const rootSource = await readSource('src/app/pages/client/ClientRoot.tsx');
  const sessionSource = await readSource('src/app/state/sessions.ts');
  const loginSource = await readSource('src/app/pages/auth/login/loginUtil.ts');
  const start = clientSource.indexOf('export const clearExpiredSessionAfterLogout');
  const end = clientSource.indexOf('export const logoutClient', start);
  const body = clientSource.slice(start, end);

  assert.match(body, /removeFallbackAccessToken\(\)/);
  assert.doesNotMatch(body, /removeFallbackSession\(\)/);
  assert.match(body, /await mx\?\.store\.deleteAllData\(\)/);
  assert.doesNotMatch(body, /clearStores\(\)|localStorage\.clear\(\)/);
  assert.match(rootSource, /error\.httpStatus === 401 && error\.data\?\.soft_logout === true/);
  assert.match(rootSource, /await clearExpiredSessionAfterLogout\(mx, softLogout\)/);
  assert.match(sessionSource, /FALLBACK_SOFT_LOGOUT_KEY = 'cinny_soft_logout'/);
  assert.match(loginSource, /isFallbackSessionSoftLoggedOut\(\) &&/);
  assert.match(loginSource, /reusedDeviceStillHasServerKeys/);
  assert.match(loginSource, /await staleClient\.logout\(\)\.catch/);
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
  assert.match(loginSource, /isFallbackSessionSoftLoggedOut\(\)/);
  assert.match(loginSource, /await hasPersistedRustCryptoStore\(savedIdentity\)/);
  assert.match(loginSource, /device_id: savedIdentity!\.deviceId/);
  assert.match(loginSource, /downloadKeysForUsers\(\[loginResponse\.user_id\]\)/);
  assert.match(loginSource, /mx\.loginRequest\(loginRequest\)/);
  assert.match(loginSource, /allowNewRustCryptoStore/);
  assert.match(cryptoStoreSource, /getRustCryptoDatabasePrefix/);
  assert.match(cryptoStoreSource, /hasPersistedRustCryptoStore/);
  assert.match(cryptoStoreSource, /isNewRustCryptoStoreAllowed/);
  assert.match(clientSource, /removeFallbackAccessToken\(\)/);
  assert.match(clientSource, /class MissingCryptoStoreError extends Error/);
  assert.match(rootSource, /loadState\.error instanceof MissingCryptoStoreError/);
});

test('an updated client replaces a retained session whose server crypto identity disappeared', async () => {
  const clientSource = await readSource('src/client/initMatrix.ts');
  const rootSource = await readSource('src/app/pages/client/ClientRoot.tsx');
  const authSource = await readSource('src/app/pages/auth/AuthLayout.tsx');
  const sessionSource = await readSource('src/app/state/sessions.ts');

  assert.match(clientSource, /inspectCurrentDeviceIdentity/);
  assert.match(
    clientSource,
    /Promise\.all\(\[[\s\S]*mx\.getDevices\(\),[\s\S]*mx\.downloadKeysForUsers/
  );
  assert.match(clientSource, /serverCurve25519 === ownKeys\.curve25519/);
  assert.match(clientSource, /serverEd25519 === ownKeys\.ed25519/);
  assert.match(clientSource, /DEVICE_IDENTITY_CONFIRM_DELAY_MS/);
  assert.match(clientSource, /if \(confirmedStatus !== 'invalid'\) return/);
  assert.match(
    clientSource,
    /if \(!newlyIssuedDevice && !isAndroidApp\(\)\) await validateExistingCryptoDevice/
  );
  assert.match(
    clientSource,
    /await Promise\.allSettled\(\[clearAndroidClientSnapshot\(mx\), mx\.store\.deleteAllData\(\)\]\)/
  );
  assert.match(clientSource, /removeFallbackAccessToken\(\)/);
  assert.doesNotMatch(
    clientSource.slice(
      clientSource.indexOf('const invalidateCurrentCryptoDevice'),
      clientSource.indexOf('const validateExistingCryptoDevice')
    ),
    /localStorage\.clear|clearDesktopMediaCache|clearClientStores/
  );
  assert.match(rootSource, /loadState\.error instanceof InvalidCryptoDeviceError/);
  assert.match(sessionSource, /markCryptoDeviceRecoveryNotice/);
  assert.match(authSource, /consumeCryptoDeviceRecoveryNotice/);
  assert.match(authSource, /加密设备身份已在服务器失效/);
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
  const cryptoStoreSource = await readSource('src/client/rustCryptoStore.ts');
  const initSource = await readSource('src/client/initMatrix.ts');
  const sessionSource = await readSource('src/app/state/sessions.ts');
  const entrySource = await readSource('src/index.tsx');
  const nativeSecureStorageSource = await readSource(
    'android/app/src/main/java/com/iszkq/starfire/AndroidSecureStoragePlugin.java'
  );

  assert.match(secureStorageSource, /cinny_android_backup_trusted:/);
  assert.match(secureStorageSource, /session-backup-private-key/);
  assert.match(initSource, /restoreAndroidBackupKey\(crypto\)/);
  assert.match(initSource, /persistAndroidBackupKey\(crypto/);
  assert.match(initSource, /requestPersistentAndroidStorage\(\)/);
  assert.match(initSource, /loadAndroidClientSnapshot/);
  assert.match(secureStorageSource, /ACTIVE_SESSION_KEY = 'cinny_android_active_session_v1'/);
  assert.match(secureStorageSource, /GLOBAL_SECRET_KEYS_KEY = 'cinny_android_secret_storage_keys_v1'/);
  assert.match(secureStorageSource, /GLOBAL_CRYPTO_VALUE_PREFIX = 'cinny_android_crypto_value_v1:'/);
  assert.match(
    secureStorageSource,
    /The global Android key is the source of truth[\s\S]*AndroidSecureStorage\.set\(\{ key: globalKey/
  );
  assert.match(secureStorageSource, /return secureValues\.get\(globalSecureValueKey\(name\)\)/);
  assert.match(secureStorageSource, /globalSecureValueKey\('verified-device'\)/);
  assert.match(secureStorageSource, /persistAndroidSession/);
  assert.match(secureStorageSource, /hydrateAndroidSession/);
  assert.match(
    secureStorageSource,
    /export const persistAndroidSession[\s\S]*NATIVE_STORAGE_RETRY_COUNT[\s\S]*AndroidSecureStorage\.set/
  );
  assert.match(
    secureStorageSource,
    /const loadSecureKeys = async \(\) => \{\s*if \(!isAndroid\(\)\) return false;/
  );
  assert.match(secureStorageSource, /const isAndroidBuild = import\.meta\.env\.VITE_ANDROID_APP === 'true'/);
  assert.match(secureStorageSource, /if \(!nativeStorageLoaded\) \{/);
  assert.match(secureStorageSource, /const scopedStorageKey = secureStorageKey\(\)/);
  assert.match(secureStorageSource, /hydrateScopedSecretStorageKeys\(\);[\s\S]*return;/);
  assert.match(sessionSource, /await persistAndroidSession/);
  assert.match(sessionSource, /removeAndroidPersistedSession/);
  assert.match(entrySource, /if \(isAndroidApp\(\)\) await hydrateAndroidSession\(\)/);
  assert.match(initSource, /persistAndroidCryptoState/);
  assert.match(initSource, /setAndroidSecureValue\('verified-device', '1'\)/);
  assert.match(initSource, /restoreAndroidSecretsBundle\(crypto\)/);
  assert.match(initSource, /persistAndroidSecretsBundle\(crypto\)/);
  assert.match(initSource, /await crypto\.crossSignDevice\(deviceId\)/);
  assert.match(initSource, /verification\?\.crossSigningVerified !== true/);
  assert.match(initSource, /if \(!secretsRestored && hasAndroidSecretStorageKey\(\)\)/);
  assert.match(initSource, /secretStorageStatus\.secretStorageKeyValidityMap\[name\] === true/);
  assert.match(initSource, /if \(!newlyIssuedDevice && !isAndroidApp\(\)\)/);
  assert.match(initSource, /Android WebView can briefly report an empty IndexedDB list/);
  assert.match(initSource, /const retryDelays = \[250, 500, 1_000, 2_000, 4_000\]/);
  assert.match(
    cryptoStoreSource,
    /if \(isAndroidApp\(\)\) return findExistingPrefixesByOpening\(prefixes\)/
  );
  assert.match(cryptoStoreSource, /request\.transaction\?\.abort\(\)/);
  assert.match(cryptoStoreSource, /if \(isAndroidApp\(\)\) \{/);
  assert.match(initSource, /Do not gate Android startup on an IndexedDB existence probe/);
  assert.match(initSource, /throw new MissingCryptoStoreError\(\)/);
  assert.match(initSource, /if \(candidates\.length === 0 && !storeCreationAllowed\)/);
  assert.match(secureStorageSource, /crypto\.getSessionBackupPrivateKey\(\)/);
  assert.match(
    secureStorageSource,
    /existingKey instanceof Uint8Array && existingVersion === parsed\.version/
  );
  assert.match(sessionSource, /cinny_refresh_token/);
  assert.match(initSource, /tokenRefreshFunction/);
  assert.match(
    initSource,
    /if \(!isAndroidApp\(\)\) \{\s*removeAndroidPersistedSession\(\);\s*removeFallbackAccessToken\(\);/
  );
  assert.match(nativeSecureStorageSource, /new KeyGenParameterSpec\.Builder/);
  assert.match(nativeSecureStorageSource, /KeyProperties\.PURPOSE_ENCRYPT/);
  assert.match(nativeSecureStorageSource, /KeyProperties\.BLOCK_MODE_GCM/);
  assert.doesNotMatch(nativeSecureStorageSource, /generator\.init\(256\)/);
  assert.doesNotMatch(nativeSecureStorageSource, /cleanup\.remove\(entry\.getKey\(\)\)/);
  assert.match(nativeSecureStorageSource, /decryptedEntryCount == 0/);
  assert.match(nativeSecureStorageSource, /Unable to decrypt secure storage entries/);
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
  assert.match(recoverySource, /SDK_RECOVERY_GRACE_MS = 15_000/);
  assert.match(recoverySource, /SDK is deliberately the sole owner/);
  assert.doesNotMatch(recoverySource, /restoreSessionFromBackup/);
  assert.doesNotMatch(recoverySource, /outgoingRequestsManager|onSyncCompleted|attemptDecryption/);
  assert.match(featuresSource, /startDecryptionRecovery\(mx\)/);
  assert.match(featuresSource, /startBackgroundRoomDecryption\(mx\)/);
});

test('decryption diagnostics exclude message and key secrets', async () => {
  const diagnosticSource = await readSource('src/app/utils/decryptionDiagnostics.ts');

  assert.match(diagnosticSource, /mEvent\.decryptionFailureReason/);
  assert.match(diagnosticSource, /wireContent\.session_id/);
  assert.match(diagnosticSource, /cryptoDeviceCreationTimeMs/);
  assert.match(diagnosticSource, /serverCurve25519MatchesLocal/);
  assert.match(diagnosticSource, /serverEd25519MatchesLocal/);
  assert.match(diagnosticSource, /serverDeviceSessionFound/);
  assert.match(diagnosticSource, /mx\.getDevices\(\)/);
  assert.match(diagnosticSource, /serverCurve25519MatchesEvent/);
  assert.match(diagnosticSource, /roomKeyWithheldStatusObserved/);
  assert.match(diagnosticSource, /mx\.downloadKeysForUsers\(keyQueryUsers\)/);
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
