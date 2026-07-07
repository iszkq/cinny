import { MatrixClient, SyncState } from 'matrix-js-sdk';
import React, { useCallback, useEffect, useState } from 'react';
import { Box, config, Line, Text } from 'folds';
import { useSyncState } from '../../hooks/useSyncState';
import { ContainerColor } from '../../styles/ContainerColor.css';

type StateData = {
  current: SyncState | null;
  previous: SyncState | null | undefined;
  error?: unknown;
};

type SyncStatusProps = {
  mx: MatrixClient;
};

const CONNECTION_ISSUE_VISIBLE_DELAY_MS = 20000;

const isConnectionIssueState = (state: SyncState | null): boolean =>
  state === SyncState.Reconnecting || state === SyncState.Error;

const isHealthySyncState = (state: SyncState | null): boolean =>
  state === SyncState.Prepared || state === SyncState.Syncing || state === SyncState.Catchup;

const getSyncError = (data: unknown): unknown =>
  typeof data === 'object' && data !== null && 'error' in data
    ? (data as { error?: unknown }).error
    : undefined;

const isAbortError = (error: unknown): boolean => {
  const abortError = error as { name?: unknown; message?: unknown };
  const name = typeof abortError?.name === 'string' ? abortError.name : '';
  const message = typeof abortError?.message === 'string' ? abortError.message : '';
  return name === 'AbortError' || /aborted|abort/i.test(message);
};

const isVisibleConnectionIssue = (data: StateData): boolean =>
  isConnectionIssueState(data.current) && !isAbortError(data.error);

export function SyncStatus({ mx }: SyncStatusProps) {
  const [stateData, setStateData] = useState<StateData>({
    current: null,
    previous: undefined,
  });
  const [visibleStateData, setVisibleStateData] = useState<StateData>(stateData);
  const [syncEstablished, setSyncEstablished] = useState(false);
  const [connectionIssueSince, setConnectionIssueSince] = useState<number | null>(null);

  useSyncState(
    mx,
    useCallback((current, previous, data) => {
      if (isHealthySyncState(current)) {
        setSyncEstablished(true);
      }

      const error = getSyncError(data);
      setStateData((s) => {
        if (s.current === current && s.previous === previous && s.error === error) {
          return s;
        }
        return { current, previous, error };
      });
    }, [])
  );

  useEffect(() => {
    if (isVisibleConnectionIssue(stateData)) {
      setConnectionIssueSince((prev) => prev ?? Date.now());
      return undefined;
    }

    setConnectionIssueSince(null);
    return undefined;
  }, [stateData]);

  useEffect(() => {
    if (isVisibleConnectionIssue(stateData)) {
      const issueSince = connectionIssueSince ?? Date.now();
      const visibleInMs = Math.max(
        0,
        issueSince + CONNECTION_ISSUE_VISIBLE_DELAY_MS - Date.now()
      );
      const reconnectingTimer = window.setTimeout(() => {
        setVisibleStateData(stateData);
      }, visibleInMs);

      return () => {
        window.clearTimeout(reconnectingTimer);
      };
    }

    setVisibleStateData(stateData);
    return undefined;
  }, [connectionIssueSince, stateData]);

  if (
    !syncEstablished &&
    isVisibleConnectionIssue(visibleStateData)
  ) {
    return null;
  }

  if (
    visibleStateData.current === SyncState.Reconnecting &&
    !isAbortError(visibleStateData.error)
  ) {
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

  if (
    visibleStateData.current === SyncState.Error &&
    !isAbortError(visibleStateData.error)
  ) {
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
