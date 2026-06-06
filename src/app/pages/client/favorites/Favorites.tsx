import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { HTMLReactParserOptions } from 'html-react-parser';
import {
  Direction,
  MatrixClient,
  MatrixEvent,
  MatrixEventEvent,
  MsgType,
  Room,
  RoomEvent,
} from 'matrix-js-sdk';
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
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Spinner,
  Text,
  config,
} from 'folds';
import {
  AvatarBase,
  ImageContent,
  MSticker,
  ThumbnailContent,
  Username,
  UsernameBold,
  VideoContent,
} from '../../../components/message';
import {
  Page,
  PageContent,
  PageContentCenter,
  PageHeader,
  PageHero,
  PageHeroSection,
} from '../../../components/page';
import { Image, Video } from '../../../components/media';
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
import { useSpoilerClickHandler } from '../../../hooks/useSpoilerClickHandler';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeMentionCustomProps,
  renderMatrixMention,
} from '../../../plugins/react-custom-html-parser';
import { AccountDataEvent, CinnyFavoriteNotesContent } from '../../../../types/matrix/accountData';
import {
  IImageContent,
  IThumbnailContent,
  IVideoContent,
  IVideoInfo,
  MATRIX_SPOILER_PROPERTY_NAME,
  MATRIX_SPOILER_REASON_PROPERTY_NAME,
} from '../../../../types/matrix/common';
import { GetContentCallback, MessageEvent } from '../../../../types/matrix/room';
import { mxcUrlToHttp } from '../../../utils/matrix';
import { decryptAllTimelineEvent, trimReplyFromBody } from '../../../utils/room';
import { ModalWide } from '../../../styles/Modal.css';
import { stopPropagation } from '../../../utils/keyboard';
import type { ViewerImageItem } from '../../../components/message/content/ImageContent';
import {
  ensureFavoritesRoom,
  FavoriteCategory,
  FavoriteMessageMetadata,
  FAVORITE_CATEGORIES,
  getFavoriteCategory,
  getFavoriteMessageMetadataFromEvent,
  getFavoriteNotes,
  getFavoriteReferenceId,
  migrateFavoritesRoomToUnencrypted,
  removeFavoriteMessage,
  removeFavoriteNote,
  removeFavoriteNotes,
  setFavoriteNote,
} from '../../../features/favorites';
import * as css from './Favorites.css';
import { CompactClientNavButton } from '../CompactClientNavButton';
import { getLinkedTimelines, getLiveTimeline } from '../../../features/room/RoomTimeline';
import { POLL_START_EVENT_TYPE, UNSTABLE_POLL_START_EVENT_TYPE } from '../../../utils/polls';

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

type FavoriteOpenSourceHandler = (sourceRoomId: string, sourceEventId?: string) => void;
type FavoriteSaveNoteHandler = (item: FavoriteItem, note: string) => Promise<void>;

const DAY_MS = 24 * 60 * 60 * 1000;
const FAVORITES_HISTORY_PAGINATION_LIMIT = 100;
const MAX_FAVORITES_HISTORY_PAGES = 250;

const DATE_FILTER_OPTIONS: Array<{ id: FavoriteDateFilter; label: string }> = [
  { id: 'all', label: '\u5168\u90e8\u65f6\u95f4' },
  { id: 'today', label: '\u4eca\u5929' },
  { id: '7d', label: '\u8fd1 7 \u5929' },
  { id: '30d', label: '\u8fd1 30 \u5929' },
  { id: '90d', label: '\u8fd1 90 \u5929' },
];

const getFavoriteCategoryText = (category: FavoriteCategory): string => {
  if (category === 'text') return '\u6587\u672c';
  if (category === 'image') return '\u56fe\u7247';
  if (category === 'video') return '\u89c6\u9891';
  if (category === 'audio') return '\u97f3\u9891';
  if (category === 'file') return '\u6587\u4ef6';
  if (category === 'poll') return '\u6295\u7968';

  return '\u5176\u4ed6';
};

const getPreferredCategory = (items: FavoriteItem[]): FavoriteCategory =>
  FAVORITE_CATEGORIES.find((category) => items.some((item) => item.category === category)) ??
  FAVORITE_CATEGORIES[0];

const ESCAPED_UNICODE_RE = /\\u[0-9a-f]{4}/i;
const hasEscapedUnicode = (value: string): boolean => ESCAPED_UNICODE_RE.test(value);

const getDateFilterLabel = (dateFilter: FavoriteDateFilter): string =>
  DATE_FILTER_OPTIONS.find((option) => option.id === dateFilter)?.label ?? '\u5168\u90e8\u65f6\u95f4';

const getStartOfToday = (): number => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
};

const getFavoriteItemId = (item: FavoriteItem): string => item.event.getId() ?? item.referenceId;

const FAVORITE_ACTION_BUTTON_STYLE = {
  minWidth: '132px',
  justifyContent: 'center',
} as const;

function FavoritesEmptyShell({ children }: { children: ReactNode }) {
  return (
    <Box
      className={css.GlassEmptyState}
      direction="Column"
      alignItems="Center"
      justifyContent="Center"
      gap="200"
    >
      {children}
    </Box>
  );
}

const getFavoriteItemBody = (event: MatrixEvent): string => {
  if (event.isRedacted()) return '';

  const body = typeof event.getContent().body === 'string' ? event.getContent().body : '';
  if (!body) return '';

  if (event.getType() === MessageEvent.RoomMessage) {
    return trimReplyFromBody(body).replace(/\s+/g, ' ').trim();
  }

  return body.replace(/\s+/g, ' ').trim();
};

const getFavoriteTimelineEvents = (room?: Room): MatrixEvent[] => {
  if (!room) return [];

  const seenEventIds = new Set<string>();
  const events: MatrixEvent[] = [];

  getLinkedTimelines(getLiveTimeline(room)).forEach((timeline) => {
    timeline.getEvents().forEach((event) => {
      const eventId = event.getId();
      if (eventId && seenEventIds.has(eventId)) return;

      if (eventId) {
        seenEventIds.add(eventId);
      }
      events.push(event);
    });
  });

  return events;
};

const loadFavoriteRoomHistory = async (mx: MatrixClient, room: Room) => {
  let timeline = getLiveTimeline(room);
  let pageCount = 0;

  if (room.hasEncryptionStateEvent()) {
    await decryptAllTimelineEvent(mx, timeline);
  }

  while (
    timeline.getPaginationToken(Direction.Backward) &&
    pageCount < MAX_FAVORITES_HISTORY_PAGES
  ) {
    const paginated = await mx.paginateEventTimeline(timeline, {
      backwards: true,
      limit: FAVORITES_HISTORY_PAGINATION_LIMIT,
    });
    if (!paginated) break;

    const previousTimeline = timeline.getNeighbouringTimeline(Direction.Backward);
    if (!previousTimeline || previousTimeline === timeline) break;

    timeline = previousTimeline;
    pageCount += 1;

    if (room.hasEncryptionStateEvent()) {
      await decryptAllTimelineEvent(mx, timeline);
    }
  }
};

const matchesDateFilter = (timestamp: number, dateFilter: FavoriteDateFilter): boolean => {
  if (dateFilter === 'all') return true;

  const now = Date.now();
  if (dateFilter === 'today') return timestamp >= getStartOfToday();
  if (dateFilter === '7d') return timestamp >= now - DAY_MS * 7;
  if (dateFilter === '30d') return timestamp >= now - DAY_MS * 30;

  return timestamp >= now - DAY_MS * 90;
};

