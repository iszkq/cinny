import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Dialog, config, Text, Button, Spinner } from 'folds';
import { SpecVersionsProvider } from '../../hooks/useSpecVersions';
import { SplashScreen } from '../../components/splash-screen';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { specVersions, SpecVersions as SpecVersionsData } from '../../cs-api';

const SPEC_VERSIONS_CACHE_PREFIX = 'cinny_spec_versions:';

const getSpecVersionsCacheKey = (baseUrl: string): string =>
  `${SPEC_VERSIONS_CACHE_PREFIX}${baseUrl}`;

const readCachedSpecVersions = (baseUrl: string): SpecVersionsData | undefined => {
  if (typeof window === 'undefined') return undefined;

  try {
    const cached = window.sessionStorage.getItem(getSpecVersionsCacheKey(baseUrl));
    if (!cached) return undefined;

    const parsed = JSON.parse(cached) as unknown;
    if (!parsed || typeof parsed !== 'object') return undefined;

    const { versions } = parsed as Partial<SpecVersionsData>;
    if (!Array.isArray(versions)) return undefined;

    return parsed as SpecVersionsData;
  } catch {
    return undefined;
  }
};

const writeCachedSpecVersions = (baseUrl: string, versions: SpecVersionsData): void => {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(getSpecVersionsCacheKey(baseUrl), JSON.stringify(versions));
  } catch {
    // Ignore storage failures and continue with in-memory data.
  }
};

export function SpecVersions({ baseUrl, children }: { baseUrl: string; children: ReactNode }) {
  const cachedVersions = useMemo(() => readCachedSpecVersions(baseUrl), [baseUrl]);
  const [ignoreError, setIgnoreError] = useState(false);
  const [state, load] = useAsyncCallback(
    useCallback(() => specVersions(fetch, baseUrl), [baseUrl])
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (state.status === AsyncStatus.Success) {
      writeCachedSpecVersions(baseUrl, state.data);
    }
  }, [baseUrl, state]);

  const versions =
    state.status === AsyncStatus.Success ? state.data : cachedVersions ?? { versions: [] };

  if (
    !cachedVersions &&
    (state.status === AsyncStatus.Idle || state.status === AsyncStatus.Loading)
  ) {
    return (
      <SplashScreen>
        <Box direction="Column" grow="Yes" alignItems="Center" justifyContent="Center" gap="400">
          <Spinner variant="Secondary" size="600" />
          <Text>Connecting to server</Text>
        </Box>
      </SplashScreen>
    );
  }

  if (!cachedVersions && !ignoreError && state.status === AsyncStatus.Error) {
    return (
      <SplashScreen>
        <Box direction="Column" grow="Yes" alignItems="Center" justifyContent="Center" gap="400">
          <Dialog>
            <Box direction="Column" gap="400" style={{ padding: config.space.S400 }}>
              <Text>
                Unable to connect to the homeserver. The homeserver or your internet connection may be down.
              </Text>
              <Button variant="Critical" onClick={load}>
                <Text as="span" size="B400">
                  Retry
                </Text>
              </Button>
              <Button variant="Critical" onClick={() => setIgnoreError(true)} fill="Soft">
                <Text as="span" size="B400">
                  Continue
                </Text>
              </Button>
            </Box>
          </Dialog>
        </Box>
      </SplashScreen>
    );
  }

  return (
    <SpecVersionsProvider value={versions}>{children}</SpecVersionsProvider>
  );
}
