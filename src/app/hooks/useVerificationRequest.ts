import { observeIOSPendingVerification } from '../utils/iosVerification';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  CryptoEvent,
  CryptoEventHandlerMap,
  VerificationPhase,
  VerificationRequest,
  VerificationRequestEvent,
  VerificationRequestEventHandlerMap,
  Verifier,
  VerifierEvent,
  VerifierEventHandlerMap,
} from 'matrix-js-sdk/lib/crypto-api';
import { useMatrixClient } from './useMatrixClient';

export const useVerificationRequestReceived = (
  onRequest: CryptoEventHandlerMap[CryptoEvent.VerificationRequestReceived]
) => {
  const mx = useMatrixClient();

  useEffect(() => {
    return observeIOSPendingVerification(mx, onRequest);
  }, [mx, onRequest]);
};

export const useVerificationRequestChange = (
  request: VerificationRequest,
  onChange: VerificationRequestEventHandlerMap[VerificationRequestEvent.Change]
) => {
  useEffect(() => {
    request.on(VerificationRequestEvent.Change, onChange);
    return () => {
      request.removeListener(VerificationRequestEvent.Change, onChange);
    };
  }, [request, onChange]);
};

export const useVerificationRequestPhase = (request: VerificationRequest): VerificationPhase => {
  return useSyncExternalStore(
    useCallback(
      (changed: () => void) => {
        request.on(VerificationRequestEvent.Change, changed);
        return () => {
          request.removeListener(VerificationRequestEvent.Change, changed);
        };
      },
      [request]
    ),
    () => request.phase,
    () => request.phase
  );
};

export const useVerifierCancel = (
  verifier: Verifier,
  onCallback: VerifierEventHandlerMap[VerifierEvent.Cancel]
) => {
  useEffect(() => {
    verifier.on(VerifierEvent.Cancel, onCallback);
    return () => {
      verifier.removeListener(VerifierEvent.Cancel, onCallback);
    };
  }, [verifier, onCallback]);
};

export const useVerifierShowSas = (
  verifier: Verifier,
  onCallback: VerifierEventHandlerMap[VerifierEvent.ShowSas]
) => {
  useEffect(() => {
    verifier.on(VerifierEvent.ShowSas, onCallback);
    return () => {
      verifier.removeListener(VerifierEvent.ShowSas, onCallback);
    };
  }, [verifier, onCallback]);
};

export const useVerifierShowReciprocateQr = (
  verifier: Verifier,
  onCallback: VerifierEventHandlerMap[VerifierEvent.ShowReciprocateQr]
) => {
  useEffect(() => {
    verifier.on(VerifierEvent.ShowReciprocateQr, onCallback);
    return () => {
      verifier.removeListener(VerifierEvent.ShowReciprocateQr, onCallback);
    };
  }, [verifier, onCallback]);
};
