import React, { MouseEventHandler, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { HTMLReactParserOptions } from 'html-react-parser';
import { MatrixEvent, MsgType, Room, RoomEvent } from 'matrix-js-sdk';
import { Opts as LinkifyOpts } from 'linkifyjs';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Icon,
  Icons,
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
import { MessageEvent } from '../../../../types/matrix/room';
import { mxcUrlToHttp } from '../../../utils/matrix';
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
  removeFavoriteMessage,
} from '../../../features/favorites';

type FavoriteItem = {
  event: MatrixEvent;
  metadata: FavoriteMessageMetadata;
  category: FavoriteCategory;
};

type FavoriteGroup = {
  category: FavoriteCategory;
  items: FavoriteItem[];
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
      id: item.event.getId() ?? `${item.metadata.sourceRoomId}:${item.metadata.sourceEventId}`,
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

function FavoriteCard({
  favoritesRoom,
  item,
  content,
  hour24Clock,
  dateFormatString,
  onOpenSource,
  onRemoved,
}: {
  favoritesRoom: Room;
  item: FavoriteItem;
  content: ReactNode;
  hour24Clock: boolean;
  dateFormatString: string;
  onOpenSource: MouseEventHandler<HTMLButtonElement>;
  onRemoved: (eventId: string) => void;
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
        if (eventId) onRemoved(eventId);
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
        <Box direction="Column" gap="300">
          <Box gap="300" justifyContent="SpaceBetween" alignItems="Start" grow="Yes">
            <Box direction="Column" gap="100">
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

            <Box shrink="No" gap="200" alignItems="Center" wrap="Wrap">
              {sourceRoomAvailable && metadata.sourceEventId && (
                <Button
                  size="300"
                  variant="Secondary"
                  fill="Soft"
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
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');
  const [activeCategory, setActiveCategory] = useState<FavoriteVisibleCategory>('all');

  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>(() =>
    getFavoriteEvents(favoritesRoom)
  );

  useEffect(() => {
    setFavoriteItems(getFavoriteEvents(favoritesRoom));
  }, [favoritesRoom]);

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
    if (
      activeCategory !== 'all' &&
      !favoriteItems.some((item) => item.category === activeCategory)
    ) {
      setActiveCategory('all');
    }
  }, [activeCategory, favoriteItems]);

  const imageViewerItems = useMemo(
    () => getFavoriteImageViewerItems(favoriteItems),
    [favoriteItems]
  );

  const favoriteGroups = useMemo(
    () => getFavoriteGroups(favoriteItems, activeCategory),
    [favoriteItems, activeCategory]
  );

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

  const handleRemoveFavorite = useCallback((eventId: string) => {
    setFavoriteItems((items) => items.filter((item) => item.event.getId() !== eventId));
  }, []);

  const hasRoom = !!favoritesRoom;
  const loadingRoom = createState.status === AsyncStatus.Loading;
  const showGroupedHeading = activeCategory === 'all';

  return (
    <Page>
      <PageHeader balance>
        <Box grow="Yes" direction="Column" gap="300">
          <Box alignItems="Center" justifyContent="SpaceBetween" gap="300">
            <Box direction="Column" gap="100" grow="Yes">
              <Text size="H3">收藏</Text>
              <Text size="T300" priority="300">
                默认收藏保存在 Matrix 收藏房间里，不会额外堆在前端本地。现在也支持按内容类型筛选查看。
              </Text>
            </Box>

            <Box shrink="No" gap="200" alignItems="Center">
              {favoriteItems.length > 0 && (
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
                {favoriteItems.length > 0 && (
                  <SequenceCard
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="200"
                    style={{ padding: config.space.S300 }}
                  >
                    <Text size="L400">分类查看</Text>
                    <Box gap="200" wrap="Wrap">
                      {FAVORITE_VISIBLE_CATEGORIES.map((category) => (
                        <Button
                          key={category}
                          size="300"
                          variant={activeCategory === category ? 'Primary' : 'Secondary'}
                          fill={activeCategory === category ? 'Solid' : 'Soft'}
                          onClick={() => setActiveCategory(category)}
                        >
                          <Text size="B300">
                            {`${getFavoriteCategoryLabel(category)} ${getCategoryCount(
                              favoriteItems,
                              category
                            )}`}
                          </Text>
                        </Button>
                      ))}
                    </Box>
                  </SequenceCard>
                )}

                {(loadingRoom || favoriteItems.length === 0) && (
                  <FavoritesEmpty
                    loading={loadingRoom}
                    hasRoom={hasRoom}
                    onCreate={handleCreateFavoritesRoom}
                  />
                )}

                {favoriteGroups.length > 0 && favoritesRoom && (
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
                              key={
                                item.event.getId() ??
                                `${item.metadata.sourceRoomId}:${item.metadata.sourceEventId}`
                              }
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
                              onOpenSource={handleOpenSource}
                              onRemoved={handleRemoveFavorite}
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