const getFavoriteEvents = (room?: Room): FavoriteItem[] => {
  if (!room) return [];

  return getFavoriteTimelineEvents(room)
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
    const content = getFavoriteImageContent(item);
    const mediaUrl =
      typeof content?.file?.url === 'string'
        ? content.file.url
        : typeof content?.url === 'string'
          ? content.url
          : undefined;

    if (!content || !mediaUrl) return viewerItems;

    viewerItems.push({
      id: getFavoriteItemId(item),
      body: getFavoriteDisplayTitle(item),
      mimeType: typeof content.info?.mimetype === 'string' ? content.info.mimetype : undefined,
      url: mediaUrl,
      info: content.info,
      encInfo: content.file,
    });

    return viewerItems;
  }, []);

const getCategoryCount = (items: FavoriteItem[], category: FavoriteCategory): number =>
  items.filter((item) => item.category === category).length;

const getFavoriteGroups = (
  items: FavoriteItem[],
  activeCategory: FavoriteCategory
): FavoriteGroup[] => {
  return [
    {
      category: activeCategory,
      items: items.filter((item) => item.category === activeCategory),
    },
  ];
};

const isGalleryCategory = (
  category: FavoriteCategory
): category is Extract<FavoriteCategory, 'image' | 'video'> =>
  category === 'image' || category === 'video';

const getFavoriteDisplayTitle = (item: FavoriteItem): string => {
  const content = item.event.getContent();
  const filename = typeof content.filename === 'string' ? content.filename.trim() : '';
  if (filename) return filename;

  const body = typeof content.body === 'string' ? trimReplyFromBody(content.body).trim() : '';
  if (body) return body;

  return getFavoriteCategoryText(item.category);
};

const getFavoriteSavedAt = (timestamp: number): string => new Date(timestamp).toLocaleString();

const getFavoriteTimelineText = (item: FavoriteItem): string =>
  `原消息 ${getFavoriteSavedAt(item.metadata.sourceTimestamp)} · 收藏于 ${getFavoriteSavedAt(item.metadata.favoritedAt)}`;

function getFavoriteImageContent(item: FavoriteItem): IImageContent | undefined {
  const content = item.event.getContent() as Partial<IImageContent>;
  const mediaUrl =
    typeof content.file?.url === 'string'
      ? content.file.url
      : typeof content.url === 'string'
        ? content.url
        : undefined;

  if (!mediaUrl) return undefined;
  if (item.event.getType() !== MessageEvent.Sticker && content.msgtype !== MsgType.Image) {
    return undefined;
  }

  return content as IImageContent;
}

function getFavoriteVideoContent(item: FavoriteItem): IVideoContent | undefined {
  const content = item.event.getContent() as Partial<IVideoContent>;
  const mediaUrl =
    typeof content.file?.url === 'string'
      ? content.file.url
      : typeof content.url === 'string'
        ? content.url
        : undefined;

  if (!mediaUrl || content.msgtype !== MsgType.Video) return undefined;
  return content as IVideoContent;
}

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
    <FavoritesEmptyShell>
      <PageHeroSection>
        <PageHero
          icon={
            loading ? (
              <Spinner size="600" variant="Secondary" />
            ) : (
              <Icon size="600" src={Icons.Heart} filled />
            )
          }
          title={hasRoom ? '\u8fd8\u6ca1\u6709\u6536\u85cf\u5185\u5bb9' : '\u5148\u521b\u5efa\u4f60\u7684\u6536\u85cf\u7a7a\u95f4'}
          subTitle={
            hasRoom
              ? '\u5728\u6d88\u606f\u4e0a\u6267\u884c\u6536\u85cf\u540e\uff0c\u5185\u5bb9\u4f1a\u540c\u6b65\u51fa\u73b0\u5728\u8fd9\u91cc\u3002'
              : '\u7cfb\u7edf\u4f1a\u4e3a\u4f60\u521b\u5efa\u4e00\u4e2a\u4ec5\u81ea\u5df1\u53ef\u89c1\u7684\u6536\u85cf\u623f\u95f4\uff0c\u7528\u6765\u4fdd\u5b58\u6536\u85cf\u6d88\u606f\u7684\u526f\u672c\u3002'
          }
        >
          {!hasRoom && (
            <Box justifyContent="Center">
              <Button onClick={onCreate} disabled={loading}>
                {loading && <Spinner size="200" variant="Secondary" />}
                <Text size="B400">
                  {loading ? '\u521b\u5efa\u4e2d...' : '\u521b\u5efa\u6536\u85cf\u7a7a\u95f4'}
                </Text>
              </Button>
            </Box>
          )}
        </PageHero>
      </PageHeroSection>
    </FavoritesEmptyShell>
  );
}

function FavoriteNoteEditor({
  note,
  onSave,
  children,
}: {
  note?: string;
  onSave: (note: string) => Promise<void>;
  children: (props: { content: ReactNode; trigger: ReactNode | null }) => ReactNode;
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
      .then(() => setEditing(false))
      .catch(() => undefined);
  };

  const hasNote = Boolean(note?.trim());
  const trigger = !editing ? (
    <Button
      size="300"
      variant="Secondary"
      fill="Soft"
      radii="Pill"
      style={FAVORITE_ACTION_BUTTON_STYLE}
      onClick={() => setEditing(true)}
    >
      <Text size="B300">{hasNote ? '编辑备注' : '添加备注'}</Text>
    </Button>
  ) : null;

  const content = editing ? (
    <Box className={css.NoteCard} direction="Column" gap="200">
      <Text size="T200" priority="300">
        备注
      </Text>
      <Input
        size="300"
        variant="Secondary"
        radii="300"
        placeholder="输入备注，可同时搜索到收藏内容和备注"
        value={draftNote}
        onChange={(evt: React.ChangeEvent<HTMLInputElement>) => setDraftNote(evt.target.value)}
        onKeyDown={(evt: React.KeyboardEvent<HTMLInputElement>) => {
          if (evt.key !== 'Enter') return;
          evt.preventDefault();
          handleSave();
        }}
      />
      <Box className={css.ActionRow}>
        <Button
          size="300"
          variant="Primary"
          radii="Pill"
          style={FAVORITE_ACTION_BUTTON_STYLE}
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
          radii="Pill"
          style={FAVORITE_ACTION_BUTTON_STYLE}
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
            radii="Pill"
            style={FAVORITE_ACTION_BUTTON_STYLE}
            onClick={() => {
              setDraftNote('');
              saveNote('')
                .then(() => setEditing(false))
                .catch(() => undefined);
            }}
            disabled={saveState.status === AsyncStatus.Loading}
          >
            <Text size="B300">清空备注</Text>
          </Button>
        )}
      </Box>
    </Box>
  ) : hasNote ? (
    <Box className={css.NoteCard} direction="Column" gap="150">
      <Text size="T200" priority="300">
        备注
      </Text>
      <Text className={css.NoteText} size="T300">
        {note}
      </Text>
    </Box>
  ) : null;

  return <>{children({ content, trigger })}</>;
}

