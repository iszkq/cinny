import React, { MouseEventHandler, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { HTMLReactParserOptions } from 'html-react-parser';
import { MatrixEvent, MsgType, Room, RoomEvent } from 'matrix-js-sdk';
import { Opts as LinkifyOpts } from 'linkifyjs';
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  Icon,
  Icons,
  Input,
  Line,
  Scroll,
  Spinner,
  Text,
  config,
} from 'folds';
import {
  AvatarBase,
  ImageContent,
  MSticker,
  ModernLayout,
  Time,
  Username,
  UsernameBold,
} from '../../../components/message';
import {
  Page,
  PageContent,
  PageContentCenter,
  PageHeader,
  PageHero,
  PageHeroEmpty,
  PageHeroSection,
} from '../../../components/page';
import { Image } from '../../../components/media';
import { ImageViewer } from '../../../components/image-viewer';
import { SequenceCard } from '../../../components/sequence-card';
import { UserAvatar } from '../../../components/user-avatar';
import { RenderMessageContent } from '../../../components/RenderMessageContent';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useAccountData } from '../../../hooks/useAccountData';
import { useFavoritesRoom } from '../../../hooks/useFavoritesRoom';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useMatrixEventRenderer } from '../../../hooks/useMatrixEventRenderer';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { useMentionClickHandler } from '../../../hooks/useMentionClickHandler';
import { useRoomNavigate } from '../../../hooks/useRoomNavigate';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeMentionCustomProps,
  renderMatrixMention,
} from '../../../plugins/react-custom-html-parser';
import { useSpoilerClickHandler } from '../../../hooks/useSpoilerClickHandler';
import { AccountDataEvent, CinnyFavoriteNotesContent } from '../../../../types/matrix/accountData';
import { MessageEvent } from '../../../../types/matrix/room';
import { mxcUrlToHttp } from '../../../utils/matrix';
import { trimReplyFromBody } from '../../../utils/room';
import type { ViewerImageItem } from '../../../components/message/content/ImageContent';
import {
  ensureFavoritesRoom,
  FavoriteCategory,
  FavoriteMessageMetadata,
  FavoriteVisibleCategory,
  FAVORITE_CATEGORIES,
  FAVORITE_VISIBLE_CATEGORIES,
  getFavoriteCategory,
  getFavoriteCategoryLabel,
  getFavoriteMessageMetadataFromEvent,
  getFavoriteNotes,
  getFavoriteReferenceId,
  removeFavoriteMessage,
  removeFavoriteNote,
  removeFavoriteNotes,
  setFavoriteNote,
} from '../../../features/favorites';

type FavoriteDateFilter = 'all' | 'today' | '7d' | '30d' | '90d';

type FavoriteItem = {
  event: MatrixEvent;
  metadata: FavoriteMessageMetadata;
  category: FavoriteCategory;
  referenceId: string;
  searchBody: string;
};

