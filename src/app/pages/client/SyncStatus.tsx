import { MatrixClient, SyncState } from 'matrix-js-sdk';
import React, { useCallback, useEffect, useState } from 'react';
import { Box, config, Line, Text } from 'folds';
import { useSyncState } from '../../hooks/useSyncState';
import { ContainerColor } from '../../styles/ContainerColor.css';
import { getSyncTransportDiagnostics, SYNC_POLL_TIMEOUT_MS } from '../../../client/initMatrix';

type StateData = {
  current: SyncState | null;
};

type SyncStatusProps = {
  mx: MatrixClient;
};

const SYNCING_BANNER_STATES = new Set<SyncState>([SyncState.Catchup]);
const SYNC_STATUS_REFRESH_INTERVAL_MS = 2000;
const RECENT_SYNC_NETWORK_ERROR_WINDOW_MS = 30000;
const STALE_SYNC_RESPONSE_WINDOW_MS = SYNC_POLL_TIMEOUT_MS + 15000;
const HUNG_SYNC_REQUEST_WINDOW_MS = SYNC_POLL_TIMEOUT_MS + 15000;

export function SyncStatus({ mx }: SyncStatusProps) {
  const [stateData, setStateData] = useState<StateData>({
    current: null,
  });
  const [, forceRefresh] = useState(0);

  useSyncState(
    mx,
    useCallback((current) => {
      setStateData((s) => {
        if (s.current === current) {
          return s;
        }
        return { current };
      });
    }, [])
  );

  useEffect(() => {
    const refresh = () => {
      forceRefresh((state) => state + 1);
    };

    const interval = window.setInterval(refresh, SYNC_STATUS_REFRESH_INTERVAL_MS);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const diagnostics = getSyncTransportDiagnostics(mx);
  const now = Date.now();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const pendingSyncRequest = diagnostics.lastSyncRequestAt > diagnostics.lastSyncResponseAt;
  const recentSyncNetworkError =
    diagnostics.lastSyncNetworkErrorAt > 0 &&
    now - diagnostics.lastSyncNetworkErrorAt <= RECENT_SYNC_NETWORK_ERROR_WINDOW_MS;
  const syncRequestStartedAfterNetworkError =
    diagnostics.lastSyncRequestAt > diagnostics.lastSyncNetworkErrorAt;
  const staleSyncResponse =
    !pendingSyncRequest &&
    diagnostics.lastSyncResponseAt > 0 &&
    now - diagnostics.lastSyncResponseAt >= STALE_SYNC_RESPONSE_WINDOW_MS;
  const hungSyncRequest =
    pendingSyncRequest &&
    now - diagnostics.lastSyncRequestAt >= HUNG_SYNC_REQUEST_WINDOW_MS;
  const degradedTransport =
    recentSyncNetworkError &&
    (!syncRequestStartedAfterNetworkError || staleSyncResponse || hungSyncRequest);

  if (offline) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Critical' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">{'\u7f51\u7edc\u5df2\u65ad\u5f00\uff0c\u6b63\u5728\u7b49\u5f85\u6062\u590d...'}</Text>
        </Box>
        <Line variant="Critical" size="300" />
      </Box>
    );
  }

  if (degradedTransport) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Critical' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">{'\u7f51\u7edc\u5f02\u5e38\uff0c\u6b63\u5728\u91cd\u65b0\u8fde\u63a5...'}</Text>
        </Box>
        <Line variant="Critical" size="300" />
      </Box>
    );
  }

  if (stateData.current === SyncState.Reconnecting) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Warning' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">{'\u8fde\u63a5\u5df2\u65ad\u5f00\uff0c\u6b63\u5728\u91cd\u65b0\u8fde\u63a5...'}</Text>
        </Box>
        <Line variant="Warning" size="300" />
      </Box>
    );
  }

  if (staleSyncResponse || hungSyncRequest) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Warning' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">{'\u8fde\u63a5\u4e0d\u7a33\u5b9a\uff0c\u6b63\u5728\u5c1d\u8bd5\u6062\u590d...'}</Text>
        </Box>
        <Line variant="Warning" size="300" />
      </Box>
    );
  }

  if (stateData.current && SYNCING_BANNER_STATES.has(stateData.current)) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Success' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">{'\u6b63\u5728\u540c\u6b65\u6d88\u606f...'}</Text>
        </Box>
        <Line variant="Success" size="300" />
      </Box>
    );
  }

  if (stateData.current === SyncState.Error) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Critical' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">{'\u8fde\u63a5\u5931\u8d25\uff0c\u6b63\u5728\u91cd\u8bd5...'}</Text>
        </Box>
        <Line variant="Critical" size="300" />
      </Box>
    );
  }

  return null;
}
