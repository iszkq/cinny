import { MatrixClient } from 'matrix-js-sdk';
import { CryptoApi, VerificationPhase, VerificationRequest } from 'matrix-js-sdk/lib/crypto-api';

const CROSS_SIGN_RETRY_DELAYS_MS = [0, 250, 1000] as const;

const wait = (timeoutMs: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, timeoutMs);
  });

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
  await api.setDeviceVerified(otherUserId, otherDeviceId, true);

  const devicesToCrossSign = Array.from(
    new Set([currentDeviceId, otherDeviceId].filter((deviceId): deviceId is string => !!deviceId))
  );
  let pendingDeviceIds = devicesToCrossSign;

  for (const delayMs of CROSS_SIGN_RETRY_DELAYS_MS) {
    if (pendingDeviceIds.length === 0) break;
    if (delayMs > 0) await wait(delayMs);

    const results = await Promise.allSettled(
      pendingDeviceIds.map((deviceId) => api.crossSignDevice(deviceId))
    );
    pendingDeviceIds = pendingDeviceIds.filter((_, index) => results[index].status === 'rejected');
  }

  const persistedStatus = await api.getDeviceVerificationStatus(otherUserId, otherDeviceId);
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

export const crossSignCurrentDevice = async (mx: MatrixClient): Promise<void> => {
  const crypto = mx.getCrypto();
  const deviceId = mx.getDeviceId();

  if (!crypto || !deviceId) {
    return;
  }

  const crossSignDevice = (
    crypto as CryptoApi & {
      crossSignDevice?: (targetDeviceId: string) => Promise<unknown>;
    }
  ).crossSignDevice;

  if (typeof crossSignDevice !== 'function') {
    return;
  }

  await crossSignDevice.call(crypto, deviceId);
};
