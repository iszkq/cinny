import { useCallback, useEffect, useRef, useState } from 'react';
import { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';
import { verifiedDevice } from '../utils/matrix-crypto';
import { useAlive } from './useAlive';
import { fulfilledPromiseSettledResult } from '../utils/common';
import { useMatrixClient } from './useMatrixClient';
import { useDeviceListChange } from './useDeviceList';
import { useUserTrustStatusChange } from './useUserTrustStatusChange';

const VERIFICATION_STATUS_RETRY_MS = 5000;

export enum VerificationStatus {
  Unknown,
  Unverified,
  Verified,
  Unsupported,
}

export const useDeviceVerificationDetect = (
  crypto: CryptoApi | undefined,
  userId: string,
  deviceId: string | undefined,
  callback: (status: VerificationStatus) => void
): void => {
  const mx = useMatrixClient();
  const retryTimeoutRef = useRef<number>();

  const clearRetryTimeout = useCallback(() => {
    if (typeof retryTimeoutRef.current === 'number') {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = undefined;
    }
  }, []);

  const updateStatus = useCallback(async () => {
    clearRetryTimeout();

    if (crypto && deviceId) {
      try {
        const data = await verifiedDevice(crypto, userId, deviceId);
        if (data === null) {
          callback(VerificationStatus.Unsupported);
          return;
        }
        callback(data ? VerificationStatus.Verified : VerificationStatus.Unverified);
        return;
      } catch {
        callback(VerificationStatus.Unknown);
        retryTimeoutRef.current = window.setTimeout(() => {
          void updateStatus();
        }, VERIFICATION_STATUS_RETRY_MS);
        return;
      }
    }
    callback(VerificationStatus.Unknown);
  }, [callback, clearRetryTimeout, crypto, deviceId, userId]);

  useEffect(() => {
    void updateStatus();
    return () => {
      clearRetryTimeout();
    };
  }, [clearRetryTimeout, mx, updateStatus, userId]);

  useDeviceListChange(
    useCallback(
      (userIds) => {
        if (userIds.includes(userId)) {
          void updateStatus();
        }
      },
      [userId, updateStatus]
    )
  );

  useUserTrustStatusChange(
    useCallback(() => {
      void updateStatus();
    }, [updateStatus])
  );
};

export const useDeviceVerificationStatus = (
  crypto: CryptoApi | undefined,
  userId: string,
  deviceId: string | undefined
): VerificationStatus => {
  const [verificationStatus, setVerificationStatus] = useState(VerificationStatus.Unknown);

  useDeviceVerificationDetect(crypto, userId, deviceId, setVerificationStatus);

  return verificationStatus;
};

export const useUnverifiedDeviceCount = (
  crypto: CryptoApi | undefined,
  userId: string,
  devices: string[]
): number | undefined => {
  const [unverifiedCount, setUnverifiedCount] = useState<number>(0);
  const alive = useAlive();

  const updateCount = useCallback(async () => {
    try {
      let count = 0;
      if (crypto) {
        const promises = devices.map((deviceId) => verifiedDevice(crypto, userId, deviceId));
        const result = await Promise.allSettled(promises);
        const settledResult = fulfilledPromiseSettledResult(result);
        settledResult.forEach((status) => {
          if (status === false) {
            count += 1;
          }
        });
      }

      if (alive()) {
        setUnverifiedCount(count);
      }
    } catch {
      if (alive()) {
        setUnverifiedCount(0);
      }
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

  useEffect(() => {
    updateCount();
  }, [updateCount]);

  return unverifiedCount;
};
