import { useCallback, useEffect, useState } from 'react';
import { IImageInfo } from '../../../types/matrix/common';
import { ImageUsage, PackImage, PackImageReader } from '../../plugins/custom-emoji';
import { isDesktopUpdaterSupported } from '../../utils/desktopUpdater';
import { fetchMediaWithAuth, isHttpUrl, isMxcUrl } from '../../utils/matrix';

export const REMOTE_STICKER_INDEX_URL = 'https://image.527012.xyz/index.json';

export const REMOTE_STICKER_KEYWORDS = 'in.cinny.remote_sticker_keywords';
export const REMOTE_STICKER_PACK_ID = 'in.cinny.remote_sticker_pack_id';
export const REMOTE_STICKER_PACK_NAME = 'in.cinny.remote_sticker_pack_name';
export const REMOTE_STICKER_PREVIEW_URL = 'in.cinny.remote_sticker_preview_url';
export const REMOTE_STICKER_THUMB_URL = 'in.cinny.remote_sticker_thumb_url';

type RemoteStickerIndexItem = {
  id?: string;
  packId?: string;
  packName?: string;
  name?: string;
  fileName?: string;
  keywords?: string[];
  url?: string;
  httpUrl?: string;
  sourceUrl?: string;
  previewUrl?: string;
  thumbUrl?: string;
  thumbnailUrl?: string;
  mxc?: string;
  mxcUrl?: string;
  matrixUrl?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
};

type RemoteStickerIndexPack = {
  id?: string;
  name?: string;
  folder?: string;
};

type RemoteStickerIndex = {
  packs?: RemoteStickerIndexPack[];
  items?: RemoteStickerIndexItem[];
};

type RemoteStickerPackImage = PackImage & {
  [REMOTE_STICKER_KEYWORDS]?: string[];
  [REMOTE_STICKER_PACK_ID]?: string;
  [REMOTE_STICKER_PACK_NAME]?: string;
  [REMOTE_STICKER_PREVIEW_URL]?: string;
  [REMOTE_STICKER_THUMB_URL]?: string;
};

export type RemoteStickerIndexState = {
  stickers: PackImageReader[];
  loading: boolean;
  error?: string;
  retry: () => void;
};

let cachedRemoteStickers: PackImageReader[] | undefined;
let cachedRemoteStickerIndex: RemoteStickerIndex | undefined;
let cachedRemoteStickerEtag: string | undefined;
let pendingRemoteStickers: Promise<PackImageReader[]> | undefined;
const REMOTE_STICKER_INDEX_CACHE_KEY = 'cinny.remoteStickerIndex.v1';

type RemoteStickerIndexCache = {
  cachedAt: number;
  index: RemoteStickerIndex;
  etag?: string;
};

type RemoteStickerIndexResponse = {
  index?: RemoteStickerIndex;
  etag?: string;
  notModified: boolean;
};

const fetchRemoteStickerIndexWithBrowser = async (
  etag?: string
): Promise<RemoteStickerIndexResponse> => {
  const headers = new Headers();
  if (etag) headers.set('If-None-Match', etag);

  const response = await fetchMediaWithAuth(REMOTE_STICKER_INDEX_URL, {
    cache: 'no-store',
    headers,
  });
  if (response.status === 304) {
    return { etag: response.headers.get('ETag') ?? etag, notModified: true };
  }
  if (!response.ok) {
    throw new Error(`Failed to load remote sticker index: ${response.status}`);
  }
  return {
    index: (await response.json()) as RemoteStickerIndex,
    etag: response.headers.get('ETag') ?? undefined,
    notModified: false,
  };
};

const fetchRemoteStickerIndexWithDesktop = async (
  etag?: string
): Promise<RemoteStickerIndexResponse> => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<RemoteStickerIndexResponse>('fetch_remote_sticker_index', {
    url: REMOTE_STICKER_INDEX_URL,
    etag,
  });
};

const fetchRemoteStickerIndex = async (etag?: string): Promise<RemoteStickerIndexResponse> => {
  const desktopSupported = isDesktopUpdaterSupported();
  let desktopError: unknown;

  if (desktopSupported) {
    try {
      return await fetchRemoteStickerIndexWithDesktop(etag);
    } catch (error) {
      desktopError = error;
      console.warn(error);
    }
  }

  try {
    return await fetchRemoteStickerIndexWithBrowser(etag);
  } catch (browserError) {
    if (desktopError) {
      console.warn(browserError);
      throw desktopError;
    }
    throw browserError;
  }
};

