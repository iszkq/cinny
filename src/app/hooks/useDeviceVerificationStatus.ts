import { observeIOSIdentityChanges } from '../utils/iosVerification';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';
import { verifiedDevice } from '../utils/matrix-crypto';
import { useAlive } from './useAlive';
import { fulfilledPromiseSettledResult } from '../utils/common';
import { useMatrixClient } from './useMatrixClient';
import { useDeviceListChange } from './useDeviceList';

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
  const alive = useAlive();
  const generation = useRef(0);

  const updateStatus = useCallback(async () => {
    const current = ++generation.current;
    if (crypto && deviceId) {
      const data = await verifiedDevice(crypto, userId, deviceId);
      if (!alive() || current !== generation.current) return;
      if (data === null) {
        callback(VerificationStatus.Unsupported);
        return;
      }
      callback(data ? VerificationStatus.Verified : VerificationStatus.Unverified);
      return;
    }
    callback(VerificationStatus.Unknown);
  }, [crypto, deviceId, userId, callback, alive]);

  useEffect(() => {
    updateStatus().catch(() => undefined);
  }, [mx, updateStatus, userId]);

  useEffect(() => {
    const changed = () => {
      updateStatus().catch(() => undefined);
    };
    return observeIOSIdentityChanges(mx, userId, changed);
  }, [mx, userId, updateStatus]);

  useDeviceListChange(
    useCallback(
      (userIds) => {
        if (userIds.includes(userId)) {
          updateStatus().catch(() => undefined);
        }
      },
      [userId, updateStatus]
    )
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
  const [unverifiedCount, setUnverifiedCount] = useState<number>();
  const alive = useAlive();

  const updateCount = useCallback(async () => {
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
