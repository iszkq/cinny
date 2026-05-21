import { MatrixClient, SyncState } from 'matrix-js-sdk';
import React, { useCallback, useEffect, useState } from 'react';
import { Box, config, Line, Text } from 'folds';
import { useSyncState } from '../../hooks/useSyncState';
import { ContainerColor } from '../../styles/ContainerColor.css';

type StateData = {
  current: SyncState | null;
  previous: SyncState | null | undefined;
};

type SyncStatusProps = {
  mx: MatrixClient;
};

const RECONNECTING_VISIBLE_DELAY_MS = 3500;

export function SyncStatus({ mx }: SyncStatusProps) {
  const [stateData, setStateData] = useState<StateData>({
    current: null,
    previous: undefined,
  });
  const [visibleStateData, setVisibleStateData] = useState<StateData>(stateData);

  useSyncState(
    mx,
    useCallback((current, previous) => {
      setStateData((s) => {
        if (s.current === current && s.previous === previous) {
          return s;
        }
        return { current, previous };
      });
    }, [])
  );

  useEffect(() => {
    if (stateData.current === SyncState.Reconnecting || stateData.current === SyncState.Error) {
      const reconnectingTimer = window.setTimeout(() => {
        setVisibleStateData(stateData);
      }, RECONNECTING_VISIBLE_DELAY_MS);

      return () => {
        window.clearTimeout(reconnectingTimer);
      };
    }

    setVisibleStateData(stateData);
    return undefined;
  }, [stateData]);

  if (
    (visibleStateData.current === SyncState.Prepared ||
      visibleStateData.current === SyncState.Catchup) &&
    visibleStateData.previous !== SyncState.Syncing
  ) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Success' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">{'\u6b63\u5728\u8fde\u63a5...'}</Text>
        </Box>
        <Line variant="Success" size="300" />
      </Box>
    );
  }

  if (visibleStateData.current === SyncState.Reconnecting) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Warning' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">
            {'\u8fde\u63a5\u5df2\u65ad\u5f00\uff0c\u6b63\u5728\u91cd\u8fde...'}
          </Text>
        </Box>
        <Line variant="Warning" size="300" />
      </Box>
    );
  }

  if (visibleStateData.current === SyncState.Error) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Critical' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">{'\u8fde\u63a5\u5df2\u65ad\u5f00'}</Text>
        </Box>
        <Line variant="Critical" size="300" />
      </Box>
    );
  }

  return null;
}
