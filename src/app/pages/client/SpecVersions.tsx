import React, { ReactNode, useCallback, useEffect, useMemo } from 'react';
import { SpecVersionsProvider } from '../../hooks/useSpecVersions';
import { AsyncStatus, useAsyncCallbackValue } from '../../hooks/useAsyncCallback';
import { specVersions, SpecVersions as SpecVersionsData } from '../../cs-api';

const SPEC_VERSIONS_CACHE_PREFIX = 'cinny_spec_versions:';

const getSpecVersionsCacheKey = (baseUrl: string): string =>
  `${SPEC_VERSIONS_CACHE_PREFIX}${baseUrl}`;

const readCachedSpecVersions = (baseUrl: string): SpecVersionsData | undefined => {
  if (typeof window === 'undefined') return undefined;

  try {
    const cached = window.localStorage.getItem(getSpecVersionsCacheKey(baseUrl));
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
    window.localStorage.setItem(getSpecVersionsCacheKey(baseUrl), JSON.stringify(versions));
  } catch {
    // Ignore storage failures and continue with in-memory data.
  }
};

export function SpecVersions({ baseUrl, children }: { baseUrl: string; children: ReactNode }) {
  const cachedVersions = useMemo(() => readCachedSpecVersions(baseUrl), [baseUrl]);
  const [state] = useAsyncCallbackValue(useCallback(() => specVersions(fetch, baseUrl), [baseUrl]));

  useEffect(() => {
    if (state.status === AsyncStatus.Success) {
      writeCachedSpecVersions(baseUrl, state.data);
    }
  }, [baseUrl, state]);

  const versions =
    state.status === AsyncStatus.Success ? state.data : cachedVersions ?? { versions: [] };

  // Server version discovery only controls optional feature switches. It must
  // not serialize Matrix/crypto startup or replace the app with another full
  // screen loading state. Render with the last known value (or the conservative
  // empty fallback) and refresh it in the background.
  return <SpecVersionsProvider value={versions}>{children}</SpecVersionsProvider>;
}
