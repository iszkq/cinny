import { MatrixEvent, MatrixEventEvent, MatrixEventHandlerMap } from 'matrix-js-sdk';
import React, { ReactNode, useEffect, useState } from 'react';
import { MessageEvent } from '../../../../types/matrix/room';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { recordDecryptionDiagnostic } from '../../../utils/decryptionDiagnostics';
import { observeEncryptedEvent } from '../../../utils/decryptionRecovery';

type EncryptedContentProps = {
  mEvent: MatrixEvent;
  children: () => ReactNode;
};

export function EncryptedContent({ mEvent, children }: EncryptedContentProps) {
  const mx = useMatrixClient();
  const [, toggleEncrypted] = useState(mEvent.getType() === MessageEvent.RoomMessageEncrypted);

  useEffect(() => {
    toggleEncrypted(mEvent.getType() === MessageEvent.RoomMessageEncrypted);
    observeEncryptedEvent(mx, mEvent);

    if (mEvent.isDecryptionFailure()) {
      recordDecryptionDiagnostic(mx, mEvent, 'failure_observed');
    }

    const handleDecrypted: MatrixEventHandlerMap[MatrixEventEvent.Decrypted] = (event) => {
      toggleEncrypted(event.getType() === MessageEvent.RoomMessageEncrypted);
      if (event.isDecryptionFailure()) {
        recordDecryptionDiagnostic(mx, event, 'failure_observed');
      } else {
        recordDecryptionDiagnostic(mx, event, 'key_received');
      }
    };

    mEvent.on(MatrixEventEvent.Decrypted, handleDecrypted);
    return () => {
      mEvent.removeListener(MatrixEventEvent.Decrypted, handleDecrypted);
    };
  }, [mEvent, mx]);

  return <>{children()}</>;
}