const getCachedRemoteStickerIndex = (): RemoteStickerIndexCache | undefined => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return undefined;
  }

  try {
    const rawCache = window.localStorage.getItem(REMOTE_STICKER_INDEX_CACHE_KEY);
    if (!rawCache) return undefined;

    const cache = JSON.parse(rawCache) as RemoteStickerIndexCache;
    if (!cache?.index || typeof cache.cachedAt !== 'number') {
      return undefined;
    }

    return cache;
  } catch {
    return undefined;
  }
};

const setCachedRemoteStickerIndex = (index: RemoteStickerIndex, etag?: string): void => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    const cache: RemoteStickerIndexCache = {
      cachedAt: Date.now(),
      index,
      etag,
    };
    window.localStorage.setItem(REMOTE_STICKER_INDEX_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage quota errors should not block stickers.
  }
};

const clearCachedRemoteStickerIndex = (): void => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(REMOTE_STICKER_INDEX_CACHE_KEY);
  } catch {
    // Ignore storage failures; in-memory cache has already been cleared.
  }
};

const getRemoteStickerErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return '云端表情包加载失败';
};

const getDisplayName = (item: RemoteStickerIndexItem): string | undefined => {
  const name = item.name?.trim();
  if (name) return name;

  const fileName = item.fileName?.trim();
  if (!fileName) return undefined;

  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]\d+$/, '');
};

const getFirstValidUrl = (
  values: Array<string | undefined>,
  validator: (url: string | undefined | null) => url is string
): string | undefined => values.map((value) => value?.trim()).find(validator);

const REMOTE_STICKER_INDEX_ORIGIN = new URL(REMOTE_STICKER_INDEX_URL).origin;

const isCorsSafeStickerMediaUrl = (url: string): boolean => {
  try {
    // HTTP-only items have to be downloaded by the browser before they can be uploaded as MXC.
    // Only the controlled index origin is known to allow that. Third-party images may render in
    // <img>, but including them would fail later when fetch() is blocked by CORS.
    return new URL(url).origin === REMOTE_STICKER_INDEX_ORIGIN;
  } catch {
    return false;
  }
};

const isCorsSafeHttpStickerMediaUrl = (url: string | undefined | null): url is string =>
  isHttpUrl(url) && isCorsSafeStickerMediaUrl(url);

const toRemoteSticker = (
  item: RemoteStickerIndexItem,
  packsById: Map<string, RemoteStickerIndexPack>
): PackImageReader | undefined => {
  const displayName = getDisplayName(item);
  const mxcUrl = getFirstValidUrl([item.mxc, item.mxcUrl, item.matrixUrl, item.url], isMxcUrl);
  const previewUrl = getFirstValidUrl(
    [item.previewUrl, item.httpUrl, item.sourceUrl, item.url, item.thumbUrl, item.thumbnailUrl],
    isHttpUrl
  );
  const uploadableHttpUrl = getFirstValidUrl(
    // Sending must prefer the original source. previewUrl/thumbUrl are often deliberately static
    // thumbnails; choosing them first made only some cloud GIF/WebP emoji lose animation.
    [item.httpUrl, item.sourceUrl, item.url, item.previewUrl, item.thumbUrl, item.thumbnailUrl],
    isCorsSafeHttpStickerMediaUrl
  );
  // Keep Matrix-native entries regardless of their preview host. For HTTP-only entries, exclude
  // third-party origins up front so clicking an apparently valid image cannot produce a CORS
  // failure. The index preparation script can preserve those entries by uploading them to Matrix
  // and adding an mxc/mxcUrl/matrixUrl field.
  const sendUrl = mxcUrl ?? uploadableHttpUrl;

  if (!sendUrl || !displayName) {
    return undefined;
  }

  const packId = item.packId || 'remote';
  const packName = item.packName || packsById.get(packId)?.name || packId;
  const shortcode = displayName;
  const thumbUrl = getFirstValidUrl([item.thumbUrl, item.thumbnailUrl], isHttpUrl);
  const info: IImageInfo = {
    mimetype: item.mimeType || 'image/gif',
    size: item.size,
    w: item.width,
    h: item.height,
  };
  const image: RemoteStickerPackImage = {
    url: sendUrl,
    body: displayName,
    usage: [ImageUsage.Emoticon, ImageUsage.Sticker],
    info,
    ...(previewUrl && previewUrl !== sendUrl ? { [REMOTE_STICKER_PREVIEW_URL]: previewUrl } : {}),
    ...(thumbUrl ? { [REMOTE_STICKER_THUMB_URL]: thumbUrl } : {}),
    [REMOTE_STICKER_KEYWORDS]: Array.from(
      new Set(
        [displayName, item.fileName?.replace(/\.[^.]+$/, ''), ...(item.keywords ?? [])].filter(
          Boolean
        )
      )
    ) as string[],
    [REMOTE_STICKER_PACK_ID]: packId,
    [REMOTE_STICKER_PACK_NAME]: packName,
  };

  return PackImageReader.fromPackImage(shortcode, image);
};