function FavoriteMediaDetails({
  item,
  note,
  onSaveNote,
  onOpenSource,
  onRemoveFavorite,
}: {
  item: FavoriteItem;
  note?: string;
  onSaveNote: FavoriteSaveNoteHandler;
  onOpenSource: FavoriteOpenSourceHandler;
  onRemoveFavorite?: (item: FavoriteItem) => Promise<void>;
}) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const sourceRoomAvailable = Boolean(mx.getRoom(item.metadata.sourceRoomId));
  const senderId = item.metadata.sourceSenderId ?? item.event.getSender() ?? item.metadata.sourceRoomId;
  const avatarUrl = item.metadata.sourceSenderAvatarMxc
    ? mxcUrlToHttp(mx, item.metadata.sourceSenderAvatarMxc, useAuthentication, 40, 40, 'crop') ??
      undefined
    : undefined;
  const [removeState, removeFavorite] = useAsyncCallback(
    useCallback(async () => {
      if (!onRemoveFavorite) return;
      await onRemoveFavorite(item);
    }, [item, onRemoveFavorite])
  );

  return (
    <Box direction="Column" gap="300">
      <Box gap="250" alignItems="Start">
        <AvatarBase>
          <Avatar size="300">
            <UserAvatar
              userId={senderId}
              src={avatarUrl}
              alt={item.metadata.sourceSenderName}
              renderFallback={() => <Icon size="200" src={Icons.User} filled />}
            />
          </Avatar>
        </AvatarBase>

        <Box className={css.MetaStack} grow="Yes">
          <Box direction="Column" gap="100" style={{ minWidth: 0 }}>
            <Box className={css.MetaLine}>
              <Username>
                <Text as="span" truncate>
                  <UsernameBold>{item.metadata.sourceSenderName}</UsernameBold>
                </Text>
              </Username>
            </Box>
            <Text size="T200" priority="300">
              {getFavoriteTimelineText(item)}
            </Text>
          </Box>
          <Text size="T200" priority="300">
            {`${item.metadata.sourceRoomName} · ${getFavoriteCategoryText(item.category)}`}
          </Text>
          <Text size="H4" style={{ wordBreak: 'break-word' }}>
            {getFavoriteDisplayTitle(item)}
          </Text>
        </Box>
      </Box>

      <FavoriteNoteEditor note={note} onSave={(nextNote) => onSaveNote(item, nextNote)}>
        {({ content, trigger }) => (
          <>
            <Box className={css.ActionRow}>
              {trigger}
              {sourceRoomAvailable && (
                <Button
                  size="300"
                  variant="Secondary"
                  fill="Soft"
                  radii="Pill"
                  style={FAVORITE_ACTION_BUTTON_STYLE}
                  onClick={() => onOpenSource(item.metadata.sourceRoomId, item.metadata.sourceEventId)}
                >
                  <Text size="B300">原消息</Text>
                </Button>
              )}
              {onRemoveFavorite && (
                <Button
                  size="300"
                  variant="Secondary"
                  fill="Soft"
                  radii="Pill"
                  style={FAVORITE_ACTION_BUTTON_STYLE}
                  onClick={() => {
                    if (removeState.status === AsyncStatus.Loading) return;
                    removeFavorite().catch(() => undefined);
                  }}
                  disabled={removeState.status === AsyncStatus.Loading}
                >
                  {removeState.status === AsyncStatus.Loading && (
                    <Spinner size="200" variant="Secondary" />
                  )}
                  <Text size="B300">
                    {removeState.status === AsyncStatus.Loading ? '取消中...' : '取消收藏'}
                  </Text>
                </Button>
              )}
            </Box>
            {content}
          </>
        )}
      </FavoriteNoteEditor>
    </Box>
  );
}

function FavoriteVideoViewerModal({
  open,
  item,
  note,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onSaveNote,
  onOpenSource,
  onRemoveFavorite,
  requestClose,
}: {
  open: boolean;
  item: FavoriteItem;
  note?: string;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onSaveNote: FavoriteSaveNoteHandler;
  onOpenSource: FavoriteOpenSourceHandler;
  onRemoveFavorite: (item: FavoriteItem) => Promise<void>;
  requestClose: () => void;
}) {
  const content = getFavoriteVideoContent(item);
  const info = content?.info as (IVideoInfo & IThumbnailContent) | undefined;
  const mediaUrl =
    typeof content?.file?.url === 'string'
      ? content.file.url
      : typeof content?.url === 'string'
        ? content.url
        : undefined;
  const mimeType = typeof info?.mimetype === 'string' ? info.mimetype : '';

  if (!content || !info || !mediaUrl || !mimeType) return null;

  return (
    <Overlay open={open} backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            fallbackFocus: () => document.body,
            onDeactivate: requestClose,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Modal
            className={ModalWide}
            size="500"
            variant="Background"
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: 'min(96vw, 1320px)',
              minWidth: 'min(96vw, 1320px)',
              height: 'min(92vh, 920px)',
              minHeight: 'min(92vh, 920px)',
              maxHeight: 'min(92vh, 920px)',
              padding: 0,
              background: 'transparent',
              boxShadow: 'none',
              border: 'none',
              overflow: 'hidden',
            }}
          >
            <Box className={css.ViewerShell}>
              <Box className={css.ViewerStageCard}>
                <Box className={css.VideoViewer}>
                  <Box className={css.VideoViewerHeader}>
                    <Box direction="Column" gap="100" grow="Yes" style={{ minWidth: 0 }}>
                      <Text size="H4" truncate>
                        {getFavoriteDisplayTitle(item)}
                      </Text>
                      <Text size="T200" priority="300">
                        {item.metadata.sourceSenderName}
                      </Text>
                    </Box>

                    <Box shrink="No" gap="200" wrap="Wrap">
                      {onPrev && (
                        <Button
                          size="300"
                          variant="Secondary"
                          fill="Soft"
                          radii="300"
                          onClick={onPrev}
                          disabled={!canPrev}
                        >
                          <Text size="B300">{'\u4e0a\u4e00\u6761'}</Text>
                        </Button>
                      )}
                      {onNext && (
                        <Button
                          size="300"
                          variant="Secondary"
                          fill="Soft"
                          radii="300"
                          onClick={onNext}
                          disabled={!canNext}
                        >
                          <Text size="B300">{'\u4e0b\u4e00\u6761'}</Text>
                        </Button>
                      )}
                      <Button
                        size="300"
                        variant="Secondary"
                        fill="Soft"
                        radii="300"
                        onClick={requestClose}
                      >
                        <Text size="B300">{'\u5173\u95ed'}</Text>
                      </Button>
                    </Box>
                  </Box>

                  <Box className={css.VideoViewerStage}>
                    <Box className={css.VideoViewerViewport}>
                      <VideoContent
                        body={getFavoriteDisplayTitle(item)}
                        info={info}
                        mimeType={mimeType}
                        url={mediaUrl}
                        encInfo={content.file}
                        autoPlay
                        markedAsSpoiler={content[MATRIX_SPOILER_PROPERTY_NAME]}
                        spoilerReason={content[MATRIX_SPOILER_REASON_PROPERTY_NAME]}
                        renderThumbnail={() => (
                          <ThumbnailContent
                            info={info}
                            renderImage={(src) => (
                              <Image
                                alt={getFavoriteDisplayTitle(item)}
                                title={getFavoriteDisplayTitle(item)}
                                src={src}
                                loading="lazy"
                                className={css.MediaPreviewImage}
                              />
                            )}
                          />
                        )}
                        renderVideo={(props) => <Video {...props} />}
                      />
                    </Box>
                  </Box>
                </Box>
              </Box>

              <Box className={css.ViewerDetailsCard}>
                <FavoriteMediaDetails
                  item={item}
                  note={note}
                  onSaveNote={onSaveNote}
                  onOpenSource={onOpenSource}
                  onRemoveFavorite={async (targetItem) => {
                    await onRemoveFavorite(targetItem);
                    requestClose();
                  }}
                />
              </Box>
            </Box>
          </Modal>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

