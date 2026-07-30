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
  }): Promise<AndroidMediaAsset>;
};

const AndroidMediaCache = registerPlugin<AndroidMediaCachePlugin>('AndroidMediaCache');
const cachedAssetUrls = new Map<string, string>();
const pendingAssets = new Map<string, Promise<string | undefined>>();
const forcedRefreshAssets = new Set<string>();

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
    url.searchParams.delete('access_token');
    url.searchParams.delete('allow_redirect');
    const entries = Array.from(url.searchParams.entries()).sort(
      ([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey)
    );
    url.search = '';
    entries.forEach(([key, value]) => url.searchParams.append(key, value));
    return url.toString();
  } catch {
    return sourceUrl;
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
  forceRefresh = false
): Promise<string | undefined> | undefined => {
  if (!sourceUrl || !isAndroidApp()) return undefined;

  const identity = getAndroidMediaIdentity(sourceUrl);
  const shouldForceRefresh = forceRefresh || forcedRefreshAssets.delete(identity.cacheKey);
  if (shouldForceRefresh) cachedAssetUrls.delete(identity.cacheKey);

  const cachedUrl = cachedAssetUrls.get(identity.cacheKey);
  if (cachedUrl) return Promise.resolve(cachedUrl);

  const pending = pendingAssets.get(identity.cacheKey);
  if (pending) return pending;

  const promise = AndroidMediaCache.prepare({
    sourceUrl,
    accountKey: identity.accountKey,
    baseUrl: identity.baseUrl,
    accessToken: identity.accessToken,
    mimeType,
    forceRefresh: shouldForceRefresh,
  })
    .then((asset) => {
      if (!asset.filePath) return undefined;
      const assetUrl = Capacitor.convertFileSrc(asset.filePath);
      cachedAssetUrls.set(identity.cacheKey, assetUrl);
      return assetUrl;
    })
    .catch(() => undefined)
    .finally(() => {
      pendingAssets.delete(identity.cacheKey);
    });

  pendingAssets.set(identity.cacheKey, promise);
  return promise;
};

export const invalidateAndroidMediaAssetUrl = (sourceUrl?: string): void => {
  if (!sourceUrl || !isAndroidApp()) return;
  const { cacheKey } = getAndroidMediaIdentity(sourceUrl);
  cachedAssetUrls.delete(cacheKey);
  forcedRefreshAssets.add(cacheKey);
};