const parseRemoteStickerIndex = (index: RemoteStickerIndex): PackImageReader[] => {
  const items = Array.isArray(index.items) ? index.items : [];
  const packsById = new Map(
    (Array.isArray(index.packs) ? index.packs : [])
      .filter((pack): pack is RemoteStickerIndexPack & { id: string } => !!pack.id)
      .map((pack) => [pack.id, pack])
  );

  return items
    .map((item) => toRemoteSticker(item, packsById))
    .filter((item): item is PackImageReader => item !== undefined);
};

const loadCachedRemoteStickers = (): PackImageReader[] | undefined => {
  if (cachedRemoteStickers) {
    return cachedRemoteStickers;
  }

  const cachedIndex = getCachedRemoteStickerIndex();
  if (cachedIndex) {
    cachedRemoteStickerIndex = cachedIndex.index;
    cachedRemoteStickerEtag = cachedIndex.etag;
    cachedRemoteStickers = parseRemoteStickerIndex(cachedIndex.index);
    return cachedRemoteStickers;
  }

  return undefined;
};

const refreshRemoteStickers = async (): Promise<PackImageReader[]> => {
  if (pendingRemoteStickers) {
    return pendingRemoteStickers;
  }

  pendingRemoteStickers = fetchRemoteStickerIndex(cachedRemoteStickerEtag)
    .then((response) => {
      if (response.notModified && cachedRemoteStickerIndex) {
        cachedRemoteStickerEtag = response.etag ?? cachedRemoteStickerEtag;
        setCachedRemoteStickerIndex(cachedRemoteStickerIndex, cachedRemoteStickerEtag);
        return cachedRemoteStickers ?? parseRemoteStickerIndex(cachedRemoteStickerIndex);
      }
      if (!response.index) {
        throw new Error('Remote sticker index response did not include an index.');
      }

      cachedRemoteStickerIndex = response.index;
      cachedRemoteStickerEtag = response.etag;
      setCachedRemoteStickerIndex(response.index, response.etag);
      cachedRemoteStickers = parseRemoteStickerIndex(response.index);
      return cachedRemoteStickers;
    })
    .finally(() => {
      pendingRemoteStickers = undefined;
    });

  return pendingRemoteStickers;
};

const clearRemoteStickerCache = (): void => {
  cachedRemoteStickers = undefined;
  cachedRemoteStickerIndex = undefined;
  cachedRemoteStickerEtag = undefined;
  pendingRemoteStickers = undefined;
  clearCachedRemoteStickerIndex();
};

export const getRemoteStickerPackId = (image: PackImageReader): string | undefined => {
  const content = image.content as RemoteStickerPackImage;
  return content[REMOTE_STICKER_PACK_ID];
};

export const getRemoteStickerPackName = (image: PackImageReader): string | undefined => {
  const content = image.content as RemoteStickerPackImage;
  return content[REMOTE_STICKER_PACK_NAME];
};

export const getRemoteStickerKeywords = (image: PackImageReader): string[] | undefined => {
  const content = image.content as RemoteStickerPackImage;
  return content[REMOTE_STICKER_KEYWORDS];
};

export const getRemoteStickerPreviewUrl = (image: PackImageReader): string | undefined => {
  const content = image.content as RemoteStickerPackImage;
  return content[REMOTE_STICKER_PREVIEW_URL] ?? content[REMOTE_STICKER_THUMB_URL];
};

export const useRemoteStickerIndex = (enabled: boolean): RemoteStickerIndexState => {
  const [stickers, setStickers] = useState<PackImageReader[]>(
    () => loadCachedRemoteStickers() ?? []
  );
  const [loading, setLoading] = useState(() => enabled && !loadCachedRemoteStickers());
  const [error, setError] = useState<string>();
  const [reloadId, setReloadId] = useState(0);

  const retry = useCallback(() => {
    clearRemoteStickerCache();
    setError(undefined);
    setLoading(true);
    setReloadId((id) => id + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(undefined);
      return undefined;
    }

    let disposed = false;
    const staleStickers = loadCachedRemoteStickers();
    if (staleStickers) {
      setStickers(staleStickers);
    }
    setLoading(!staleStickers);
    setError(undefined);

    refreshRemoteStickers()
      .then((items) => {
        if (!disposed) {
          setStickers(items);
          setError(undefined);
        }
      })
      .catch((loadError) => {
        if (!disposed) {
          console.warn(loadError);
          if (!staleStickers) {
            setStickers([]);
            setError(getRemoteStickerErrorMessage(loadError));
          }
        }
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [enabled, reloadId]);

  return { stickers, loading, error, retry };
};
