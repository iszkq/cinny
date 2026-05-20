import { MatrixClient } from 'matrix-js-sdk';
import { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';

export const verifiedDevice = async (
  api: CryptoApi,
  userId: string,
  deviceId: string
): Promise<boolean | null> => {
  const status = await api.getDeviceVerificationStatus(userId, deviceId);

  if (!status) return null;

  const verified = status.crossSigningVerified;
  return verified;
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
