import { useCallback, useEffect, useRef, useState } from 'react';
import { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';
import { AccountDataEvent, SecretAccountData } from '../../types/matrix/accountData';
import { useAccountData } from './useAccountData';
import { useUserTrustStatusChange } from './useUserTrustStatusChange';

const CROSS_SIGNING_READY_RETRY_MS = 5000;

export const useCrossSigningActive = (): boolean => {
  const masterEvent = useAccountData(AccountDataEvent.CrossSigningMaster);
  const content = masterEvent?.getContent<SecretAccountData>();

  return !!content;
};

export const useCrossSigningReady = (
  crypto: CryptoApi | undefined
): boolean | undefined => {
  const [ready, setReady] = useState<boolean>();
  const retryTimeoutRef = useRef<number>();

  const clearRetryTimeout = useCallback(() => {
    if (typeof retryTimeoutRef.current === 'number') {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = undefined;
    }
  }, []);

  const refresh = useCallback(async () => {
    clearRetryTimeout();

    if (!crypto) {
      setReady(undefined);
      return;
    }

    try {
      setReady(await crypto.isCrossSigningReady());
    } catch {
      setReady(undefined);
      retryTimeoutRef.current = window.setTimeout(() => {
        void refresh();
      }, CROSS_SIGNING_READY_RETRY_MS);
    }
  }, [clearRetryTimeout, crypto]);

  useEffect(() => {
    void refresh();
    return () => {
      clearRetryTimeout();
    };
  }, [clearRetryTimeout, refresh]);

  useUserTrustStatusChange(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  return ready;
};
