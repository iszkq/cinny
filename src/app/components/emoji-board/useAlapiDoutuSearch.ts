import { useEffect, useMemo, useState } from 'react';
import { ImageUsage, PackImage, PackImageReader } from '../../plugins/custom-emoji';
import { useClientConfig } from '../../hooks/useClientConfig';
import { isHttpUrl } from '../../utils/matrix';

export const ALAPI_DOUTU_KEYWORDS = 'in.cinny.alapi_doutu_keywords';
export const ALAPI_DOUTU_SOURCE = 'in.cinny.alapi_doutu_source';

const DEFAULT_ENDPOINT = 'https://v3.alapi.cn/api/doutu';
const SEARCH_DEBOUNCE_MS = 300;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_LIMIT = 50;

type AlapiDoutuResponse = {
  success?: boolean;
  code?: number;
  message?: string;
  data?: unknown;
};

type AlapiDoutuPackImage = PackImage & {
  [ALAPI_DOUTU_KEYWORDS]: string[];
  [ALAPI_DOUTU_SOURCE]: true;
};

type CacheEntry = {
  cachedAt: number;
  items: PackImageReader[];
};

export type AlapiDoutuSearchState = {
  query: string;
  items: PackImageReader[];
  loading: boolean;
  error?: string;
  configured: boolean;
};

const searchCache = new Map<string, CacheEntry>();

function collectUrls(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (!trimmedValue) return [];

    if (
      (trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) ||
      (trimmedValue.startsWith('{') && trimmedValue.endsWith('}'))
    ) {
      try {
        return collectUrls(JSON.parse(trimmedValue));
      } catch {
        // Some API responses use a plain, delimited string instead of JSON.
      }
    }

    return (
      trimmedValue
        .match(/https?:\/\/[^\s,;|'"<>\\]+/gu)
        ?.map((url) => url.replace(/[)\]}]+$/u, ''))
        .filter(isHttpUrl) ?? []
    );
  }
  if (Array.isArray(value)) return value.flatMap(collectUrls);
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  const preferredKeys = ['url', 'image', 'imageUrl', 'image_url', 'src', 'data', 'list', 'items'];
  const preferredValues = preferredKeys
    .filter((key) => key in record)
    .flatMap((key) => collectUrls(record[key]));

  if (preferredValues.length > 0) return preferredValues;
  return Object.values(record).flatMap(collectUrls);
}

const sanitizeShortcode = (query: string): string => {
  const shortcode = query
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, '_')
    .replace(/:/gu, '')
    .split('')
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
    .slice(0, 40);

  return shortcode || 'doutu';
};

const getWebSafeImageUrl = (url: string): string =>
  url.toLowerCase().startsWith('http://') ? `https://${url.slice('http://'.length)}` : url;

const toPackImages = (query: string, data: unknown, maxResults: number): PackImageReader[] => {
  const shortcode = sanitizeShortcode(query);
  const urls = Array.from(new Set(collectUrls(data))).slice(0, maxResults);

  return urls
    .map((sourceUrl, index) => {
      // An HTTPS Cinny deployment cannot fetch HTTP media for Matrix upload.
      // The image hosts returned by ALAPI generally expose the same asset over HTTPS.
      const url = getWebSafeImageUrl(sourceUrl);
      const label = `${query.trim()} ${index + 1}`;
      const image: AlapiDoutuPackImage = {
        url,
        body: label,
        usage: [ImageUsage.Emoticon, ImageUsage.Sticker],
        [ALAPI_DOUTU_KEYWORDS]: [query.trim(), label],
        [ALAPI_DOUTU_SOURCE]: true,
      };
      return PackImageReader.fromPackImage(`${shortcode}_${index + 1}`, image);
    })
    .filter((image): image is PackImageReader => image !== undefined);
};

const getErrorMessage = (response: AlapiDoutuResponse): string => {
  if (response.message?.trim()) return response.message;
  return `ALAPI 表情搜索失败${response.code ? ` (${response.code})` : ''}`;
};

const searchAlapiDoutu = async (
  endpoint: string,
  token: string,
  query: string,
  maxResults: number,
  signal: AbortSignal
): Promise<PackImageReader[]> => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Token: token,
    },
    body: JSON.stringify({ keyword: query, page: '1' }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`ALAPI 表情搜索失败 (${response.status})`);
  }

  const payload = (await response.json()) as AlapiDoutuResponse;
  if (payload.success === false || (typeof payload.code === 'number' && payload.code !== 200)) {
    throw new Error(getErrorMessage(payload));
  }

  return toPackImages(query, payload.data, maxResults);
};

const getCachedItems = (cacheKey: string): PackImageReader[] | undefined => {
  const entry = searchCache.get(cacheKey);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    searchCache.delete(cacheKey);
    return undefined;
  }
  return entry.items;
};

const setCachedItems = (cacheKey: string, items: PackImageReader[]): void => {
  if (searchCache.size >= CACHE_LIMIT) {
    const oldestKey = searchCache.keys().next().value as string | undefined;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(cacheKey, { cachedAt: Date.now(), items });
};

export const isAlapiDoutuImage = (image: PackImageReader): boolean => {
  const content = image.content as AlapiDoutuPackImage;
  return content[ALAPI_DOUTU_SOURCE] === true;
};

export const getAlapiDoutuKeywords = (image: PackImageReader): string[] | undefined => {
  const content = image.content as AlapiDoutuPackImage;
  return content[ALAPI_DOUTU_KEYWORDS];
};

export const useAlapiDoutuSearch = (rawQuery: string, enabled = true): AlapiDoutuSearchState => {
  const { alapiDoutu } = useClientConfig();
  const query = rawQuery.trim();
  const endpoint = alapiDoutu?.endpoint?.trim() || DEFAULT_ENDPOINT;
  const token = alapiDoutu?.token?.trim() || '';
  const configured = alapiDoutu?.enabled !== false && Boolean(token);
  const maxResults = Math.min(Math.max(alapiDoutu?.maxResults ?? 60, 1), 100);
  const cacheKey = useMemo(() => `${endpoint}\u0000${query}`, [endpoint, query]);
  const cachedItems = enabled && configured && query ? getCachedItems(cacheKey) : undefined;
  const [state, setState] = useState<Omit<AlapiDoutuSearchState, 'configured'>>({
    query: '',
    items: [],
    loading: false,
  });

  useEffect(() => {
    if (!enabled || !configured || !query) {
      setState({ query, items: [], loading: false });
      return undefined;
    }

    const cached = getCachedItems(cacheKey);
    if (cached) {
      setState({ query, items: cached, loading: false });
      return undefined;
    }

    const abortController = new AbortController();
    setState({ query, items: [], loading: true });
    const timerId = window.setTimeout(() => {
      searchAlapiDoutu(endpoint, token, query, maxResults, abortController.signal)
        .then((items) => {
          setCachedItems(cacheKey, items);
          setState({ query, items, loading: false });
        })
        .catch((error: unknown) => {
          if (abortController.signal.aborted) return;
          const message = error instanceof Error ? error.message : '第三方表情搜索失败';
          setState({ query, items: [], loading: false, error: message });
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timerId);
      abortController.abort();
    };
  }, [cacheKey, configured, enabled, endpoint, maxResults, query, token]);

  if (cachedItems) {
    return { query, items: cachedItems, loading: false, configured };
  }
  if (state.query !== query) {
    return { query, items: [], loading: enabled && configured && Boolean(query), configured };
  }
  return { ...state, configured };
};
