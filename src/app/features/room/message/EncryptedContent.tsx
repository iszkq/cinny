import { MatrixEvent, MatrixEventEvent, MatrixEventHandlerMap } from 'matrix-js-sdk';
import { CryptoBackend } from 'matrix-js-sdk/lib/common-crypto/CryptoBackend';
import React, { ReactNode, useEffect, useState } from 'react';
import { MessageEvent } from '../../../../types/matrix/room';
import { useMatrixClient } from '../../../hooks/useMatrixClient';

const RECENT_DECRYPTION_RETRY_WINDOW_MS = 15 * 60 * 1000;
const DECRYPTION_RETRY_DELAYS_MS = [0, 500, 2_000, 5_000] as const;

type EncryptedContentProps = {
  mEvent: MatrixEvent;
  children: () => ReactNode;
};

export function EncryptedContent({ mEvent, children }: EncryptedContentProps) {
  const mx = useMatrixClient();
  const [, toggleEncrypted] = useState(mEvent.getType() === MessageEvent.RoomMessageEncrypted);

  useEffect(() => {
    let disposed = false;
    let retryTimer: number | undefined;
    let retryIndex = 0;

    toggleEncrypted(mEvent.getType() === MessageEvent.RoomMessageEncrypted);
    const handleDecrypted: MatrixEventHandlerMap[MatrixEventEvent.Decrypted] = (event) => {
      toggleEncrypted(event.getType() === MessageEvent.RoomMessageEncrypted);
    };

    const retryRecentDecryption = async () => {
      retryTimer = undefined;
      if (disposed) return;
      if (Date.now() - mEvent.getTs() > RECENT_DECRYPTION_RETRY_WINDOW_MS) return;
      if (mEvent.getType() !== MessageEvent.RoomMessageEncrypted && !mEvent.isDecryptionFailure()) {
        return;
      }

      const crypto = mx.getCrypto();
      if (!crypto || mEvent.isBeingDecrypted()) return;
      await mEvent
        .attemptDecryption(crypto as CryptoBackend, { isRetry: true })
        .catch(() => undefined);

      if (
        disposed ||
        (mEvent.getType() !== MessageEvent.RoomMessageEncrypted && !mEvent.isDecryptionFailure())
      ) {
        return;
      }
      retryIndex += 1;
      const nextDelay = DECRYPTION_RETRY_DELAYS_MS[retryIndex];
      if (nextDelay !== undefined) {
        retryTimer = window.setTimeout(retryRecentDecryption, nextDelay);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || retryTimer !== undefined) return;
      retryIndex = 0;
      retryTimer = window.setTimeout(retryRecentDecryption, 0);
    };

    mEvent.on(MatrixEventEvent.Decrypted, handleDecrypted);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    retryTimer = window.setTimeout(retryRecentDecryption, DECRYPTION_RETRY_DELAYS_MS[0]);
    return () => {
      disposed = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      mEvent.removeListener(MatrixEventEvent.Decrypted, handleDecrypted);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [mEvent, mx]);

  return <>{children()}</>;
}
