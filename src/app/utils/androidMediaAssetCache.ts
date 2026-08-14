import { Capacitor, registerPlugin } from '@capacitor/core';
import { getFallbackSession } from '../state/sessions';
import { isAndroidApp } from './nativePlatform';

type AndroidMediaAsset = {
  filePath: string;
  mimeType?: string;
  size?: number;
};

type AndroidMediaCachePlugin = {
  prepare(options: {
    sourceUrl: string;
    accountKey: string;
    baseUrl?: string;
    accessToken?: string;
    mimeType?: string;
    forceRefresh?: boolean;
    cacheOnly?: boolean;
  }): Promise<AndroidMediaAsset>;
  resolveCachedBatch(options: {
    sourceUrlsJson: string;
    accountKey: string;
  }): Promise<{ assets?: Record<string, AndroidMediaAsset> }>;
};

const AndroidMediaCache = registerPlugin<AndroidMediaCachePlugin>('AndroidMediaCache');
const cachedAssetUrls = new Map<string, string>();
const pendingAssets = new Map<string, Promise<string | undefined>>();
const forcedRefreshAssets = new Set<string>();

export const toAndroidWebViewAssetUrl = (filePath: string): string => {
  const normalizedPath =
    filePath.startsWith('/') || /^(?:file|content):\/\//i.test(filePath)
      ? filePath
      : `file://${filePath}`;
  return Capacitor.convertFileSrc(normalizedPath);
};

const normalizeBaseUrl = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).origin.toLowerCase();
  } catch {
    return baseUrl.trim().toLowerCase();
  }
};

const normalizeSourceUrl = (sourceUrl: string): string => {
  try {
    const url = new URL(sourceUrl);
    // Matrix media has equivalent authenticated client-v1 and legacy v3/r0
    // routes. Android may receive either route after a WebView process restart;
    // use one native-file identity for both without changing Web/Desktop URLs.
    url.pathname = url.pathname
      .replace('/_matrix/client/v1/media/download/', '/_matrix/media/v3/download/')
      .replace('/_matrix/client/v1/media/thumbnail/', '/_matrix/media/v3/thumbnail/')
      .replace('/_matrix/media/r0/download/', '/_matrix/media/v3/download/')
      .replace('/_matrix/media/r0/thumbnail/', '/_matrix/media/v3/thumbnail/');
    url.searchParams.delete('access_token');
    url.searchParams.delete('allow_redirect');
    const isThumbnail = url.pathname.includes('/_matrix/media/v3/thumbnail/');
    const requestedWidth = Number.parseInt(url.searchParams.get('width') ?? '', 10) || 0;
    const requestedHeight = Number.parseInt(url.searchParams.get('height') ?? '', 10) || 0;
    const entries = Array.from(url.searchParams.entries())
      .filter(
        ([key]) =>
          !isThumbnail || !['width', 'height', 'method', 'animated'].includes(key.toLowerCase())
      )
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey)
      );
    url.search = '';
    entries.forEach(([key, value]) => url.searchParams.append(key, value));
    if (isThumbnail) {
      const requestedSize = Math.max(requestedWidth, requestedHeight);
      url.searchParams.set(
        'starfire_cache_size',
        requestedSize > 1024 ? 'large' : requestedSize > 128 ? 'preview' : 'small'
      );
    }
    return url.toString();
  } catch {
    return sourceUrl;
  }
};

/**
 * Populate the in-memory URL map from Android's private media directory in a
 * single bridge call. This is intentionally cache-only: a cold start must not
 * turn the cache index into a burst of network downloads before the shell is
 * interactive.
 */
export const hydrateAndroidMediaAssetUrls = async (sourceUrls: string[]): Promise<void> => {
  if (!isAndroidApp() || sourceUrls.length === 0) return;

  const identity = getAndroidMediaIdentity(sourceUrls[0]);
  const uniqueUrls = Array.from(new Set(sourceUrls)).slice(0, 768);
  try {
    const result = await AndroidMediaCache.resolveCachedBatch({
      accountKey: identity.accountKey,
      sourceUrlsJson: JSON.stringify(uniqueUrls),
    });
    Object.entries(result.assets ?? {}).forEach(([sourceUrl, asset]) => {
      if (!asset?.filePath) return;
      const sourceIdentity = getAndroidMediaIdentity(sourceUrl);
      cachedAssetUrls.set(sourceIdentity.cacheKey, toAndroidWebViewAssetUrl(asset.filePath));
    });
  } catch {
    // Individual media hooks retain their normal cache/network fallback.
  }
};

const getAndroidMediaIdentity = (sourceUrl: string) => {
  const session = getFallbackSession();
  const accountKey = session
    ? `${normalizeBaseUrl(session.baseUrl)}::${session.userId.trim().toLowerCase()}`
    : 'guest';
  const cacheKey = `${accountKey}::${normalizeSourceUrl(sourceUrl)}`;

  return {
    accountKey,
    cacheKey,
    baseUrl: session?.baseUrl,
    accessToken: session?.accessToken,
  };
};

export const prepareAndroidMediaAssetUrl = (
  sourceUrl?: string,
  mimeType?: string,
  forceRefresh = false,
  cacheOnly = false
): Promise<string | undefined> | undefined => {
  if (!sourceUrl || !isAndroidApp()) return undefined;

  const identity = getAndroidMediaIdentity(sourceUrl);
  const shouldForceRefresh = forceRefresh || forcedRefreshAssets.delete(identity.cacheKey);
  if (shouldForceRefresh) cachedAssetUrls.delete(identity.cacheKey);

  const cachedUrl = cachedAssetUrls.get(identity.cacheKey);
  if (cachedUrl) return Promise.resolve(cachedUrl);

  const pendingKey = cacheOnly ? `${identity.cacheKey}::cache-only` : identity.cacheKey;
  const pending = pendingAssets.get(pendingKey);
  if (pending) return pending;

  const promise = AndroidMediaCache.prepare({
    sourceUrl,
    accountKey: identity.accountKey,
    baseUrl: identity.baseUrl,
    accessToken: identity.accessToken,
    mimeType,
    forceRefresh: shouldForceRefresh,
    cacheOnly,
  })
    .then((asset) => {
      if (!asset.filePath) return undefined;
      const assetUrl = toAndroidWebViewAssetUrl(asset.filePath);
      cachedAssetUrls.set(identity.cacheKey, assetUrl);
      return assetUrl;
    })
    .catch(() => undefined)
    .finally(() => {
      pendingAssets.delete(pendingKey);
    });

  pendingAssets.set(pendingKey, promise);
  return promise;
};

export const invalidateAndroidMediaAssetUrl = (sourceUrl?: string): void => {
  if (!sourceUrl || !isAndroidApp()) return;
  const { cacheKey } = getAndroidMediaIdentity(sourceUrl);
  cachedAssetUrls.delete(cacheKey);
  forcedRefreshAssets.add(cacheKey);
};
