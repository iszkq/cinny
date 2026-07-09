import { MatrixClient, SyncState } from 'matrix-js-sdk';
import { useCallback, useEffect, useState } from 'react';
import { useSyncState } from './useSyncState';

const READY_SYNC_STATES = new Set<SyncState>([
  SyncState.Prepared,
  SyncState.Syncing,
  SyncState.Catchup,
]);

export const isClientSyncReady = (state: SyncState | null | undefined): boolean =>
  !!state && READY_SYNC_STATES.has(state);

export const useClientSyncReady = (mx: MatrixClient | undefined): boolean => {
  const [ready, setReady] = useState(() => isClientSyncReady(mx?.getSyncState()));

  useEffect(() => {
    setReady(isClientSyncReady(mx?.getSyncState()));
  }, [mx]);

  useSyncState(
    mx,
    useCallback((state) => {
      if (isClientSyncReady(state)) {
        setReady(true);
      }
    }, [])
  );

  return ready;
};
