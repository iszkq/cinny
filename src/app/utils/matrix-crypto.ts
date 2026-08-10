import { MatrixClient } from 'matrix-js-sdk';
import { CryptoApi, VerificationPhase, VerificationRequest } from 'matrix-js-sdk/lib/crypto-api';

const CROSS_SIGN_RETRY_DELAYS_MS = [0, 250, 1000] as const;
const CRYPTO_WRITE_TIMEOUT_MS = 10_000;
const CROSS_SIGN_ATTEMPT_TIMEOUT_MS = 6_000;
const CRYPTO_STATUS_TIMEOUT_MS = 6_000;

class CryptoOperationTimeoutError extends Error {}

const wait = (timeoutMs: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, timeoutMs);
  });

const withTimeout = <T>(task: Promise<T>, timeoutMs: number, message: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      reject(new CryptoOperationTimeoutError(message));
    }, timeoutMs);

    task.then(
      (value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });

const crossSignDevicesWithRetry = async (
  api: CryptoApi,
  deviceIds: string[]
): Promise<string[]> => {
  let pendingDeviceIds = Array.from(new Set(deviceIds));
  const timedOutDeviceIds = new Set<string>();

  for (const delayMs of CROSS_SIGN_RETRY_DELAYS_MS) {
    if (pendingDeviceIds.length === 0) break;
    if (delayMs > 0) await wait(delayMs);

    const results = await Promise.allSettled(
      pendingDeviceIds.map((deviceId) =>
        withTimeout(
          Promise.resolve().then(() => api.crossSignDevice(deviceId)),
          CROSS_SIGN_ATTEMPT_TIMEOUT_MS,
          '跨设备签名等待服务器响应超时。'
        )
      )
    );
    pendingDeviceIds = pendingDeviceIds.filter((deviceId, index) => {
      const result = results[index];
      if (result.status === 'fulfilled') return false;
      if (result.reason instanceof CryptoOperationTimeoutError) {
        // The SDK request can still finish after our UI deadline. Do not start
        // overlapping signature uploads; report it as pending and let normal
        // crypto sync reconcile the trust in the background.
        timedOutDeviceIds.add(deviceId);
        return false;
      }
      return true;
    });
  }

  return Array.from(new Set([...timedOutDeviceIds, ...pendingDeviceIds]));
};

export const verifiedDevice = async (
  api: CryptoApi,
  userId: string,
  deviceId: string
): Promise<boolean | null> => {
  const status = await api.getDeviceVerificationStatus(userId, deviceId);

  if (!status) return null;

  // Rust Crypto can record a successful verification either through cross
  // signing or as local device trust. Treat both SDK trust paths as verified.
  const verified = status.crossSigningVerified || status.localVerified;
  return verified;
};

export type CompletedDeviceVerificationResult = {
  crossSigningSynced: boolean;
};

/**
 * Persist the trust established by a completed self-device SAS flow.
 *
 * Rust Crypto normally updates this itself, but some sync/order combinations
 * reach VerificationPhase.Done before the device trust query reflects the
 * result. Store local trust as the durable fallback and also publish
 * cross-signing signatures so the result can propagate to the other devices.
 */
export const persistCompletedDeviceVerification = async (
  api: CryptoApi,
  request: VerificationRequest,
  currentDeviceId: string | undefined
): Promise<CompletedDeviceVerificationResult> => {
  if (request.phase !== VerificationPhase.Done) {
    throw new Error('设备验证尚未完成，不能写入可信状态。');
  }
  if (!request.isSelfVerification || !request.otherDeviceId) {
    throw new Error('无法确定本次验证对应的设备。');
  }

  const { otherUserId, otherDeviceId } = request;

  // Local trust is stored in the account/device-specific Rust Crypto database
  // and guarantees that this client does not fall back to "unverified" after
  // a successful SAS flow merely because cross-signing sync is delayed.
  await withTimeout(
    Promise.resolve().then(() => api.setDeviceVerified(otherUserId, otherDeviceId, true)),
    CRYPTO_WRITE_TIMEOUT_MS,
    '保存设备可信状态超时，请稍后重试。'
  );

  const devicesToCrossSign = Array.from(
    new Set([currentDeviceId, otherDeviceId].filter((deviceId): deviceId is string => !!deviceId))
  );
  const pendingDeviceIds = await crossSignDevicesWithRetry(api, devicesToCrossSign);

  const persistedStatus = await withTimeout(
    api.getDeviceVerificationStatus(otherUserId, otherDeviceId),
    CRYPTO_STATUS_TIMEOUT_MS,
    '读取设备可信状态超时，请稍后重试。'
  );
  if (
    !persistedStatus ||
    (!persistedStatus.crossSigningVerified && !persistedStatus.localVerified)
  ) {
    throw new Error('设备可信状态未能保存，请保持两台设备在线后重试。');
  }

  return {
    crossSigningSynced: pendingDeviceIds.length === 0,
  };
};

/**
 * Finish recovery-key verification for the access token's current device.
 * Call this only after bootstrapCrossSigning has accepted the recovery key.
 */
export const persistCurrentDeviceVerification = async (
  mx: MatrixClient
): Promise<CompletedDeviceVerificationResult> => {
  const crypto = mx.getCrypto();
  const deviceId = mx.getDeviceId();
  const userId = mx.getUserId();

  if (!crypto || !deviceId || !userId) {
    throw new Error('无法确定当前登录设备，请重新登录后再试。');
  }

  // The recovery key proves possession of this account's cross-signing
  // secrets. Persist local trust as well as the server-side signature so web
  // reloads and delayed /keys/query responses cannot revert the badge.
  await withTimeout(
    Promise.resolve().then(() => crypto.setDeviceVerified(userId, deviceId, true)),
    CRYPTO_WRITE_TIMEOUT_MS,
    '保存当前设备可信状态超时，请稍后重试。'
  );
  const pendingDeviceIds = await crossSignDevicesWithRetry(crypto, [deviceId]);

  const persistedStatus = await withTimeout(
    crypto.getDeviceVerificationStatus(userId, deviceId),
    CRYPTO_STATUS_TIMEOUT_MS,
    '读取当前设备可信状态超时，请稍后重试。'
  );
  if (
    !persistedStatus ||
    (!persistedStatus.crossSigningVerified && !persistedStatus.localVerified)
  ) {
    throw new Error('当前设备可信状态未能保存，请重试。');
  }

  return {
    crossSigningSynced: pendingDeviceIds.length === 0,
  };
};