function FavoriteImageCard({
  item,
  selected,
  selectionMode,
  imageViewerItems,
  onToggleSelect,
}: {
  item: FavoriteItem;
  selected: boolean;
  selectionMode: boolean;
  imageViewerItems: ViewerImageItem[];
  onToggleSelect: () => void;
}) {
  const content = getFavoriteImageContent(item);
  const mediaUrl =
    typeof content?.file?.url === 'string'
      ? content.file.url
      : typeof content?.url === 'string'
        ? content.url
        : undefined;
  const mimeType =
    typeof content?.info?.mimetype === 'string' ? content.info.mimetype : undefined;

  if (!content || !mediaUrl) return null;

  return (
    <Box direction="Column" gap="250" className={css.MediaCard}>
      <Box
        className={css.MediaPreview}
        style={
          selectionMode && selected
            ? { boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.42)' }
            : undefined
        }
      >
        <ImageContent
          body={getFavoriteDisplayTitle(item)}
          info={content.info}
          mimeType={mimeType}
          url={mediaUrl}
          encInfo={content.file}
          autoPlay
          previewMediaStrategy="stable"
          viewerItems={imageViewerItems}
          viewerItemId={getFavoriteItemId(item)}
          markedAsSpoiler={content[MATRIX_SPOILER_PROPERTY_NAME]}
          spoilerReason={content[MATRIX_SPOILER_REASON_PROPERTY_NAME]}
          renderViewer={(viewerProps) => <ImageViewer {...viewerProps} />}
          renderImage={({ alt, title, src, onLoad, onError, onClick, tabIndex }) => (
            <button
              type="button"
              className={css.MediaPreviewButton}
              onClick={onClick}
              tabIndex={tabIndex}
            >
              <Image
                alt={alt}
                title={title}
                src={src}
                loading="eager"
                decoding="async"
                className={css.MediaPreviewImage}
                onLoad={onLoad}
                onError={onError}
              />
              <Box className={css.MediaPreviewOverlay} />
            </button>
          )}
        />
        {selectionMode && (
          <Box
            className={css.MediaCheckbox}
            onClick={(evt: React.MouseEvent) => {
              evt.stopPropagation();
              onToggleSelect();
            }}
          >
            <Checkbox checked={selected} size="50" variant="Primary" />
          </Box>
        )}
      </Box>
    </Box>
  );
}

function FavoriteVideoCard({
  item,
  selected,
  selectionMode,
  videoItems,
  favoriteNotes,
  onToggleSelect,
  onOpenSource,
  onRemoveFavorite,
  onSaveNote,
}: {
  item: FavoriteItem;
  selected: boolean;
  selectionMode: boolean;
  videoItems: FavoriteItem[];
  favoriteNotes: Record<string, string>;
  onToggleSelect: () => void;
  onOpenSource: FavoriteOpenSourceHandler;
  onRemoveFavorite: (item: FavoriteItem) => Promise<void>;
  onSaveNote: FavoriteSaveNoteHandler;
}) {
  const content = getFavoriteVideoContent(item);
  const info = content?.info as (IVideoInfo & IThumbnailContent) | undefined;
  const [viewerItemId, setViewerItemId] = useState<string>();

  if (!content || !info) return null;

  const currentItemId = getFavoriteItemId(item);
  const defaultIndex = Math.max(
    videoItems.findIndex((entry) => getFavoriteItemId(entry) === currentItemId),
    0
  );
  const activeIndex = viewerItemId
    ? Math.max(
        videoItems.findIndex((entry) => getFavoriteItemId(entry) === viewerItemId),
        defaultIndex
      )
    : defaultIndex;
  const activeViewerItem = videoItems[activeIndex] ?? item;
  const viewerOpen = typeof viewerItemId === 'string';

  return (
    <>
      <Box direction="Column" gap="250" className={css.MediaCard}>
        <Box
          className={css.MediaPreview}
          style={
            selectionMode && selected
              ? { boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.42)' }
              : undefined
          }
        >
          <button
            type="button"
            className={css.MediaPreviewButton}
            onClick={() => setViewerItemId(currentItemId)}
          >
            <ThumbnailContent
              info={info}
              renderImage={(src) => (
                <Image
                  alt={getFavoriteDisplayTitle(item)}
                  title={getFavoriteDisplayTitle(item)}
                  src={src}
                  loading="lazy"
                  className={css.MediaPreviewImage}
                />
              )}
            />
            <Box className={css.MediaPreviewOverlay} />
            <Box className={css.MediaPlayBadge}>
              <Box className={css.MediaPlayBadgeInner}>
                <Icon size="400" src={Icons.Play} filled />
              </Box>
            </Box>
          </button>
          {selectionMode && (
            <Box
              className={css.MediaCheckbox}
              onClick={(evt: React.MouseEvent) => {
                evt.stopPropagation();
                onToggleSelect();
              }}
            >
              <Checkbox checked={selected} size="50" variant="Primary" />
            </Box>
          )}
        </Box>
      </Box>

      <FavoriteVideoViewerModal
        open={viewerOpen}
        item={activeViewerItem}
        note={favoriteNotes[activeViewerItem.referenceId]}
        canPrev={activeIndex > 0}
        canNext={activeIndex < videoItems.length - 1}
        onPrev={
          activeIndex > 0
            ? () => setViewerItemId(getFavoriteItemId(videoItems[activeIndex - 1]))
            : undefined
        }
        onNext={
          activeIndex < videoItems.length - 1
            ? () => setViewerItemId(getFavoriteItemId(videoItems[activeIndex + 1]))
            : undefined
        }
        onSaveNote={onSaveNote}
        onOpenSource={onOpenSource}
        onRemoveFavorite={onRemoveFavorite}
        requestClose={() => setViewerItemId(undefined)}
      />
    </>
  );
}

