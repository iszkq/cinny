import { useCallback, useEffect, useRef, useState } from 'react';
import { CryptoApi, CryptoEvent } from 'matrix-js-sdk/lib/crypto-api';
import { getAndroidSecureValue } from '../../client/secretStorageKeys';
import { verifiedDevice } from '../utils/matrix-crypto';
import { isAndroidApp } from '../utils/nativePlatform';
import { useAlive } from './useAlive';
import { fulfilledPromiseSettledResult } from '../utils/common';
import { useMatrixClient } from './useMatrixClient';
import { useDeviceListChange } from './useDeviceList';
import { useUserTrustStatusChange } from './useUserTrustStatusChange';

const DEVICE_TRUST_SETTLE_DELAY_MS = 300;
const DEVICE_TRUST_QUERY_TIMEOUT_MS = 6_000;
const DEVICE_TRUST_RETRY_DELAY_MS = 1_500;

const waitForTrustToSettle = (): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, DEVICE_TRUST_SETTLE_DELAY_MS);
  });

const queryVerifiedDevice = (
  crypto: CryptoApi,
  userId: string,
  deviceId: string,
  requireCrossSigning: boolean
): Promise<boolean | null> =>
  new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(
      () => reject(new Error('Device trust query timed out.')),
      DEVICE_TRUST_QUERY_TIMEOUT_MS
    );

    verifiedDevice(crypto, userId, deviceId, requireCrossSigning).then(
      (status) => {
        globalThis.clearTimeout(timeoutId);
        resolve(status);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });

const readVerifiedDevice = async (
  crypto: CryptoApi,
  userId: string,
  deviceId: string,
  requireCrossSigning = false
): Promise<boolean | null> => {
  const status = await queryVerifiedDevice(crypto, userId, deviceId, requireCrossSigning);
  if (status !== false) return status;

  // Device-list and cross-signing events can arrive just before Rust Crypto's
  // trust query reflects the update. Confirm a downgrade once so a late result
  // cannot briefly turn a successfully verified device back to "unverified".
  await waitForTrustToSettle();
  return queryVerifiedDevice(crypto, userId, deviceId, requireCrossSigning);
};

export enum VerificationStatus {
  Unknown,
  Unverified,
  Verified,
  Unsupported,
  Unavailable,
}

export const useDeviceVerificationDetect = (
  crypto: CryptoApi | undefined,
  userId: string,
  deviceId: string | undefined,
  callback: (status: VerificationStatus) => void,
  requireCrossSigning = false
): void => {
  const mx = useMatrixClient();
  const alive = useAlive();
  const latestRequestRef = useRef(0);
  const retryCountRef = useRef(0);

  const updateStatus = useCallback(
    async (resetRetries = false) => {
      if (resetRetries) retryCountRef.current = 0;
      latestRequestRef.current += 1;
      const requestId = latestRequestRef.current;

      if (!crypto || !deviceId) {
        if (alive() && requestId === latestRequestRef.current) {
          callback(VerificationStatus.Unknown);
        }
        return;
      }

      try {
        const data = await readVerifiedDevice(
          crypto,
          userId,
          deviceId,
          requireCrossSigning
        );
        if (!alive() || requestId !== latestRequestRef.current) return;

        if (data === null) {
          retryCountRef.current = 0;
          callback(VerificationStatus.Unsupported);
          return;
        }
        retryCountRef.current = 0;
        callback(data ? VerificationStatus.Verified : VerificationStatus.Unverified);
      } catch {
        // Stop the loading indicator without guessing trusted/untrusted. A later
        // device or user-trust event will retry the query.
        if (alive() && requestId === latestRequestRef.current) {
          callback(VerificationStatus.Unavailable);
          if (retryCountRef.current < 1) {
            retryCountRef.current += 1;
            globalThis.setTimeout(() => {
              if (alive() && requestId === latestRequestRef.current) {
                updateStatus(false);
              }
            }, DEVICE_TRUST_RETRY_DELAY_MS);
          }
        }
      }
    },
    [alive, crypto, deviceId, userId, callback, requireCrossSigning]
  );

  useEffect(() => {
    updateStatus(true);
  }, [mx, updateStatus, userId]);

  useDeviceListChange(
    useCallback(
      (userIds) => {
        if (userIds.includes(userId)) {
          updateStatus(true);
        }
      },
      [userId, updateStatus]
    )
  );

  useUserTrustStatusChange(
    useCallback(
      (changedUserId) => {
        if (changedUserId === userId) {
          updateStatus(true);
        }
      },
      [userId, updateStatus]
    )
  );

  // Recovery-key and SAS completion persist trust in Rust Crypto and publish
  // DevicesUpdated before the device-list/user-trust sync events arrive.
  // Refresh immediately so Android does not keep showing a stale red badge.
  useEffect(() => {
    const handleDevicesUpdated = (userIds: string[]) => {
      if (userIds.includes(userId)) updateStatus(true);
    };
    mx.on(CryptoEvent.DevicesUpdated, handleDevicesUpdated);
    return () => {
      mx.removeListener(CryptoEvent.DevicesUpdated, handleDevicesUpdated);
    };
  }, [mx, updateStatus, userId]);
};

