import { MatrixClient } from 'matrix-js-sdk';
import {
  AccountDataEvent,
  CinnyExploreNavCard,
  CinnyExploreNavSection,
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

const trimOptionalText = (value?: string): string | undefined => {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeOptionalText = (value?: string): string => trimOptionalText(value) ?? '';

const createId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

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

  if (kind === 'nav') {
    return '未命名导航站';
  }

  try {
    return new URL(value).hostname || value;
  } catch {
    return value;
  }
};

const isExploreSourceKind = (value: unknown): value is CinnyExploreSourceKind =>
  value === 'server' || value === 'web' || value === 'nav';

const normalizeTags = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tags = value
    .map((item) => trimOptionalText(typeof item === 'string' ? item : undefined))
    .filter((item): item is string => !!item);

  return tags.length > 0 ? Array.from(new Set(tags)) : undefined;
};

const normalizeNavCard = (value: unknown): CinnyExploreNavCard | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || item.id.trim().length === 0) return undefined;
  if (typeof item.title !== 'string' || item.title.trim().length === 0) return undefined;
  if (typeof item.url !== 'string' || item.url.trim().length === 0) return undefined;

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeExploreWebUrl(item.url);
  } catch {
    return undefined;
  }

  let normalizedIconUrl: string | undefined;
  try {
    normalizedIconUrl = trimOptionalText(typeof item.iconUrl === 'string' ? item.iconUrl : undefined)
      ? normalizeExploreWebUrl(item.iconUrl as string)
      : undefined;
  } catch {
    normalizedIconUrl = undefined;
  }

  return {
    id: item.id.trim(),
    title: item.title.trim(),
    url: normalizedUrl,
    description: trimOptionalText(typeof item.description === 'string' ? item.description : undefined),
    iconUrl: normalizedIconUrl,
    tags: normalizeTags(item.tags),
  };
};

const normalizeNavSections = (value: unknown): CinnyExploreNavSection[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const sections = value.reduce<CinnyExploreNavSection[]>((acc, item) => {
    if (!item || typeof item !== 'object') return acc;
    const section = item as Record<string, unknown>;
    if (typeof section.id !== 'string' || section.id.trim().length === 0) return acc;
    if (typeof section.title !== 'string' || section.title.trim().length === 0) return acc;
    if (!Array.isArray(section.cards)) return acc;

    const cards = section.cards
      .map((card) => normalizeNavCard(card))
      .filter((card): card is CinnyExploreNavCard => !!card);

    acc.push({
      id: section.id.trim(),
      title: section.title.trim(),
      cards,
    });
    return acc;
  }, []);

  return sections;
};

const normalizeExploreSourceValue = (kind: CinnyExploreSourceKind, value: string): string => {
  if (kind === 'server') {
    return normalizeExploreServerAddress(value);
  }

  if (kind === 'web') {
    return normalizeExploreWebUrl(value);
  }

  return normalizeOptionalText(value);
};

const getCurrentSources = (mx: MatrixClient): CinnyExploreSource[] =>
  getExploreCustomSources(
    mx.getAccountData(AccountDataEvent.CinnyExploreSources)?.getContent<CinnyExploreSourcesContent>()
  );

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

