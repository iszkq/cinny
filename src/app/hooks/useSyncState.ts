import { ClientEvent, ClientEventHandlerMap, MatrixClient } from 'matrix-js-sdk';
import { useEffect } from 'react';

export const useSyncState = (
  mx: MatrixClient | undefined,
  onChange: ClientEventHandlerMap[ClientEvent.Sync]
): void => {
  useEffect(() => {
    if (!mx) {
      return undefined;
    }

    mx.on(ClientEvent.Sync, onChange);

    const currentState = mx.getSyncState();
    if (currentState) {
      onChange(currentState, null, mx.getSyncStateData() ?? undefined);
    }

    return () => {
      mx.removeListener(ClientEvent.Sync, onChange);
    };
  }, [mx, onChange]);
};
