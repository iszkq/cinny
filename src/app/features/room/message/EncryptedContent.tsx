import {
  ClientEvent,
  ClientEventHandlerMap,
  MatrixEvent,
  MatrixEventEvent,
  MatrixEventHandlerMap,
  SyncState,
} from 'matrix-js-sdk';
import { CryptoBackend } from 'matrix-js-sdk/lib/common-crypto/CryptoBackend';
import React, { ReactNode, useEffect, useState } from 'react';
import { MessageEvent } from '../../../../types/matrix/room';
import { useMatrixClient } from '../../../hooks/useMatrixClient';

const RECENT_DECRYPTION_RETRY_WINDOW_MS = 60 * 60 * 1000;
const DECRYPTION_RETRY_DELAYS_MS = [0, 500, 2_000, 5_000, 15_000, 30_000, 60_000] as const;
const DECRYPTION_IN_PROGRESS_POLL_MS = 250;

const DECRYPTION_RECOVERY_SYNC_STATES = new Set<SyncState>([
  SyncState.Prepared,
  SyncState.Catchup,
  SyncState.Syncing,
]);

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
    let retryAttemptRunning = false;

    toggleEncrypted(mEvent.getType() === MessageEvent.RoomMessageEncrypted);

    const needsDecryption = () =>
      mEvent.getType() === MessageEvent.RoomMessageEncrypted || mEvent.isDecryptionFailure();

    const isRecentEvent = () => Date.now() - mEvent.getTs() <= RECENT_DECRYPTION_RETRY_WINDOW_MS;

    const scheduleRetry = (delay: number) => {
      if (disposed || retryTimer !== undefined || !needsDecryption() || !isRecentEvent()) return;
      retryTimer = window.setTimeout(retryRecentDecryption, delay);
    };

    const restartRetries = () => {
      if (disposed || !needsDecryption() || !isRecentEvent()) return;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      retryTimer = undefined;
      retryIndex = 0;
      scheduleRetry(DECRYPTION_RETRY_DELAYS_MS[0]);
    };

    const handleDecrypted: MatrixEventHandlerMap[MatrixEventEvent.Decrypted] = (event) => {
      toggleEncrypted(event.getType() === MessageEvent.RoomMessageEncrypted);
      // The SDK emits this event for failed attempts too. If its initial
      // decryption raced our first timer, make sure the recovery sequence is
      // still started instead of leaving the event permanently failed.
      const retryDelay = DECRYPTION_RETRY_DELAYS_MS[retryIndex];
      if (event.isDecryptionFailure() && !retryAttemptRunning && retryDelay !== undefined) {
        scheduleRetry(retryDelay);
      }
    };

    async function retryRecentDecryption() {
      retryTimer = undefined;
      if (disposed) return;
      if (!isRecentEvent() || !needsDecryption()) return;

      const crypto = mx.getCrypto();
      if (!crypto) return;
      if (mEvent.isBeingDecrypted()) {
        // A new timeline event is commonly still inside the SDK's first
        // attempt when the zero-delay timer runs. Poll without consuming a
        // retry slot so the actual retries are not silently skipped.
        scheduleRetry(DECRYPTION_IN_PROGRESS_POLL_MS);
        return;
      }

      retryAttemptRunning = true;
      await mEvent
        .attemptDecryption(crypto as CryptoBackend, { isRetry: true })
        .catch(() => undefined);
      retryAttemptRunning = false;

      if (disposed || !needsDecryption()) return;
      retryIndex += 1;
      const nextDelay = DECRYPTION_RETRY_DELAYS_MS[retryIndex];
      if (nextDelay !== undefined) scheduleRetry(nextDelay);
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') restartRetries();
    };

    const handleWindowFocus = () => restartRetries();
    const handleOnline = () => restartRetries();
    const handleSync: ClientEventHandlerMap[ClientEvent.Sync] = (state, prevState) => {
      if (
        state &&
        DECRYPTION_RECOVERY_SYNC_STATES.has(state) &&
        state !== prevState &&
        (!prevState || !DECRYPTION_RECOVERY_SYNC_STATES.has(prevState))
      ) {
        restartRetries();
      }
    };

    mEvent.on(MatrixEventEvent.Decrypted, handleDecrypted);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('online', handleOnline);
    mx.on(ClientEvent.Sync, handleSync);
    scheduleRetry(DECRYPTION_RETRY_DELAYS_MS[0]);
    return () => {
      disposed = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      mEvent.removeListener(MatrixEventEvent.Decrypted, handleDecrypted);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('online', handleOnline);
      mx.removeListener(ClientEvent.Sync, handleSync);
    };
  }, [mEvent, mx]);

  return <>{children()}</>;
}