export const useDeviceVerificationStatus = (
  crypto: CryptoApi | undefined,
  userId: string,
  deviceId: string | undefined,
  requireCrossSigning = false
): VerificationStatus => {
  const durableAndroidTrust =
    isAndroidApp() && deviceId && getAndroidSecureValue('verified-device') === '1';
  const durableTrustRef = useRef(Boolean(durableAndroidTrust));
  const [verificationStatus, setVerificationStatus] = useState(
    durableAndroidTrust ? VerificationStatus.Verified : VerificationStatus.Unknown
  );

  const setStatus = useCallback((status: VerificationStatus) => {
    // A durable Android marker is only a startup hint. Keep it while Rust
    // Crypto is restoring, then allow a settled query to revoke it if the
    // trust was genuinely removed.
    if (
      durableTrustRef.current &&
      (status === VerificationStatus.Unknown ||
        status === VerificationStatus.Unavailable ||
        status === VerificationStatus.Unverified)
    ) {
      return;
    }
    setVerificationStatus(status);
  }, []);

  useDeviceVerificationDetect(
    crypto,
    userId,
    deviceId,
    setStatus,
    requireCrossSigning
  );

  return verificationStatus;
};

export const useUnverifiedDeviceCount = (
  crypto: CryptoApi | undefined,
  userId: string,
  devices: string[]
): number | undefined => {
  const mx = useMatrixClient();
  const [unverifiedCount, setUnverifiedCount] = useState<number>();
  const alive = useAlive();
  const latestRequestRef = useRef(0);

  const updateCount = useCallback(async () => {
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;

    if (!crypto) {
      if (alive() && requestId === latestRequestRef.current) {
        setUnverifiedCount(undefined);
      }
      return;
    }

    const promises = devices.map((deviceId) => readVerifiedDevice(crypto, userId, deviceId));
    const result = await Promise.allSettled(promises);
    if (
      result.some(
        (trustResult) =>
          trustResult.status === 'rejected' ||
          (trustResult.status === 'fulfilled' && trustResult.value === null)
      )
    ) {
      // Do not report "all verified" when one or more trust queries failed or
      // Rust Crypto has not learned about a device from the current list yet.
      if (alive() && requestId === latestRequestRef.current) {
        setUnverifiedCount(-1);
      }
      return;
    }

    const settledResult = fulfilledPromiseSettledResult(result);
    const count = settledResult.filter((status) => status === false).length;
    if (alive() && requestId === latestRequestRef.current) {
      setUnverifiedCount(count);
    }
  }, [crypto, userId, devices, alive]);

  useDeviceListChange(
    useCallback(
      (userIds) => {
        if (userIds.includes(userId)) {
          updateCount();
        }
      },
      [userId, updateCount]
    )
  );

  useUserTrustStatusChange(
    useCallback(
      (changedUserId) => {
        if (changedUserId === userId) {
          updateCount();
        }
      },
      [userId, updateCount]
    )
  );

  useEffect(() => {
    const handleDevicesUpdated = (userIds: string[]) => {
      if (userIds.includes(userId)) updateCount();
    };
    mx.on(CryptoEvent.DevicesUpdated, handleDevicesUpdated);
    return () => {
      mx.removeListener(CryptoEvent.DevicesUpdated, handleDevicesUpdated);
    };
  }, [mx, updateCount, userId]);

  useEffect(() => {
    updateCount();
  }, [updateCount]);

  return unverifiedCount;
};
