import { MatrixEvent, MatrixEventEvent, MatrixEventHandlerMap } from 'matrix-js-sdk';
import React, { ReactNode, useEffect, useState } from 'react';
import { MessageEvent } from '../../../../types/matrix/room';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { recordDecryptionDiagnostic } from '../../../utils/decryptionDiagnostics';
import {
  isDecryptionRecoveryPending,
  observeEncryptedEvent,
} from '../../../utils/decryptionRecovery';
import { shouldHideHistoricalDecryptionFailure } from '../../../utils/decryptionVisibility';

type EncryptedContentProps = {
  mEvent: MatrixEvent;
  children: () => ReactNode;
};

export function EncryptedContent({ mEvent, children }: EncryptedContentProps) {
  const mx = useMatrixClient();
  const [, toggleEncrypted] = useState(mEvent.getType() === MessageEvent.RoomMessageEncrypted);
  const [recovering, setRecovering] = useState(mEvent.isDecryptionFailure());

  useEffect(() => {
    toggleEncrypted(mEvent.getType() === MessageEvent.RoomMessageEncrypted);
    observeEncryptedEvent(mx, mEvent);
    const updateRecoveryState = () => {
      setRecovering(isDecryptionRecoveryPending(mx, mEvent));
    };
    updateRecoveryState();
    const recoveryPoll = window.setInterval(updateRecoveryState, 500);

    if (mEvent.isDecryptionFailure()) {
      recordDecryptionDiagnostic(mx, mEvent, 'failure_observed');
    }

    const handleDecrypted: MatrixEventHandlerMap[MatrixEventEvent.Decrypted] = (event) => {
      toggleEncrypted(event.getType() === MessageEvent.RoomMessageEncrypted);
      if (event.isDecryptionFailure()) {
        setRecovering(isDecryptionRecoveryPending(mx, event));
        recordDecryptionDiagnostic(mx, event, 'failure_observed');
      } else {
        setRecovering(false);
        recordDecryptionDiagnostic(mx, event, 'key_received');
      }
    };

    mEvent.on(MatrixEventEvent.Decrypted, handleDecrypted);
    return () => {
      mEvent.removeListener(MatrixEventEvent.Decrypted, handleDecrypted);
      window.clearInterval(recoveryPoll);
    };
  }, [mEvent, mx]);

  if (recovering && mEvent.isDecryptionFailure()) {
    // Do not flash a permanent-looking "unable to decrypt" bubble while the
    // backup/key-request recovery queue is still running. Once the recovery
    // window expires, the poll observes the cleared task and the real error
    // renderer is shown.
    return <span aria-busy="true">正在恢复加密消息…</span>;
  }

  if (shouldHideHistoricalDecryptionFailure(mx, mEvent)) return null;

  return <>{children()}</>;
}
