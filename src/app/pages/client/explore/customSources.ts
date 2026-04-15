import { MatrixClient } from 'matrix-js-sdk';
import {
  AccountDataEvent,
  CinnyExploreSource,
  CinnyExploreSourceKind,
  CinnyExploreSourcesContent,
  CinnyExploreWebEmbedStatus,
  CinnyExploreWebOpenMode,
} from '../../../../types/matrix/accountData';

const EXPLORE_SOURCES_VERSION = 1;

const hasProtocol = (value: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(value);

const toTimestamp = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const trimTitle = (value?: string): string | undefined => {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const createSourceId = (): string =>
  `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const isExploreWebOpenMode = (value: unknown): value is CinnyExploreWebOpenMode =>
  value === 'auto' || value === 'external';

const isExploreWebEmbedStatus = (value: unknown): value is CinnyExploreWebEmbedStatus =>
  value === 'unknown' || value === 'embeddable' || value === 'blocked';

export const normalizeExploreServerAddress = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('请输入服务器地址。');
  }

  const candidate = hasProtocol(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('服务器地址格式不正确。');
  }

  const host = url.host.trim().toLowerCase();
  if (!host) {
    throw new Error('服务器地址格式不正确。');
  }

  return host;
};

export const normalizeExploreWebUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('请输入网页地址。');
  }

  const candidate = hasProtocol(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('网页地址格式不正确。');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('仅支持 http 或 https 网页地址。');
  }

  return url.toString();
};

const getDefaultTitle = (kind: CinnyExploreSourceKind, value: string): string => {
  if (kind === 'server') {
    return value;
  }

  try {
    return new URL(value).hostname || value;
  } catch {
    return value;
  }
};

const isExploreSourceKind = (value: unknown): value is CinnyExploreSourceKind =>
  value === 'server' || value === 'web';

export const getExploreCustomSources = (
  content?: CinnyExploreSourcesContent
): CinnyExploreSource[] => {
  if (!Array.isArray(content?.sources)) {
    return [];
  }

  return content.sources.reduce<CinnyExploreSource[]>((sources, item) => {
    if (!item || typeof item !== 'object') return sources;
    if (typeof item.id !== 'string' || item.id.trim().length === 0) return sources;
    if (!isExploreSourceKind(item.kind)) return sources;
    if (typeof item.value !== 'string' || item.value.trim().length === 0) return sources;

    try {
      const normalizedValue =
        item.kind === 'server'
          ? normalizeExploreServerAddress(item.value)
          : normalizeExploreWebUrl(item.value);
      const fallbackTimestamp = Date.now();

      sources.push({
        id: item.id.trim(),
        kind: item.kind,
        value: normalizedValue,
        title: trimTitle(item.title) ?? getDefaultTitle(item.kind, normalizedValue),
        createdAt: toTimestamp(item.createdAt, fallbackTimestamp),
        updatedAt: toTimestamp(item.updatedAt, fallbackTimestamp),
        webOpenMode:
          item.kind === 'web' && isExploreWebOpenMode(item.webOpenMode)
            ? item.webOpenMode
            : item.kind === 'web'
              ? 'auto'
              : undefined,
        webEmbedStatus:
          item.kind === 'web' && isExploreWebEmbedStatus(item.webEmbedStatus)
            ? item.webEmbedStatus
            : item.kind === 'web'
              ? 'unknown'
              : undefined,
      });
    } catch {
      // Ignore malformed saved items.
    }

    return sources;
  }, []);
};

export const getExploreCustomSourceById = (
  content: CinnyExploreSourcesContent | undefined,
  sourceId?: string
): CinnyExploreSource | undefined => {
  if (!sourceId) return undefined;
  return getExploreCustomSources(content).find((source) => source.id === sourceId);
};

const writeExploreCustomSources = async (
  mx: MatrixClient,
  sources: CinnyExploreSource[]
): Promise<void> => {
  const content: CinnyExploreSourcesContent = {
    version: EXPLORE_SOURCES_VERSION,
    updatedAt: Date.now(),
    sources,
  };

  await mx.setAccountData(AccountDataEvent.CinnyExploreSources, content);
};

export const upsertExploreCustomSource = async (
  mx: MatrixClient,
  source: {
    kind: CinnyExploreSourceKind;
    title?: string;
    value: string;
  }
): Promise<CinnyExploreSource> => {
  const kind = source.kind;
  const normalizedValue =
    kind === 'server'
      ? normalizeExploreServerAddress(source.value)
      : normalizeExploreWebUrl(source.value);
  const normalizedTitle = trimTitle(source.title) ?? getDefaultTitle(kind, normalizedValue);

  const currentSources = getExploreCustomSources(
    mx.getAccountData(AccountDataEvent.CinnyExploreSources)?.getContent<CinnyExploreSourcesContent>()
  );
  const now = Date.now();

  const existing = currentSources.find(
    (item) => item.kind === kind && item.value === normalizedValue
  );
  if (existing) {
    const updatedSource: CinnyExploreSource = {
      ...existing,
      title: normalizedTitle,
      updatedAt: now,
    };

    await writeExploreCustomSources(
      mx,
      currentSources.map((item) => (item.id === existing.id ? updatedSource : item))
    );
    return updatedSource;
  }

  const createdSource: CinnyExploreSource = {
    id: createSourceId(),
    kind,
    title: normalizedTitle,
    value: normalizedValue,
    createdAt: now,
    updatedAt: now,
    webOpenMode: kind === 'web' ? 'auto' : undefined,
    webEmbedStatus: kind === 'web' ? 'unknown' : undefined,
  };

  await writeExploreCustomSources(mx, [...currentSources, createdSource]);
  return createdSource;
};

export const setExploreWebSourcePolicy = async (
  mx: MatrixClient,
  sourceId: string,
  policy: {
    webOpenMode?: CinnyExploreWebOpenMode;
    webEmbedStatus?: CinnyExploreWebEmbedStatus;
  }
): Promise<CinnyExploreSource | undefined> => {
  const currentSources = getExploreCustomSources(
    mx.getAccountData(AccountDataEvent.CinnyExploreSources)?.getContent<CinnyExploreSourcesContent>()
  );
  const existing = currentSources.find((item) => item.id === sourceId && item.kind === 'web');
  if (!existing) {
    return undefined;
  }

  const updatedSource: CinnyExploreSource = {
    ...existing,
    webOpenMode: policy.webOpenMode ?? existing.webOpenMode ?? 'auto',
    webEmbedStatus: policy.webEmbedStatus ?? existing.webEmbedStatus ?? 'unknown',
    updatedAt: Date.now(),
  };

  await writeExploreCustomSources(
    mx,
    currentSources.map((item) => (item.id === existing.id ? updatedSource : item))
  );

  return updatedSource;
};

export const removeExploreCustomSource = async (
  mx: MatrixClient,
  sourceId: string
): Promise<void> => {
  const currentSources = getExploreCustomSources(
    mx.getAccountData(AccountDataEvent.CinnyExploreSources)?.getContent<CinnyExploreSourcesContent>()
  );
  const nextSources = currentSources.filter((item) => item.id !== sourceId);

  if (nextSources.length === currentSources.length) {
    return;
  }

  await writeExploreCustomSources(mx, nextSources);
};