type FavoriteGroup = {
  category: FavoriteCategory;
  items: FavoriteItem[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_FILTER_OPTIONS: Array<{ id: FavoriteDateFilter; label: string }> = [
  { id: 'all', label: '全部时间' },
  { id: 'today', label: '今天' },
  { id: '7d', label: '近 7 天' },
  { id: '30d', label: '近 30 天' },
  { id: '90d', label: '近 90 天' },
];

const getStartOfToday = (): number => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
};

const getFavoriteItemId = (item: FavoriteItem): string => item.event.getId() ?? item.referenceId;

const getFavoriteItemBody = (event: MatrixEvent): string => {
  if (event.isRedacted()) return '';

  const body = typeof event.getContent().body === 'string' ? event.getContent().body : '';
  if (!body) return '';

  if (event.getType() === MessageEvent.RoomMessage) {
    return trimReplyFromBody(body).replace(/\s+/g, ' ').trim();
  }

  return body.replace(/\s+/g, ' ').trim();
};

const matchesDateFilter = (timestamp: number, dateFilter: FavoriteDateFilter): boolean => {
  if (dateFilter === 'all') return true;

  const now = Date.now();
  if (dateFilter === 'today') {
    return timestamp >= getStartOfToday();
  }

  if (dateFilter === '7d') {
    return timestamp >= now - DAY_MS * 7;
  }

  if (dateFilter === '30d') {
    return timestamp >= now - DAY_MS * 30;
  }

  return timestamp >= now - DAY_MS * 90;
};

const getFavoriteEvents = (room?: Room): FavoriteItem[] => {
  if (!room) return [];

  return room
    .getLiveTimeline()
    .getEvents()
    .reduce<FavoriteItem[]>((items, event) => {
      if (event.isRedacted()) return items;

      const metadata = getFavoriteMessageMetadataFromEvent(event);
      if (!metadata) return items;

      items.push({
        event,
        metadata,
        category: getFavoriteCategory(event),
        referenceId: getFavoriteReferenceId(metadata.sourceRoomId, metadata.sourceEventId),
        searchBody: getFavoriteItemBody(event),
      });

      return items;
    }, [])
    .sort((a, b) => b.event.getTs() - a.event.getTs());
};

const getFavoriteImageViewerItems = (items: FavoriteItem[]): ViewerImageItem[] =>
  items.reduce<ViewerImageItem[]>((viewerItems, item) => {
    const eventType = item.event.getType();
    const content = item.event.getContent();
    const isImageMessage =
      eventType === MessageEvent.Sticker || content.msgtype === MsgType.Image;

    if (!isImageMessage) return viewerItems;

    const url =
      typeof content.file?.url === 'string'
        ? content.file.url
        : typeof content.url === 'string'
          ? content.url
          : undefined;

    if (!url) return viewerItems;

    const mimeType =
      typeof content.info?.mimetype === 'string' ? content.info.mimetype : undefined;

    viewerItems.push({
      id: getFavoriteItemId(item),
      body: typeof content.body === 'string' ? content.body : '图片',
      mimeType,
      url,
      encInfo: content.file,
    });

    return viewerItems;
  }, []);

const getCategoryCount = (items: FavoriteItem[], category: FavoriteVisibleCategory): number => {
  if (category === 'all') return items.length;
  return items.filter((item) => item.category === category).length;
};

const getFavoriteGroups = (
  items: FavoriteItem[],
  activeCategory: FavoriteVisibleCategory
): FavoriteGroup[] => {
  if (activeCategory !== 'all') {
    return [
      {
        category: activeCategory,
        items: items.filter((item) => item.category === activeCategory),
      },
    ];
  }

  return FAVORITE_CATEGORIES.reduce<FavoriteGroup[]>((groups, category) => {
    const categoryItems = items.filter((item) => item.category === category);
    if (categoryItems.length > 0) {
      groups.push({
        category,
        items: categoryItems,
      });
    }
    return groups;
  }, []);
};

function FavoritesEmpty({
  loading,
  hasRoom,
  onCreate,
}: {
  loading: boolean;
  hasRoom: boolean;
  onCreate: () => void;
}) {
  return (
    <PageHeroEmpty>
      <PageHeroSection>
        <PageHero
          icon={
            loading ? <Spinner size="600" variant="Secondary" /> : <Icon size="600" src={Icons.Heart} />
          }
          title={hasRoom ? '还没有收藏内容' : '创建默认收藏'}
          subTitle={
            hasRoom
              ? '右键消息后点击“收藏”，内容就会出现在这里。'
              : '默认收藏会自动使用一个专属私密房间来保存你收藏的消息副本。'
          }
        >
          {!hasRoom && (
            <Box justifyContent="Center">
              <Button onClick={onCreate} disabled={loading}>
                {loading && <Spinner size="200" variant="Secondary" />}
                <Text size="B400">{loading ? '创建中...' : '创建收藏房间'}</Text>
              </Button>
            </Box>
          )}
        </PageHero>
      </PageHeroSection>
    </PageHeroEmpty>
  );
}

function FavoriteNoteEditor({
  note,
  onSave,
}: {
  note?: string;
  onSave: (note: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftNote, setDraftNote] = useState(note ?? '');

  useEffect(() => {
    setDraftNote(note ?? '');
  }, [note]);

  const [saveState, saveNote] = useAsyncCallback(
    useCallback(() => onSave(draftNote), [draftNote, onSave])
  );

  const handleSave = () => {
    if (saveState.status === AsyncStatus.Loading) return;

    saveNote()
      .then(() => {
        setEditing(false);
      })
      .catch(() => {});
  };

  const hasNote = Boolean(note);

  return (
    <Box direction="Column" gap="200">
      <Box gap="200" alignItems="Center" wrap="Wrap">
        <Chip variant={hasNote ? 'Secondary' : 'SurfaceVariant'} radii="Pill">
          <Text size="T200">备注</Text>
        </Chip>
        {hasNote ? (
          <Text size="T300">{note}</Text>
        ) : (
          <Text size="T200" priority="300">
            暂无备注，可用于收藏内搜索。
          </Text>
        )}
        {!editing && (
          <Button
            size="300"
            variant="Secondary"
            fill="Soft"
            radii="300"
            onClick={() => setEditing(true)}
          >
            <Text size="B300">{hasNote ? '编辑备注' : '添加备注'}</Text>
          </Button>
        )}
      </Box>

      {editing && (
        <Box direction="Column" gap="200">
          <Input
            size="300"
            variant="Secondary"
            radii="300"
            placeholder="输入备注，支持收藏内容与备注搜索"
            value={draftNote}
            onChange={(evt: React.ChangeEvent<HTMLInputElement>) => setDraftNote(evt.target.value)}
            onKeyDown={(evt: React.KeyboardEvent<HTMLInputElement>) => {
              if (evt.key !== 'Enter') return;
              evt.preventDefault();
              handleSave();
            }}
          />
          <Box gap="200" wrap="Wrap">
            <Button
              size="300"
              variant="Primary"
              radii="300"
              onClick={handleSave}
              disabled={saveState.status === AsyncStatus.Loading}
            >
              {saveState.status === AsyncStatus.Loading && (
                <Spinner size="200" variant="Secondary" />
              )}
              <Text size="B300">{saveState.status === AsyncStatus.Loading ? '保存中...' : '保存备注'}</Text>
            </Button>
            <Button
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              onClick={() => {
                setDraftNote(note ?? '');
                setEditing(false);
              }}
            >
              <Text size="B300">取消</Text>
            </Button>
            {hasNote && (
              <Button
                size="300"
                variant="Critical"
                fill="Soft"
                radii="300"
                onClick={() => {
                  setDraftNote('');
                  saveNote('')
                    .then(() => {
                      setEditing(false);
                    })
                    .catch(() => {});
                }}
                disabled={saveState.status === AsyncStatus.Loading}
              >
                <Text size="B300">清空备注</Text>
              </Button>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function FavoriteCard({
  favoritesRoom,
  item,
  content,
  hour24Clock,
  dateFormatString,
  selected,
  note,
  onToggleSelect,
  onOpenSource,
  onRemoved,
  onSaveNote,
}: {
  favoritesRoom: Room;
  item: FavoriteItem;
  content: ReactNode;
  hour24Clock: boolean;
  dateFormatString: string;
  selected: boolean;
  note?: string;
  onToggleSelect: () => void;
  onOpenSource: MouseEventHandler<HTMLButtonElement>;
  onRemoved: (item: FavoriteItem) => void;
  onSaveNote: (note: string) => Promise<void>;
}) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const { event, metadata, category } = item;
  const sourceRoomAvailable = !!mx.getRoom(metadata.sourceRoomId);

  const [removeState, remove] = useAsyncCallback(
    useCallback(async () => {
      const eventId = event.getId();
      if (!eventId) throw new Error('Missing favorite event id.');
      await removeFavoriteMessage(mx, favoritesRoom.roomId, eventId);
      return eventId;
    }, [mx, favoritesRoom.roomId, event])
  );

  const handleRemove = () => {
    if (removeState.status === AsyncStatus.Loading) return;

    remove()
      .then((eventId) => {
        if (eventId) onRemoved(item);
      })
      .catch(() => {});
  };

  return (
    <SequenceCard
      style={{ padding: config.space.S400 }}
      variant="SurfaceVariant"
      direction="Column"
      gap="300"
    >
      <ModernLayout
        before={
          <AvatarBase>
            <Avatar size="300">
              <UserAvatar
                userId={metadata.sourceSenderId ?? metadata.sourceSenderName}
                src={
                  metadata.sourceSenderAvatarMxc
                    ? mxcUrlToHttp(
                        mx,
                        metadata.sourceSenderAvatarMxc,
                        useAuthentication,
                        48,
                        48,
                        'crop'
                      ) ?? undefined
                    : undefined
                }
                alt={metadata.sourceSenderName}
                renderFallback={() => <Icon size="200" src={Icons.User} filled />}
              />
            </Avatar>
          </AvatarBase>
        }
      >
        <Box direction="Column" gap="300" style={{ minWidth: 0 }}>
          <Box gap="300" justifyContent="SpaceBetween" alignItems="Start" grow="Yes">
            <Box gap="300" alignItems="Start" grow="Yes" style={{ minWidth: 0 }}>
              <Box shrink="No" style={{ paddingTop: config.space.S100 }}>
                <Checkbox checked={selected} onClick={onToggleSelect} size="50" variant="Primary" />
              </Box>
              <Box direction="Column" gap="100" grow="Yes" style={{ minWidth: 0 }}>
              <Box gap="200" alignItems="Center" wrap="Wrap">
                <Username>
                  <Text as="span" truncate>
                    <UsernameBold>{metadata.sourceSenderName}</UsernameBold>
                  </Text>
                </Username>
                <Time
                  ts={metadata.sourceTimestamp}
                  hour24Clock={hour24Clock}
                  dateFormatString={dateFormatString}
                />
              </Box>
              <Box gap="200" alignItems="Center" wrap="Wrap">
                <Chip variant="Secondary" radii="Pill">
                  <Text size="T200">{metadata.sourceRoomName}</Text>
                </Chip>
                <Chip variant="SurfaceVariant" radii="Pill">
                  <Text size="T200">{getFavoriteCategoryLabel(category)}</Text>
                </Chip>
                <Text size="T200" priority="300">
                  {`收藏于 ${new Date(metadata.favoritedAt).toLocaleString()}`}
                </Text>
              </Box>
            </Box>
            </Box>

            <Box shrink="No" gap="200" alignItems="Center" wrap="Wrap">
              {sourceRoomAvailable && metadata.sourceEventId && (
                <Button
                  size="300"
                  variant="Secondary"
                  fill="Soft"
                  radii="300"
                  data-room-id={metadata.sourceRoomId}
                  data-event-id={metadata.sourceEventId}
                  onClick={onOpenSource}
                >
                  <Text size="B300">跳转到原消息</Text>
                </Button>
              )}
              <Button
                size="300"
                variant="Secondary"
                radii="300"
                onClick={handleRemove}
                disabled={removeState.status === AsyncStatus.Loading}
              >
                {removeState.status === AsyncStatus.Loading && (
                  <Spinner size="200" variant="Secondary" />
                )}
                <Text size="B300">
                  {removeState.status === AsyncStatus.Loading ? '取消中...' : '取消收藏'}
                </Text>
              </Button>
            </Box>
          </Box>

          <FavoriteNoteEditor note={note} onSave={onSaveNote} />

          {content}
        </Box>
      </ModernLayout>
    </SequenceCard>
  );
}

export function Favorites() {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const { navigateRoom } = useRoomNavigate();
  const favoritesRoom = useFavoritesRoom();
  const favoriteNotesEvent = useAccountData(AccountDataEvent.CinnyFavoriteNotes);
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');
  const [activeCategory, setActiveCategory] = useState<FavoriteVisibleCategory>('all');
  const [dateFilter, setDateFilter] = useState<FavoriteDateFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFavoriteIds, setSelectedFavoriteIds] = useState<Set<string>>(new Set());

  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>(() =>
    getFavoriteEvents(favoritesRoom)
  );
  const [favoriteNotes, setFavoriteNotesState] = useState<Record<string, string>>(() =>
    getFavoriteNotes(favoriteNotesEvent?.getContent<CinnyFavoriteNotesContent>())
  );

  useEffect(() => {
    setFavoriteItems(getFavoriteEvents(favoritesRoom));
  }, [favoritesRoom]);

  useEffect(() => {
    setFavoriteNotesState(
      getFavoriteNotes(favoriteNotesEvent?.getContent<CinnyFavoriteNotesContent>())
    );
  }, [favoriteNotesEvent]);

  useEffect(() => {
    if (!favoritesRoom) return undefined;

    const refresh = () => setFavoriteItems(getFavoriteEvents(favoritesRoom));

    favoritesRoom.on(RoomEvent.Timeline, refresh);
    favoritesRoom.on(RoomEvent.TimelineRefresh, refresh);

    return () => {
      favoritesRoom.removeListener(RoomEvent.Timeline, refresh);
      favoritesRoom.removeListener(RoomEvent.TimelineRefresh, refresh);
    };
  }, [favoritesRoom]);

  useEffect(() => {
    const availableIds = new Set(favoriteItems.map((item) => getFavoriteItemId(item)));
    setSelectedFavoriteIds((current) => {
      const next = new Set(Array.from(current).filter((itemId) => availableIds.has(itemId)));
      return next.size === current.size ? current : next;
    });
  }, [favoriteItems]);

  useEffect(() => {
    if (
      activeCategory !== 'all' &&
      !favoriteItems.some((item) => item.category === activeCategory)
    ) {
      setActiveCategory('all');
    }
  }, [activeCategory, favoriteItems]);

  const searchedItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return favoriteItems.filter((item) => {
      if (!matchesDateFilter(item.metadata.favoritedAt, dateFilter)) {
        return false;
      }

      if (!normalizedQuery) return true;

      const note = favoriteNotes[item.referenceId] ?? '';
      return `${item.searchBody}\n${note}`.toLowerCase().includes(normalizedQuery);
    });
  }, [dateFilter, favoriteItems, favoriteNotes, searchQuery]);

  const favoriteGroups = useMemo(
    () => getFavoriteGroups(searchedItems, activeCategory),
    [searchedItems, activeCategory]
  );

  const visibleItems = useMemo(
    () => favoriteGroups.flatMap((group) => group.items),
    [favoriteGroups]
  );

  const imageViewerItems = useMemo(
    () => getFavoriteImageViewerItems(visibleItems),
    [visibleItems]
  );

  const visibleItemIds = useMemo(
    () => visibleItems.map((item) => getFavoriteItemId(item)),
    [visibleItems]
  );

  const selectedCount = selectedFavoriteIds.size;
  const selectedVisibleCount = useMemo(
    () => visibleItemIds.filter((itemId) => selectedFavoriteIds.has(itemId)).length,
    [selectedFavoriteIds, visibleItemIds]
  );

  const allVisibleSelected =
    visibleItemIds.length > 0 && visibleItemIds.every((itemId) => selectedFavoriteIds.has(itemId));

  const mentionClickHandler = useMentionClickHandler(favoritesRoom?.roomId ?? '');
  const spoilerClickHandler = useSpoilerClickHandler();

  const linkifyOpts = useMemo<LinkifyOpts>(
    () => ({
      ...LINKIFY_OPTS,
      render: factoryRenderLinkifyWithMention((href) =>
        renderMatrixMention(
          mx,
          favoritesRoom?.roomId ?? '',
          href,
          makeMentionCustomProps(mentionClickHandler)
        )
      ),
    }),
    [mx, favoritesRoom?.roomId, mentionClickHandler]
  );

  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, favoritesRoom?.roomId ?? '', {
        linkifyOpts,
        useAuthentication,
        handleSpoilerClick: spoilerClickHandler,
        handleMentionClick: mentionClickHandler,
      }),
    [
      mx,
      favoritesRoom?.roomId,
      linkifyOpts,
      mentionClickHandler,
      spoilerClickHandler,
      useAuthentication,
    ]
  );

  const renderMatrixEvent = useMatrixEventRenderer<[MatrixEvent, FavoriteMessageMetadata]>({
    [MessageEvent.RoomMessage]: (event, metadata) => (
      <RenderMessageContent
        displayName={metadata.sourceSenderName}
        msgType={event.getContent().msgtype ?? MsgType.Text}
        ts={event.getTs()}
        getContent={() => event.getContent()}
        mediaAutoLoad={mediaAutoLoad}
        urlPreview={urlPreview}
        htmlReactParserOptions={htmlReactParserOptions}
        linkifyOpts={linkifyOpts}
        outlineAttachment
        room={favoritesRoom}
        eventId={event.getId() ?? undefined}
        imageViewerItems={imageViewerItems}
      />
    ),
    [MessageEvent.Sticker]: (event) => (
      <MSticker
        content={event.getContent()}
        renderImageContent={(props) => (
          <ImageContent
            {...props}
            autoPlay={mediaAutoLoad}
            viewerItems={imageViewerItems}
            viewerItemId={event.getId() ?? undefined}
            renderImage={(imageProps) => <Image {...imageProps} loading="lazy" />}
            renderViewer={(viewerProps) => <ImageViewer {...viewerProps} />}
          />
        )}
      />
    ),
  });

  const [createState, createFavoritesRoom] = useAsyncCallback(
    useCallback(() => ensureFavoritesRoom(mx), [mx])
  );
  const [batchRemoveState, batchRemoveFavorites] = useAsyncCallback(
    useCallback(async () => {
      if (!favoritesRoom || selectedFavoriteIds.size === 0) {
        return {
          removedItemIds: [] as string[],
          removedReferenceIds: [] as string[],
        };
      }

      const selectedItems = favoriteItems.filter((item) =>
        selectedFavoriteIds.has(getFavoriteItemId(item))
      );
      const removableItems = selectedItems.filter((item) => typeof item.event.getId() === 'string');

      if (removableItems.length === 0) {
        return {
          removedItemIds: [] as string[],
          removedReferenceIds: [] as string[],
        };
      }

      await Promise.all(
        removableItems.map((item) =>
          removeFavoriteMessage(mx, favoritesRoom.roomId, item.event.getId() as string)
        )
      );

      await removeFavoriteNotes(
        mx,
        removableItems.map((item) => ({
          sourceRoomId: item.metadata.sourceRoomId,
          sourceEventId: item.metadata.sourceEventId,
        }))
      );

      return {
        removedItemIds: removableItems.map((item) => getFavoriteItemId(item)),
        removedReferenceIds: removableItems.map((item) => item.referenceId),
      };
    }, [favoriteItems, favoritesRoom, mx, selectedFavoriteIds])
  );

  const handleCreateFavoritesRoom = useCallback(() => {
    if (createState.status === AsyncStatus.Loading) return;
    createFavoritesRoom().catch(() => {});
  }, [createFavoritesRoom, createState.status]);

  const handleOpenSource: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const roomId = evt.currentTarget.getAttribute('data-room-id');
    const eventId = evt.currentTarget.getAttribute('data-event-id') || undefined;
    if (!roomId) return;

    navigateRoom(roomId, eventId);
  };

  const handleToggleSelect = useCallback((itemId: string) => {
    setSelectedFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const handleToggleSelectVisible = useCallback(() => {
    setSelectedFavoriteIds((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        visibleItemIds.forEach((itemId) => {
          next.delete(itemId);
        });
      } else {
        visibleItemIds.forEach((itemId) => {
          next.add(itemId);
        });
      }

      return next;
    });
  }, [allVisibleSelected, visibleItemIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedFavoriteIds(new Set());
  }, []);

  const handleSaveNote = useCallback(
    async (sourceRoomId: string, sourceEventId: string, note: string) => {
      const referenceId = getFavoriteReferenceId(sourceRoomId, sourceEventId);
      const trimmedNote = note.trim();
      let previousNote: string | undefined;

      setFavoriteNotesState((current) => {
        previousNote = current[referenceId];
        const next = { ...current };

        if (trimmedNote) {
          next[referenceId] = trimmedNote;
        } else {
          delete next[referenceId];
        }

        return next;
      });

      try {
        await setFavoriteNote(mx, sourceRoomId, sourceEventId, trimmedNote);
      } catch (error) {
        setFavoriteNotesState((current) => {
          const next = { ...current };
          if (previousNote) {
            next[referenceId] = previousNote;
          } else {
            delete next[referenceId];
          }
          return next;
        });
        throw error;
      }
    },
    [mx]
  );

  const handleRemoveFavorite = useCallback(
    (item: FavoriteItem) => {
      const itemId = getFavoriteItemId(item);

      setFavoriteItems((items) => items.filter((favoriteItem) => getFavoriteItemId(favoriteItem) !== itemId));
      setSelectedFavoriteIds((current) => {
        if (!current.has(itemId)) return current;

        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
      setFavoriteNotesState((current) => {
        if (!(item.referenceId in current)) return current;

        const next = { ...current };
        delete next[item.referenceId];
        return next;
      });

      removeFavoriteNote(mx, item.metadata.sourceRoomId, item.metadata.sourceEventId).catch(() => {});
    },
    [mx]
  );

  const handleBatchRemove = () => {
    if (batchRemoveState.status === AsyncStatus.Loading || selectedCount === 0) return;

    batchRemoveFavorites()
      .then((result) => {
        if (!result || result.removedItemIds.length === 0) return;

        const removedIds = new Set(result.removedItemIds);
        const removedReferenceIds = new Set(result.removedReferenceIds);

        setFavoriteItems((items) =>
          items.filter((item) => !removedIds.has(getFavoriteItemId(item)))
        );
        setSelectedFavoriteIds((current) => {
          const next = new Set(current);
          result.removedItemIds.forEach((itemId) => next.delete(itemId));
          return next;
        });
        setFavoriteNotesState((current) => {
          const next = { ...current };
          removedReferenceIds.forEach((referenceId) => {
            delete next[referenceId];
          });
          return next;
        });
      })
      .catch(() => {});
  };

  const hasRoom = !!favoritesRoom;
  const loadingRoom = createState.status === AsyncStatus.Loading;
  const showGroupedHeading = activeCategory === 'all';
  const hasFavorites = favoriteItems.length > 0;
  const hasVisibleItems = visibleItems.length > 0;

  return (
    <Page>
      <PageHeader balance>
        <Box grow="Yes" direction="Column" gap="300">
          <Box alignItems="Center" justifyContent="SpaceBetween" gap="300">
            <Box direction="Column" gap="100" grow="Yes">
              <Text size="H3">收藏</Text>
              <Text size="T300" priority="300">
                默认收藏保存在 Matrix 收藏房间里。现在支持按内容或备注搜索、按日期筛选、批量取消收藏和添加备注。
              </Text>
            </Box>

            <Box shrink="No" gap="200" alignItems="Center">
              {hasFavorites && (
                <Chip variant="SurfaceVariant" radii="Pill">
                  <Text size="B300">{`${favoriteItems.length} 条`}</Text>
                </Chip>
              )}
              {!hasRoom && (
                <Button
                  size="300"
                  variant="Secondary"
                  onClick={handleCreateFavoritesRoom}
                  disabled={createState.status === AsyncStatus.Loading}
                >
                  {createState.status === AsyncStatus.Loading && (
                    <Spinner size="200" variant="Secondary" />
                  )}
                  <Text size="B300">
                    {createState.status === AsyncStatus.Loading
                      ? '创建中...'
                      : '创建收藏房间'}
                  </Text>
                </Button>
              )}
            </Box>
          </Box>
        </Box>
      </PageHeader>

      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <PageContentCenter>
              <Box direction="Column" gap="400" style={{ width: '100%' }}>
                {hasFavorites && (
                  <SequenceCard
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="300"
                    style={{ padding: config.space.S300 }}
                  >
                    <Text size="L400">筛选与管理</Text>
                    <Input
                      size="400"
                      variant="Secondary"
                      radii="300"
                      placeholder="搜索收藏内容或备注"
                      value={searchQuery}
                      onChange={(evt: React.ChangeEvent<HTMLInputElement>) =>
                        setSearchQuery(evt.target.value)
                      }
                      before={<Icon size="200" src={Icons.Search} />}
                    />
                    <Box direction="Column" gap="100">
                      <Text size="T200" priority="300">
                        日期筛选
                      </Text>
                      <Box gap="200" wrap="Wrap">
                        {DATE_FILTER_OPTIONS.map((option) => (
                          <Button
                            key={option.id}
                            size="300"
                            variant={dateFilter === option.id ? 'Primary' : 'Secondary'}
                            fill={dateFilter === option.id ? 'Solid' : 'Soft'}
                            radii="300"
                            onClick={() => setDateFilter(option.id)}
                          >
                            <Text size="B300">{option.label}</Text>
                          </Button>
                        ))}
                      </Box>
                    </Box>
                    <Box direction="Column" gap="100">
                      <Text size="T200" priority="300">
                        内容分类
                      </Text>
                      <Box gap="200" wrap="Wrap">
                        {FAVORITE_VISIBLE_CATEGORIES.map((category) => (
                          <Button
                            key={category}
                            size="300"
                            variant={activeCategory === category ? 'Primary' : 'Secondary'}
                            fill={activeCategory === category ? 'Solid' : 'Soft'}
                            radii="300"
                            onClick={() => setActiveCategory(category)}
                          >
                            <Text size="B300">
                              {`${getFavoriteCategoryLabel(category)} ${getCategoryCount(
                                searchedItems,
                                category
                              )}`}
                            </Text>
                          </Button>
                        ))}
                      </Box>
                    </Box>
                    <Line size="300" />
                    <Box gap="200" wrap="Wrap">
                      <Chip variant="SurfaceVariant" radii="Pill">
                        <Text size="B300">{`${visibleItems.length} 条结果`}</Text>
                      </Chip>
                      <Chip variant="SurfaceVariant" radii="Pill">
                        <Text size="B300">{`${selectedCount} 条已选`}</Text>
                      </Chip>
                      {selectedVisibleCount > 0 && selectedVisibleCount !== selectedCount && (
                        <Chip variant="Secondary" radii="Pill">
                          <Text size="B300">{`当前结果中已选 ${selectedVisibleCount} 条`}</Text>
                        </Chip>
                      )}
                      <Button
                        size="300"
                        variant="Secondary"
                        fill="Soft"
                        radii="300"
                        onClick={handleToggleSelectVisible}
                        disabled={visibleItems.length === 0}
                      >
                        <Text size="B300">
                          {allVisibleSelected ? '取消全选当前结果' : '全选当前结果'}
                        </Text>
                      </Button>
                      <Button
                        size="300"
                        variant="Secondary"
                        fill="Soft"
                        radii="300"
                        onClick={handleClearSelection}
                        disabled={selectedCount === 0}
                      >
                        <Text size="B300">清空选择</Text>
                      </Button>
                      <Button
                        size="300"
                        variant="Critical"
                        fill="Soft"
                        radii="300"
                        onClick={handleBatchRemove}
                        disabled={selectedCount === 0 || batchRemoveState.status === AsyncStatus.Loading}
                      >
                        {batchRemoveState.status === AsyncStatus.Loading && (
                          <Spinner size="200" variant="Secondary" />
                        )}
                        <Text size="B300">
                          {batchRemoveState.status === AsyncStatus.Loading
                            ? '批量取消中...'
                            : '批量取消收藏'}
                        </Text>
                      </Button>
                    </Box>
                  </SequenceCard>
                )}

                {(loadingRoom || !hasFavorites) && (
                  <FavoritesEmpty
                    loading={loadingRoom}
                    hasRoom={hasRoom}
                    onCreate={handleCreateFavoritesRoom}
                  />
                )}

                {hasFavorites && !hasVisibleItems && (
                  <SequenceCard
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="200"
                    style={{ padding: config.space.S400 }}
                  >
                    <Text size="L400">没有找到匹配的收藏</Text>
                    <Text size="T300" priority="300">
                      试试调整关键词、日期范围或分类条件。
                    </Text>
                  </SequenceCard>
                )}

                {hasVisibleItems && favoritesRoom && (
                  <Box direction="Column" gap="500">
                    {favoriteGroups.map((group, groupIndex) => (
                      <Box key={group.category} direction="Column" gap="300">
                        {showGroupedHeading && groupIndex > 0 && <Line size="300" />}
                        {showGroupedHeading && (
                          <Box
                            alignItems="Center"
                            justifyContent="SpaceBetween"
                            gap="200"
                            wrap="Wrap"
                            style={{ paddingTop: groupIndex === 0 ? config.space.S100 : 0 }}
                          >
                            <Text size="H4">{getFavoriteCategoryLabel(group.category)}</Text>
                            <Chip variant="SurfaceVariant" radii="Pill">
                              <Text size="B300">{`${group.items.length} 条`}</Text>
                            </Chip>
                          </Box>
                        )}

                        <Box direction="Column" gap="300">
                          {group.items.map((item) => (
                            <FavoriteCard
                              key={getFavoriteItemId(item)}
                              favoritesRoom={favoritesRoom}
                              item={item}
                              content={renderMatrixEvent(
                                item.event.getType(),
                                false,
                                item.event,
                                item.metadata
                              )}
                              hour24Clock={hour24Clock}
                              dateFormatString={dateFormatString}
                              selected={selectedFavoriteIds.has(getFavoriteItemId(item))}
                              note={favoriteNotes[item.referenceId]}
                              onToggleSelect={() => handleToggleSelect(getFavoriteItemId(item))}
                              onOpenSource={handleOpenSource}
                              onRemoved={handleRemoveFavorite}
                              onSaveNote={(note) =>
                                handleSaveNote(
                                  item.metadata.sourceRoomId,
                                  item.metadata.sourceEventId,
                                  note
                                )
                              }
                            />
                          ))}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            </PageContentCenter>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
