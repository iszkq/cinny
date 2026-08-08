import { MatrixClient } from 'matrix-js-sdk';
import { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';

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