const updateExploreSource = async (
  mx: MatrixClient,
  sourceId: string,
  updater: (source: CinnyExploreSource) => CinnyExploreSource | undefined
): Promise<CinnyExploreSource | undefined> => {
  const currentSources = getCurrentSources(mx);
  const existing = currentSources.find((item) => item.id === sourceId);
  if (!existing) return undefined;

  const updatedSource = updater(existing);
  if (!updatedSource) return undefined;

  await writeExploreCustomSources(
    mx,
    currentSources.map((item) => (item.id === existing.id ? updatedSource : item))
  );

  return updatedSource;
};

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

    if (item.kind !== 'nav' && (typeof item.value !== 'string' || item.value.trim().length === 0)) {
      return sources;
    }

    try {
      const normalizedValue = normalizeExploreSourceValue(
        item.kind,
        typeof item.value === 'string' ? item.value : ''
      );
      const fallbackTimestamp = Date.now();

      sources.push({
        id: item.id.trim(),
        kind: item.kind,
        value: normalizedValue,
        title: trimOptionalText(item.title) ?? getDefaultTitle(item.kind, normalizedValue),
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
        navSections:
          item.kind === 'nav' ? normalizeNavSections(item.navSections) ?? [] : undefined,
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

export const upsertExploreCustomSource = async (
  mx: MatrixClient,
  source: {
    kind: CinnyExploreSourceKind;
    title?: string;
    value: string;
  }
): Promise<CinnyExploreSource> => {
  const kind = source.kind;
  const normalizedValue = normalizeExploreSourceValue(kind, source.value);
  const normalizedTitle = trimOptionalText(source.title) ?? getDefaultTitle(kind, normalizedValue);
  const currentSources = getCurrentSources(mx);
  const now = Date.now();

  const existing =
    kind === 'nav'
      ? undefined
      : currentSources.find((item) => item.kind === kind && item.value === normalizedValue);

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
    id: createId('src'),
    kind,
    title: normalizedTitle,
    value: normalizedValue,
    createdAt: now,
    updatedAt: now,
    webOpenMode: kind === 'web' ? 'auto' : undefined,
    webEmbedStatus: kind === 'web' ? 'unknown' : undefined,
    navSections: kind === 'nav' ? [] : undefined,
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
): Promise<CinnyExploreSource | undefined> =>
  updateExploreSource(mx, sourceId, (source) => {
    if (source.kind !== 'web') {
      return undefined;
    }

    return {
      ...source,
      webOpenMode: policy.webOpenMode ?? source.webOpenMode ?? 'auto',
      webEmbedStatus: policy.webEmbedStatus ?? source.webEmbedStatus ?? 'unknown',
      updatedAt: Date.now(),
    };
  });

export const upsertExploreNavSection = async (
  mx: MatrixClient,
  sourceId: string,
  section: {
    id?: string;
    title: string;
  }
): Promise<CinnyExploreSource | undefined> =>
  updateExploreSource(mx, sourceId, (source) => {
    if (source.kind !== 'nav') {
      return undefined;
    }

    const title = trimOptionalText(section.title);
    if (!title) {
      throw new Error('请输入分组名称。');
    }

    const sections = source.navSections ?? [];
    const existingSection = section.id && sections.find((item) => item.id === section.id);

    const nextSection: CinnyExploreNavSection = existingSection
      ? {
          ...existingSection,
          title,
        }
      : {
          id: createId('nav_section'),
          title,
          cards: [],
        };

    const nextSections = existingSection
      ? sections.map((item) => (item.id === existingSection.id ? nextSection : item))
      : [...sections, nextSection];

    return {
      ...source,
      navSections: nextSections,
      updatedAt: Date.now(),
    };
  });

export const removeExploreNavSection = async (
  mx: MatrixClient,
  sourceId: string,
  sectionId: string
): Promise<CinnyExploreSource | undefined> =>
  updateExploreSource(mx, sourceId, (source) => {
    if (source.kind !== 'nav') {
      return undefined;
    }

    return {
      ...source,
      navSections: (source.navSections ?? []).filter((section) => section.id !== sectionId),
      updatedAt: Date.now(),
    };
  });

export const upsertExploreNavCard = async (
  mx: MatrixClient,
  sourceId: string,
  sectionId: string,
  card: {
    id?: string;
    title: string;
    url: string;
    description?: string;
    iconUrl?: string;
    tags?: string[];
  }
): Promise<CinnyExploreSource | undefined> =>
  updateExploreSource(mx, sourceId, (source) => {
    if (source.kind !== 'nav') {
      return undefined;
    }

    const title = trimOptionalText(card.title);
    if (!title) {
      throw new Error('请输入卡片标题。');
    }

    const url = normalizeExploreWebUrl(card.url);
    const description = trimOptionalText(card.description);
    const iconUrl = trimOptionalText(card.iconUrl)
      ? normalizeExploreWebUrl(card.iconUrl as string)
      : undefined;
    const tags = normalizeTags(card.tags) ?? undefined;

    const sections = source.navSections ?? [];
    const targetSection = sections.find((section) => section.id === sectionId);
    if (!targetSection) {
      throw new Error('没有找到对应分组。');
    }

    const existingCard = card.id && targetSection.cards.find((item) => item.id === card.id);
    const nextCard: CinnyExploreNavCard = existingCard
      ? {
          ...existingCard,
          title,
          url,
          description,
          iconUrl,
          tags,
        }
      : {
          id: createId('nav_card'),
          title,
          url,
          description,
          iconUrl,
          tags,
        };

    const nextSections = sections.map((section) => {
      if (section.id !== sectionId) return section;

      return {
        ...section,
        cards: existingCard
          ? section.cards.map((item) => (item.id === existingCard.id ? nextCard : item))
          : [...section.cards, nextCard],
      };
    });

    return {
      ...source,
      navSections: nextSections,
      updatedAt: Date.now(),
    };
  });

export const removeExploreNavCard = async (
  mx: MatrixClient,
  sourceId: string,
  sectionId: string,
  cardId: string
): Promise<CinnyExploreSource | undefined> =>
  updateExploreSource(mx, sourceId, (source) => {
    if (source.kind !== 'nav') {
      return undefined;
    }

    return {
      ...source,
      navSections: (source.navSections ?? []).map((section) =>
        section.id === sectionId
          ? {
              ...section,
              cards: section.cards.filter((card) => card.id !== cardId),
            }
          : section
      ),
      updatedAt: Date.now(),
    };
  });

export const removeExploreCustomSource = async (
  mx: MatrixClient,
  sourceId: string
): Promise<void> => {
  const currentSources = getCurrentSources(mx);
  const nextSources = currentSources.filter((item) => item.id !== sourceId);

  if (nextSources.length === currentSources.length) {
    return;
  }

  await writeExploreCustomSources(mx, nextSources);
};