function FavoriteCard({
  item,
  note,
  selected,
  selectionMode,
  renderMatrixEvent,
  onToggleSelect,
  onOpenSource,
  onRemoveFavorite,
  onSaveNote,
}: {
  item: FavoriteItem;
  note?: string;
  selected: boolean;
  selectionMode: boolean;
  renderMatrixEvent: (
    eventType: string,
    isStateEvent: boolean,
    event: MatrixEvent,
    displayName: string,
    getContent: GetContentCallback
  ) => ReactNode;
  onToggleSelect: () => void;
  onOpenSource: FavoriteOpenSourceHandler;
  onRemoveFavorite: (item: FavoriteItem) => Promise<void>;
  onSaveNote: FavoriteSaveNoteHandler;
}) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const sourceRoomAvailable = Boolean(mx.getRoom(item.metadata.sourceRoomId));
  const senderId = item.metadata.sourceSenderId ?? item.event.getSender() ?? item.metadata.sourceRoomId;
  const avatarUrl = item.metadata.sourceSenderAvatarMxc
    ? mxcUrlToHttp(mx, item.metadata.sourceSenderAvatarMxc, useAuthentication, 48, 48, 'crop') ??
      undefined
    : undefined;
  const getContent = (() => item.event.getContent()) as GetContentCallback;

  const [removeState, removeFavorite] = useAsyncCallback(
    useCallback(() => onRemoveFavorite(item), [item, onRemoveFavorite])
  );

  return (
    <SequenceCard
      className={selectionMode && selected ? css.GlassCardSelected : css.GlassCard}
      variant={selectionMode && selected ? 'Secondary' : 'Background'}
      direction="Column"
      gap="250"
      style={{ padding: config.space.S400 }}
    >
      <Box gap="300" alignItems="Start">
        <AvatarBase>
          <Avatar size="300">
            <UserAvatar
              userId={senderId}
              src={avatarUrl}
              alt={item.metadata.sourceSenderName}
              renderFallback={() => <Icon size="200" src={Icons.User} filled />}
            />
          </Avatar>
        </AvatarBase>

        <Box className={css.CardStack} grow="Yes" style={{ minWidth: 0 }}>
          <Box gap="300" justifyContent="SpaceBetween" alignItems="Start" grow="Yes">
            <Box className={css.MetaStack} grow="Yes">
              <Box direction="Column" gap="100" style={{ minWidth: 0 }}>
                <Box className={css.MetaLine}>
                  <Username>
                    <Text as="span" truncate>
                      <UsernameBold>{item.metadata.sourceSenderName}</UsernameBold>
                    </Text>
                  </Username>
                </Box>
                <Text size="T200" priority="300">
                  {getFavoriteTimelineText(item)}
                </Text>
              </Box>
              <Text size="T200" priority="300">
                {note
                  ? `${item.metadata.sourceRoomName} · 已备注`
                  : item.metadata.sourceRoomName}
              </Text>
            </Box>

            {selectionMode && (
              <Box shrink="No">
                <Checkbox checked={selected} onClick={onToggleSelect} size="50" variant="Primary" />
              </Box>
            )}
          </Box>

          <Box className={css.MessageContentCard}>
            {renderMatrixEvent(
              item.event.getType(),
              false,
              item.event,
              item.metadata.sourceSenderName,
              getContent
            )}
          </Box>
          <FavoriteNoteEditor note={note} onSave={(nextNote) => onSaveNote(item, nextNote)}>
            {({ content, trigger }) => (
              <>
                <Box className={css.ActionRow}>
                  {trigger}
                  {sourceRoomAvailable && (
                    <Button
                      size="300"
                      variant="Secondary"
                      fill="Soft"
                      radii="Pill"
                      style={FAVORITE_ACTION_BUTTON_STYLE}
                      onClick={() =>
                        onOpenSource(item.metadata.sourceRoomId, item.metadata.sourceEventId)
                      }
                    >
                      <Text size="B300">原消息</Text>
                    </Button>
                  )}
                  <Button
                    size="300"
                    variant="Secondary"
                    fill="Soft"
                    radii="Pill"
                    style={FAVORITE_ACTION_BUTTON_STYLE}
                    onClick={() => {
                      if (removeState.status === AsyncStatus.Loading) return;
                      void removeFavorite().catch(() => undefined);
                    }}
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
                {content}
              </>
            )}
          </FavoriteNoteEditor>
        </Box>
      </Box>
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

  const [activeCategory, setActiveCategory] = useState<FavoriteCategory>(FAVORITE_CATEGORIES[0]);
  const [dateFilter, setDateFilter] = useState<FavoriteDateFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFavoriteIds, setSelectedFavoriteIds] = useState<string[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);
  const [didInitCategory, setDidInitCategory] = useState(false);
  const [favoriteNotes, setFavoriteNotesState] = useState<Record<string, string>>(() =>
    getFavoriteNotes(favoriteNotesEvent?.getContent<CinnyFavoriteNotesContent>())
  );

  const [createFavoritesState, createFavoritesRoom] = useAsyncCallback(
    useCallback(() => ensureFavoritesRoom(mx), [mx])
  );
  const [migrateFavoritesState, migrateFavoritesRoom] = useAsyncCallback(
    useCallback(() => migrateFavoritesRoomToUnencrypted(mx), [mx])
  );

  useEffect(() => {
    setFavoriteNotesState(
      getFavoriteNotes(favoriteNotesEvent?.getContent<CinnyFavoriteNotesContent>())
    );
  }, [favoriteNotesEvent]);

  useEffect(() => {
    if (!favoritesRoom) {
      setFavoriteItems([]);
      return undefined;
    }

    const refresh = () => {
      setFavoriteItems(getFavoriteEvents(favoritesRoom));
    };
    const handleDecrypted = (event: MatrixEvent) => {
      if (event.getRoomId() !== favoritesRoom.roomId) return;
      refresh();
    };

    refresh();
    favoritesRoom.on(RoomEvent.Timeline, refresh);
    favoritesRoom.on(RoomEvent.TimelineRefresh, refresh);
    favoritesRoom.on(RoomEvent.Redaction, refresh);
    mx.on(MatrixEventEvent.Decrypted, handleDecrypted);

    return () => {
      favoritesRoom.removeListener(RoomEvent.Timeline, refresh);
      favoritesRoom.removeListener(RoomEvent.TimelineRefresh, refresh);
      favoritesRoom.removeListener(RoomEvent.Redaction, refresh);
      mx.off(MatrixEventEvent.Decrypted, handleDecrypted);
    };
  }, [favoritesRoom, mx]);

  useEffect(() => {
    if (!favoritesRoom) return undefined;

    let cancelled = false;

    const hydrateHistory = async () => {
      try {
        await loadFavoriteRoomHistory(mx, favoritesRoom);
      } catch (error) {
        console.error(error);
      }

      if (!cancelled) {
        setFavoriteItems(getFavoriteEvents(favoritesRoom));
      }
    };

    void hydrateHistory();

    return () => {
      cancelled = true;
    };
  }, [favoritesRoom, mx]);

  useEffect(() => {
    const availableIds = new Set(favoriteItems.map(getFavoriteItemId));
    setSelectedFavoriteIds((currentIds) => currentIds.filter((id) => availableIds.has(id)));
  }, [favoriteItems]);

  useEffect(() => {
    if (didInitCategory) return;
    if (favoriteItems.length === 0) return;

    setActiveCategory(getPreferredCategory(favoriteItems));
    setDidInitCategory(true);
  }, [didInitCategory, favoriteItems]);

  useEffect(() => {
    if (!filtersOpen) return;
    if (!hasEscapedUnicode(searchQuery)) return;

    setSearchQuery('');
  }, [filtersOpen, searchQuery]);

  const mentionRoomId = favoritesRoom?.roomId ?? '';
  const mentionClickHandler = useMentionClickHandler(mentionRoomId);
  const spoilerClickHandler = useSpoilerClickHandler();

  const linkifyOpts = useMemo<LinkifyOpts>(
    () => ({
      ...LINKIFY_OPTS,
      render: factoryRenderLinkifyWithMention((href) =>
        renderMatrixMention(mx, mentionRoomId, href, makeMentionCustomProps(mentionClickHandler))
      ),
    }),
    [mx, mentionRoomId, mentionClickHandler]
  );

  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, mentionRoomId, {
        linkifyOpts,
        useAuthentication,
        handleSpoilerClick: spoilerClickHandler,
        handleMentionClick: mentionClickHandler,
      }),
    [
      mx,
      mentionRoomId,
      linkifyOpts,
      useAuthentication,
      mentionClickHandler,
      spoilerClickHandler,
    ]
  );

  const filteredBySearchAndDate = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return favoriteItems.filter((item) => {
      if (!matchesDateFilter(item.metadata.favoritedAt, dateFilter)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const note = favoriteNotes[item.referenceId] ?? '';
      const searchableText = [
        getFavoriteDisplayTitle(item),
        item.searchBody,
        note,
        item.metadata.sourceRoomName,
        item.metadata.sourceSenderName,
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [favoriteItems, favoriteNotes, searchQuery, dateFilter]);

  const categoryCounts = useMemo(() => {
    const counts = {} as Record<FavoriteCategory, number>;
    FAVORITE_CATEGORIES.forEach((category) => {
      counts[category] = getCategoryCount(filteredBySearchAndDate, category);
    });
    return counts;
  }, [filteredBySearchAndDate]);

  const favoriteGroups = useMemo(
    () => getFavoriteGroups(filteredBySearchAndDate, activeCategory),
    [filteredBySearchAndDate, activeCategory]
  );

  const visibleItems = useMemo(
    () => favoriteGroups.flatMap((group) => group.items),
    [favoriteGroups]
  );

  const favoriteItemsMap = useMemo(
    () => new Map(favoriteItems.map((item) => [getFavoriteItemId(item), item])),
    [favoriteItems]
  );

  const imageViewerItems = useMemo(
    () => getFavoriteImageViewerItems(visibleItems.filter((item) => item.category === 'image')),
    [visibleItems]
  );

  const visibleVideoItems = useMemo(
    () => visibleItems.filter((item) => item.category === 'video'),
    [visibleItems]
  );

  const visibleItemIds = useMemo(() => visibleItems.map(getFavoriteItemId), [visibleItems]);
  const visibleItemIdSet = useMemo(() => new Set(visibleItemIds), [visibleItemIds]);

  const selectedItems = useMemo(
    () =>
      selectedFavoriteIds
        .map((itemId) => favoriteItemsMap.get(itemId))
        .filter((item): item is FavoriteItem => item !== undefined),
    [favoriteItemsMap, selectedFavoriteIds]
  );

  const visibleSelectedCount = useMemo(
    () => selectedFavoriteIds.filter((itemId) => visibleItemIdSet.has(itemId)).length,
    [selectedFavoriteIds, visibleItemIdSet]
  );

  const allVisibleSelected =
    visibleItemIds.length > 0 && visibleSelectedCount === visibleItemIds.length;
  const hasSelection = selectedFavoriteIds.length > 0;
  const hasAdvancedFilters = dateFilter !== 'all' || searchQuery.trim().length > 0;
  const hasActiveFilters = hasAdvancedFilters;

  const renderPollStartEvent = (
    event: MatrixEvent,
    displayName: string,
    getContent: GetContentCallback
  ) => (
    <RenderMessageContent
      displayName={displayName}
      msgType={event.getContent().msgtype ?? ''}
      eventType={event.getType()}
      ts={event.getTs()}
      edited={Boolean(event.replacingEvent())}
      getContent={getContent}
      mediaAutoLoad={mediaAutoLoad}
      urlPreview={urlPreview}
      htmlReactParserOptions={htmlReactParserOptions}
      linkifyOpts={linkifyOpts}
      outlineAttachment
      room={favoritesRoom}
      eventId={event.getId() ?? undefined}
      imageViewerItems={imageViewerItems}
    />
  );

  const renderMatrixEvent = useMatrixEventRenderer<[MatrixEvent, string, GetContentCallback]>(
    {
      [POLL_START_EVENT_TYPE]: renderPollStartEvent,
      [UNSTABLE_POLL_START_EVENT_TYPE]: renderPollStartEvent,
      [MessageEvent.RoomMessage]: (event, displayName, getContent) => (
        <RenderMessageContent
          displayName={displayName}
          msgType={event.getContent().msgtype ?? ''}
          eventType={event.getType()}
          ts={event.getTs()}
          edited={Boolean(event.replacingEvent())}
          getContent={getContent}
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
      [MessageEvent.Sticker]: (event, _displayName, getContent) => (
        <MSticker
          content={getContent()}
          renderImageContent={(props) => (
            <ImageContent
              {...props}
              autoPlay={mediaAutoLoad}
              previewMediaStrategy="stable"
              viewerItems={imageViewerItems}
              viewerItemId={event.getId() ?? undefined}
              renderImage={(renderProps) => (
                <Image
                  alt={renderProps.alt}
                  title={renderProps.title}
                  src={renderProps.src}
                  loading={mediaAutoLoad ? 'eager' : 'lazy'}
                  decoding="async"
                  onLoad={renderProps.onLoad}
                  onError={renderProps.onError}
                  onClick={renderProps.onClick}
                />
              )}
              renderViewer={(viewerProps) => <ImageViewer {...viewerProps} />}
            />
          )}
        />
      ),
    },
    undefined,
    (event) => (
      <Box direction="Column">
        <Text size="T300" priority="300">
          {`${event.getType()} \u6682\u4e0d\u652f\u6301\u5728\u6536\u85cf\u4e2d\u9884\u89c8`}
        </Text>
      </Box>
    )
  );

  const removeItemsFromLocalState = useCallback((itemsToRemove: FavoriteItem[]) => {
    if (itemsToRemove.length === 0) return;

    const removedIds = new Set(itemsToRemove.map(getFavoriteItemId));
    const removedReferences = new Set(itemsToRemove.map((item) => item.referenceId));

    setFavoriteItems((items) => items.filter((item) => !removedIds.has(getFavoriteItemId(item))));
    setSelectedFavoriteIds((itemIds) => itemIds.filter((itemId) => !removedIds.has(itemId)));
    setFavoriteNotesState((notes) => {
      const nextNotes = { ...notes };
      removedReferences.forEach((referenceId) => {
        delete nextNotes[referenceId];
      });
      return nextNotes;
    });
  }, []);

  const handleOpenSource = useCallback<FavoriteOpenSourceHandler>(
    (sourceRoomId, sourceEventId) => {
      if (!mx.getRoom(sourceRoomId)) return;
      navigateRoom(sourceRoomId, sourceEventId);
    },
    [mx, navigateRoom]
  );

  const handleToggleSelect = useCallback((item: FavoriteItem) => {
    const itemId = getFavoriteItemId(item);
    setSelectedFavoriteIds((currentIds) => {
      if (currentIds.includes(itemId)) {
        return currentIds.filter((id) => id !== itemId);
      }
      return [...currentIds, itemId];
    });
  }, []);

  const handleToggleSelectVisible = useCallback(() => {
    if (visibleItemIds.length === 0) return;

    setSelectedFavoriteIds((currentIds) => {
      if (visibleItemIds.every((itemId) => currentIds.includes(itemId))) {
        return currentIds.filter((itemId) => !visibleItemIdSet.has(itemId));
      }

      const nextIds = new Set(currentIds);
      visibleItemIds.forEach((itemId) => nextIds.add(itemId));
      return Array.from(nextIds);
    });
  }, [visibleItemIds, visibleItemIdSet]);

  const handleClearSelection = useCallback(() => {
    setSelectedFavoriteIds([]);
  }, []);

  const handleToggleAdvanced = useCallback(() => {
    if (filtersOpen) {
      setSelectedFavoriteIds([]);
      setFiltersOpen(false);
      return;
    }

    if (hasEscapedUnicode(searchQuery)) {
      setSearchQuery('');
    }
    setFiltersOpen(true);
  }, [filtersOpen, searchQuery]);

  const handleResetFilters = useCallback(() => {
    setActiveCategory(getPreferredCategory(favoriteItems));
    setDateFilter('all');
    setSearchQuery('');
  }, [favoriteItems]);

  const handleSaveNote = useCallback<FavoriteSaveNoteHandler>(
    async (item, note) => {
      const referenceId = item.referenceId;
      const previousNote = favoriteNotes[referenceId];

      setFavoriteNotesState((notes) => {
        const nextNotes = { ...notes };
        const trimmedNote = note.trim();
        if (trimmedNote) {
          nextNotes[referenceId] = trimmedNote;
        } else {
          delete nextNotes[referenceId];
        }
        return nextNotes;
      });

      try {
        await setFavoriteNote(mx, item.metadata.sourceRoomId, item.metadata.sourceEventId, note);
      } catch (error) {
        setFavoriteNotesState((notes) => {
          const nextNotes = { ...notes };
          if (previousNote) {
            nextNotes[referenceId] = previousNote;
          } else {
            delete nextNotes[referenceId];
          }
          return nextNotes;
        });
        throw error;
      }
    },
    [favoriteNotes, mx]
  );

  const handleRemoveFavorite = useCallback(
    async (item: FavoriteItem) => {
      if (!favoritesRoom) return;

      const eventId = item.event.getId();
      if (!eventId) return;

      await removeFavoriteMessage(mx, favoritesRoom.roomId, eventId);
      await removeFavoriteNote(mx, item.metadata.sourceRoomId, item.metadata.sourceEventId);
      removeItemsFromLocalState([item]);
    },
    [favoritesRoom, mx, removeItemsFromLocalState]
  );

  const [batchRemoveState, batchRemoveFavorites] = useAsyncCallback(
    useCallback(
      async (itemsToRemove: FavoriteItem[]) => {
        if (!favoritesRoom || itemsToRemove.length === 0) return;

        await Promise.all(
          itemsToRemove.map(async (item) => {
            const eventId = item.event.getId();
            if (!eventId) return;
            await removeFavoriteMessage(mx, favoritesRoom.roomId, eventId);
          })
        );

        await removeFavoriteNotes(
          mx,
          itemsToRemove.map((item) => ({
            sourceRoomId: item.metadata.sourceRoomId,
            sourceEventId: item.metadata.sourceEventId,
          }))
        );
      },
      [favoritesRoom, mx]
    )
  );

  const handleBatchRemove = () => {
    if (batchRemoveState.status === AsyncStatus.Loading || selectedItems.length === 0) return;

    batchRemoveFavorites(selectedItems)
      .then(() => {
        removeItemsFromLocalState(selectedItems);
      })
      .catch(() => undefined);
  };

  const handleCreateFavorites = () => {
    if (createFavoritesState.status === AsyncStatus.Loading) return;
    void createFavoritesRoom().catch(() => undefined);
  };

  const handleMigrateFavorites = () => {
    if (migrateFavoritesState.status === AsyncStatus.Loading) return;
    void migrateFavoritesRoom().catch(() => undefined);
  };

  const normalizedSearchQuery = searchQuery.trim();
  const filterSummary = [
    `${visibleItems.length}条结果`,
    filtersOpen && hasSelection ? `${selectedFavoriteIds.length}条已选` : undefined,
    `分类：${getFavoriteCategoryText(activeCategory)}`,
    dateFilter !== 'all' ? `时间：${getDateFilterLabel(dateFilter)}` : undefined,
    normalizedSearchQuery ? `关键词：${normalizedSearchQuery}` : undefined,
  ]
    .filter(Boolean)
    .join(' \xb7 ');

  const favoritesRoomEncrypted = Boolean(favoritesRoom?.hasEncryptionStateEvent());

  const encryptedRoomNotice = favoritesRoomEncrypted ? (
    <SequenceCard
      className={css.GlassCard}
      variant="Background"
      direction="Column"
      gap="200"
      style={{ padding: config.space.S400 }}
    >
      <Text size="L400">{'\u5f53\u524d\u6536\u85cf\u623f\u95f4\u662f\u52a0\u5bc6\u623f\u95f4'}</Text>
      <Text size="T300" priority="300">
        {
          '\u5207\u6362\u540e\u4f1a\u65b0\u5efa\u4e00\u4e2a\u975e\u52a0\u5bc6\u6536\u85cf\u623f\u95f4\uff0c\u540e\u7eed\u6536\u85cf\u4e0d\u518d\u4f9d\u8d56\u5386\u53f2\u89e3\u5bc6\u5bc6\u94a5\uff1b\u65e7\u6536\u85cf\u623f\u95f4\u4f1a\u81ea\u52a8\u79bb\u5f00\uff0c\u907f\u514d\u7ee7\u7eed\u5e72\u6270\u5217\u8868\u548c\u6536\u85cf\u663e\u793a\u3002'
        }
      </Text>
      <Box>
        <Button
          onClick={handleMigrateFavorites}
          disabled={migrateFavoritesState.status === AsyncStatus.Loading}
        >
          {migrateFavoritesState.status === AsyncStatus.Loading && (
            <Spinner size="200" variant="Secondary" />
          )}
          <Text size="B400">
            {migrateFavoritesState.status === AsyncStatus.Loading
              ? '\u5207\u6362\u4e2d...'
              : '\u91cd\u5efa\u4e3a\u975e\u52a0\u5bc6\u6536\u85cf\u623f\u95f4'}
          </Text>
        </Button>
      </Box>
    </SequenceCard>
  ) : undefined;

  const renderContent = () => {
    if (!favoritesRoom) {
      return (
        <FavoritesEmpty
          loading={createFavoritesState.status === AsyncStatus.Loading}
          hasRoom={false}
          onCreate={handleCreateFavorites}
        />
      );
    }

    if (favoriteItems.length === 0 && !hasActiveFilters) {
      return (
        <Box direction="Column" gap="300">
          {encryptedRoomNotice}
          <FavoritesEmpty loading={false} hasRoom onCreate={handleCreateFavorites} />
        </Box>
      );
    }

    return (
      <Box direction="Column" gap="300">
        {encryptedRoomNotice}
        <SequenceCard
          className={css.GlassCard}
          variant="Background"
          direction="Column"
          gap="300"
          style={{
            position: 'sticky',
            top: config.space.S300,
            zIndex: 3,
            padding: config.space.S400,
          }}
        >
          <Box className={css.FilterCardSection} direction="Column">
            <Text className={css.FilterCardLabel} size="T200" priority="300">
              {'\u5185\u5bb9\u5206\u7c7b'}
            </Text>
            <Box className={css.FilterCardActions}>
              {FAVORITE_CATEGORIES.map((category) => {
                const active = activeCategory === category;
                return (
                  <Chip
                    key={category}
                    variant={active ? 'Primary' : 'SurfaceVariant'}
                    fill={active ? 'Solid' : 'Soft'}
                    radii="Pill"
                    onClick={() => setActiveCategory(category)}
                  >
                    <Text size="B300">
                      {`${getFavoriteCategoryText(category)} ${categoryCounts[category]}`}
                    </Text>
                  </Chip>
                );
              })}
            </Box>
          </Box>

          <Line size="300" />

          <Box className={css.FilterCardSection} direction="Column" gap="200">
            <Box justifyContent="SpaceBetween" alignItems="Center" wrap="Wrap" gap="200">
              <Text size="L400">
                {visibleItems.length > 0
                  ? `\u5171 ${visibleItems.length} \u6761\u7ed3\u679c`
                  : '\u6ca1\u6709\u5339\u914d\u7ed3\u679c'}
                {filtersOpen && hasSelection
                  ? ` \xb7 \u5df2\u9009\u62e9 ${selectedFavoriteIds.length} \u6761`
                  : ''}
              </Text>

              <Box className={css.FilterCardActions}>
                {filtersOpen && (
                  <>
                    <Button
                      size="300"
                      variant="Secondary"
                      fill="Soft"
                      radii="300"
                      onClick={handleToggleSelectVisible}
                      disabled={visibleItemIds.length === 0}
                    >
                      <Text size="B300">
                        {allVisibleSelected ? '取消选择当前结果' : '全选当前结果'}
                      </Text>
                    </Button>
                    <Button
                      size="300"
                      variant="Secondary"
                      fill="Soft"
                      radii="300"
                      onClick={handleClearSelection}
                      disabled={!hasSelection}
                    >
                      <Text size="B300">清空选择</Text>
                    </Button>
                    <Button
                      size="300"
                      variant="Critical"
                      radii="300"
                      onClick={handleBatchRemove}
                      disabled={!hasSelection || batchRemoveState.status === AsyncStatus.Loading}
                    >
                      {batchRemoveState.status === AsyncStatus.Loading && (
                        <Spinner size="200" variant="Secondary" />
                      )}
                      <Text size="B300">
                        {batchRemoveState.status === AsyncStatus.Loading
                          ? '取消中...'
                          : '批量取消收藏'}
                      </Text>
                    </Button>
                  </>
                )}
                {hasActiveFilters && (
                  <Button
                    size="300"
                    variant="Secondary"
                    fill="Soft"
                    radii="300"
                    onClick={handleResetFilters}
                  >
                    <Text size="B300">重置筛选</Text>
                  </Button>
                )}
                <Button
                  size="300"
                  variant="Secondary"
                  fill="Soft"
                  radii="300"
                  onClick={handleToggleAdvanced}
                >
                  <Text size="B300">{filtersOpen ? '收起高级' : '高级'}</Text>
                </Button>
              </Box>
            </Box>

            <Text size="T200" priority="300">
              {filterSummary}
            </Text>
          </Box>

          {filtersOpen && (
            <>
              <Line size="300" />

              <Box direction="Column" gap="300">
                <Box className={css.FilterCardSection} direction="Column">
                  <Text className={css.FilterCardLabel} size="T200" priority="300">
                    搜索
                  </Text>
                  <Input
                    size="300"
                    variant="Secondary"
                    radii="300"
                    value={searchQuery}
                    placeholder="搜索消息内容、备注、发送者或房间"
                    autoComplete="off"
                    onChange={(evt: React.ChangeEvent<HTMLInputElement>) =>
                      setSearchQuery(evt.target.value)
                    }
                  />
                </Box>

                <Box className={css.FilterCardSection} direction="Column">
                  <Text className={css.FilterCardLabel} size="T200" priority="300">
                    按收藏时间筛选
                  </Text>
                  <Box className={css.FilterCardActions}>
                    {DATE_FILTER_OPTIONS.map((option) => {
                      const active = dateFilter === option.id;
                      return (
                        <Chip
                          key={option.id}
                          variant={active ? 'Primary' : 'SurfaceVariant'}
                          fill={active ? 'Solid' : 'Soft'}
                          radii="Pill"
                          onClick={() => setDateFilter(option.id)}
                        >
                          <Text size="B300">{option.label}</Text>
                        </Chip>
                      );
                    })}
                  </Box>
                </Box>

                <Text size="T200" priority="300">
                  搜索和时间条件会影响顶部各分类的数量统计。
                </Text>
              </Box>
            </>
          )}
        </SequenceCard>

        {batchRemoveState.status === AsyncStatus.Error && (
          <SequenceCard
            variant="Critical"
            direction="Column"
            gap="200"
            style={{ padding: config.space.S300 }}
          >
            <Text size="T300">
              {'\u6279\u91cf\u53d6\u6d88\u6536\u85cf\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002'}
            </Text>
          </SequenceCard>
        )}

        {visibleItems.length === 0 ? (
          <FavoritesEmptyShell>
            <PageHeroSection>
              <PageHero
                icon={<Icon size="600" src={Icons.Search} />}
                title={'\u6ca1\u6709\u627e\u5230\u5339\u914d\u7684\u6536\u85cf'}
                subTitle={
                  '\u53ef\u4ee5\u8c03\u6574\u5206\u7c7b\u3001\u5173\u952e\u8bcd\u6216\u65f6\u95f4\u8303\u56f4\uff0c\u4e5f\u53ef\u4ee5\u76f4\u63a5\u91cd\u7f6e\u7b5b\u9009\u3002'
                }
              >
                {hasActiveFilters && (
                  <Box justifyContent="Center">
                    <Button onClick={handleResetFilters}>
                      <Text size="B400">{'\u91cd\u7f6e\u7b5b\u9009'}</Text>
                    </Button>
                  </Box>
                )}
              </PageHero>
            </PageHeroSection>
          </FavoritesEmptyShell>
        ) : (
          favoriteGroups.map((group) => (
            <Box key={group.category} direction="Column" gap="200">
              <Box justifyContent="SpaceBetween" alignItems="Center" wrap="Wrap" gap="200">
                <Text size="H4">{getFavoriteCategoryText(group.category)}</Text>
                <Text size="T200" priority="300">
                  {`${group.items.length} \u6761`}
                </Text>
              </Box>

              {isGalleryCategory(group.category) ? (
                <Box className={css.MediaGrid}>
                  {group.items.map((item) => {
                    if (group.category === 'image') {
                      const imageContent = getFavoriteImageContent(item);
                      if (!imageContent) {
                        return (
                          <Box key={getFavoriteItemId(item)} style={{ gridColumn: '1 / -1' }}>
                            <FavoriteCard
                              item={item}
                              note={favoriteNotes[item.referenceId]}
                              selected={selectedFavoriteIds.includes(getFavoriteItemId(item))}
                              selectionMode={filtersOpen}
                              renderMatrixEvent={renderMatrixEvent}
                              onToggleSelect={() => handleToggleSelect(item)}
                              onOpenSource={handleOpenSource}
                              onRemoveFavorite={handleRemoveFavorite}
                              onSaveNote={handleSaveNote}
                            />
                          </Box>
                        );
                      }

                      return (
                        <FavoriteImageCard
                          key={getFavoriteItemId(item)}
                          item={item}
                          selected={selectedFavoriteIds.includes(getFavoriteItemId(item))}
                          selectionMode={filtersOpen}
                          imageViewerItems={imageViewerItems}
                          onToggleSelect={() => handleToggleSelect(item)}
                        />
                      );
                    }

                    const videoContent = getFavoriteVideoContent(item);
                    if (!videoContent) {
                      return (
                        <Box key={getFavoriteItemId(item)} style={{ gridColumn: '1 / -1' }}>
                          <FavoriteCard
                            item={item}
                            note={favoriteNotes[item.referenceId]}
                            selected={selectedFavoriteIds.includes(getFavoriteItemId(item))}
                            selectionMode={filtersOpen}
                            renderMatrixEvent={renderMatrixEvent}
                            onToggleSelect={() => handleToggleSelect(item)}
                            onOpenSource={handleOpenSource}
                            onRemoveFavorite={handleRemoveFavorite}
                            onSaveNote={handleSaveNote}
                          />
                        </Box>
                      );
                    }

                    return (
                      <FavoriteVideoCard
                        key={getFavoriteItemId(item)}
                        item={item}
                        selected={selectedFavoriteIds.includes(getFavoriteItemId(item))}
                        selectionMode={filtersOpen}
                        videoItems={visibleVideoItems}
                        favoriteNotes={favoriteNotes}
                        onToggleSelect={() => handleToggleSelect(item)}
                        onOpenSource={handleOpenSource}
                        onRemoveFavorite={handleRemoveFavorite}
                        onSaveNote={handleSaveNote}
                      />
                    );
                  })}
                </Box>
              ) : (
                <Box direction="Column" gap="200">
                  {group.items.map((item) => (
                    <FavoriteCard
                      key={getFavoriteItemId(item)}
                      item={item}
                      note={favoriteNotes[item.referenceId]}
                      selected={selectedFavoriteIds.includes(getFavoriteItemId(item))}
                      selectionMode={filtersOpen}
                      renderMatrixEvent={renderMatrixEvent}
                      onToggleSelect={() => handleToggleSelect(item)}
                      onOpenSource={handleOpenSource}
                      onRemoveFavorite={handleRemoveFavorite}
                      onSaveNote={handleSaveNote}
                    />
                  ))}
                </Box>
              )}
            </Box>
          ))
        )}
      </Box>
    );
  };

  return (
    <Page>
      <PageHeader balance>
        <Box grow="Yes" alignItems="Center" gap="200">
          <Box shrink="No">
            <CompactClientNavButton />
          </Box>
          <Box grow="Yes" alignItems="Center" justifyContent="Center" gap="200">
            <Icon size="400" src={Icons.Heart} filled />
            <Text size="H3" truncate>
              {'\u6211\u7684\u6536\u85cf'}
            </Text>
          </Box>
        </Box>
      </PageHeader>

      <Box grow="Yes" style={{ position: 'relative' }}>
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <PageContentCenter>{renderContent()}</PageContentCenter>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
