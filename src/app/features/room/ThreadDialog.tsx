import React, {
  FormEventHandler,
  KeyboardEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HTMLReactParserOptions } from 'html-react-parser';
import {
  Direction,
  EventTimelineSetHandlerMap,
  EventTimelineSet,
  IContent,
  MatrixClient,
  MatrixEvent,
  MsgType,
  RelationType,
  Room,
  RoomEvent,
  RoomEventHandlerMap,
} from 'matrix-js-sdk';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Line,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Spinner,
  TextArea,
  Text,
} from 'folds';
import { Opts as LinkifyOpts } from 'linkifyjs';
import { RenderMessageContent } from '../../components/RenderMessageContent';
import {
  AvatarBase,
  ImageContent,
  MSticker,
  ModernLayout,
  RedactedContent,
  Time,
  Username,
  UsernameBold,
} from '../../components/message';
import { Image } from '../../components/media';
import { ImageViewer } from '../../components/image-viewer';
import type { ViewerImageItem } from '../../components/message/content/ImageContent';
import { PowerIcon } from '../../components/power';
import { UserAvatar } from '../../components/user-avatar';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { GetMemberPowerTag, getPowerTagIconSrc } from '../../hooks/useMemberPowerTag';
import { useRoomEvent } from '../../hooks/useRoomEvent';
import {
  getEditedEvent,
  getMemberAvatarMxc,
  getMemberDisplayName,
  getMentionContent,
  reactionOrEditEvent,
} from '../../utils/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { dispatchRoomFollowLatest } from '../../utils/roomViewEvents';
import { POLL_START_EVENT_TYPE, UNSTABLE_POLL_START_EVENT_TYPE } from '../../utils/polls';
import { GetContentCallback, MessageEvent } from '../../../types/matrix/room';
import colorMXID from '../../../util/colorMXID';
import { EncryptedContent } from './message';
import * as css from './ThreadDialog.css';

const THREAD_PAGE_LIMIT = 50;
const THREAD_MAX_PAGES = 5;
const THREAD_DIALOG_VIEWPORT_HEIGHT_VAR = '--thread-dialog-viewport-height';

type ThreadDialogViewportStyle = React.CSSProperties & {
  [THREAD_DIALOG_VIEWPORT_HEIGHT_VAR]?: string;
};

type ThreadRelationsResult = {
  originalEvent?: MatrixEvent | null;
  events: MatrixEvent[];
  hasMore: boolean;
};

type ThreadDialogProps = {
  room: Room;
  timelineSet: EventTimelineSet;
  rootEventId: string;
  requestClose: () => void;
  onOpenEvent: (eventId: string) => void;
  mediaAutoLoad?: boolean;
  urlPreview?: boolean;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: LinkifyOpts;
  getMemberPowerTag: GetMemberPowerTag;
  accessibleTagColors: Map<string, string>;
  legacyUsernameColor?: boolean;
  hour24Clock: boolean;
  dateFormatString: string;
};

const getThreadRootId = (mEvent: MatrixEvent): string | undefined => {
  const relation = mEvent.getRelation();
  if (relation?.rel_type === RelationType.Thread && typeof relation.event_id === 'string') {
    return relation.event_id;
  }

  const wireRelation = mEvent.getWireContent()['m.relates_to'];
  if (wireRelation?.rel_type === RelationType.Thread && typeof wireRelation.event_id === 'string') {
    return wireRelation.event_id;
  }

  return undefined;
};

const getLocalThreadEvents = (timelineSet: EventTimelineSet, rootEventId: string): MatrixEvent[] =>
  timelineSet.relations
    .getAllChildEventsForEvent(rootEventId)
    .filter((mEvent) => getThreadRootId(mEvent) === rootEventId && !reactionOrEditEvent(mEvent));

const getThreadDialogViewportHeight = (): number | undefined => {
  if (typeof window === 'undefined') return undefined;

  return Math.round(window.visualViewport?.height ?? window.innerHeight);
};

const useThreadDialogViewportStyle = (): ThreadDialogViewportStyle | undefined => {
  const [viewportHeight, setViewportHeight] = useState<number>();

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let animationFrame = 0;
    const updateViewportHeight = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        setViewportHeight(getThreadDialogViewportHeight());
      });
    };

    updateViewportHeight();

    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', updateViewportHeight);
    viewport?.addEventListener('scroll', updateViewportHeight);
    window.addEventListener('resize', updateViewportHeight);

    return () => {
      cancelAnimationFrame(animationFrame);
      viewport?.removeEventListener('resize', updateViewportHeight);
      viewport?.removeEventListener('scroll', updateViewportHeight);
      window.removeEventListener('resize', updateViewportHeight);
    };
  }, []);

  return useMemo(
    () =>
      viewportHeight
        ? {
            [THREAD_DIALOG_VIEWPORT_HEIGHT_VAR]: `${viewportHeight}px`,
          }
        : undefined,
    [viewportHeight]
  );
};

const mergeThreadEvents = (rootEventId: string, events: MatrixEvent[]): MatrixEvent[] => {
  const eventMap = new Map<string, MatrixEvent>();

  events.forEach((mEvent) => {
    const eventId = mEvent.getId();
    if (!eventId || eventId === rootEventId) return;
    if (getThreadRootId(mEvent) !== rootEventId) return;
    if (reactionOrEditEvent(mEvent)) return;

    eventMap.set(eventId, mEvent);
  });

  return Array.from(eventMap.values()).sort((a, b) => a.getTs() - b.getTs());
};

const getThreadImageViewerItems = (events: MatrixEvent[]): ViewerImageItem[] => {
  const seenEventIds = new Set<string>();
  const items: ViewerImageItem[] = [];

  events.forEach((mEvent) => {
    const eventId = mEvent.getId();
    if (!eventId || seenEventIds.has(eventId) || mEvent.isRedacted()) return;

    const content = mEvent.getContent();
    let url: string | undefined;
    if (typeof content.file?.url === 'string') {
      url = content.file.url;
    } else if (typeof content.url === 'string') {
      url = content.url;
    }
    const mimeType = typeof content.info?.mimetype === 'string' ? content.info.mimetype : undefined;
    const info =
      content.info && typeof content.info === 'object'
        ? (content.info as ViewerImageItem['info'])
        : undefined;
    const body = typeof content.body === 'string' ? content.body : 'Image';

    if (!url) return;

    if (mEvent.getType() === MessageEvent.Sticker) {
      seenEventIds.add(eventId);
      items.push({
        id: eventId,
        body,
        mimeType,
        url,
        info,
        encInfo: content.file,
      });
      return;
    }

    if (mEvent.getType() !== MessageEvent.RoomMessage || content.msgtype !== MsgType.Image) {
      return;
    }

    seenEventIds.add(eventId);
    items.push({
      id: eventId,
      body,
      mimeType,
      url,
      info,
      encInfo: content.file,
    });
  });

  return items;
};

const fetchThreadRelations = async (
  mx: MatrixClient,
  roomId: string,
  rootEventId: string
): Promise<ThreadRelationsResult> => {
  let from: string | undefined;
  let originalEvent: MatrixEvent | null | undefined;
  let hasMore = false;
  const events: MatrixEvent[] = [];

  for (let page = 0; page < THREAD_MAX_PAGES; page += 1) {
    // Thread relation pages depend on the previous nextBatch token.
    // eslint-disable-next-line no-await-in-loop
    const result = await mx.relations(roomId, rootEventId, RelationType.Thread, null, {
      dir: Direction.Forward,
      from,
      limit: THREAD_PAGE_LIMIT,
    });

    originalEvent = originalEvent ?? result.originalEvent;
    events.push(...result.events);

    if (!result.nextBatch) {
      hasMore = false;
      break;
    }

    hasMore = true;
    from = result.nextBatch;
  }

  return { originalEvent, events, hasMore };
};

const getThreadSendErrorMessage = (error: unknown): string => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return '当前网络已断开，这条回复还没有真正发送出去。';
  }

  const matrixError = error as {
    data?: { error?: string };
    message?: string;
  };

  if (typeof matrixError?.data?.error === 'string' && matrixError.data.error.trim()) {
    return `发送失败：${matrixError.data.error}`;
  }

  if (typeof matrixError?.message === 'string' && matrixError.message.trim()) {
    return `发送失败：${matrixError.message}`;
  }

  return '发送失败，请稍后重试。';
};

type ThreadMessageViewProps = {
  room: Room;
  timelineSet: EventTimelineSet;
  mEvent: MatrixEvent;
  imageViewerItems: ViewerImageItem[];
  mediaAutoLoad?: boolean;
  urlPreview?: boolean;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: LinkifyOpts;
  getMemberPowerTag: GetMemberPowerTag;
  accessibleTagColors: Map<string, string>;
  legacyUsernameColor?: boolean;
  hour24Clock: boolean;
  dateFormatString: string;
  onLocate: (eventId: string) => void;
};

function ThreadMessageView({
  room,
  timelineSet,
  mEvent,
  imageViewerItems,
  mediaAutoLoad,
  urlPreview,
  htmlReactParserOptions,
  linkifyOpts,
  getMemberPowerTag,
  accessibleTagColors,
  legacyUsernameColor,
  hour24Clock,
  dateFormatString,
  onLocate,
}: ThreadMessageViewProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const eventId = mEvent.getId();
  const senderId = mEvent.getSender() ?? '';
  const displayName =
    getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? senderId;
  const senderAvatarMxc = senderId ? getMemberAvatarMxc(room, senderId) : undefined;

  const memberPowerTag = senderId ? getMemberPowerTag(senderId) : undefined;
  const tagColor = memberPowerTag?.color
    ? accessibleTagColors.get(memberPowerTag.color)
    : undefined;
  const tagIconSrc = memberPowerTag?.icon
    ? getPowerTagIconSrc(mx, useAuthentication, memberPowerTag.icon)
    : undefined;
  const usernameColor = legacyUsernameColor ? colorMXID(senderId) : tagColor;

  const renderContent = () => {
    if (!eventId) return null;
    if (mEvent.isRedacted()) {
      return <RedactedContent reason={mEvent.getUnsigned().redacted_because?.content.reason} />;
    }
    if (reactionOrEditEvent(mEvent)) return null;

    if (mEvent.getType() === MessageEvent.Sticker) {
      return (
        <MSticker
          content={mEvent.getContent()}
          renderImageContent={(props) => (
            <ImageContent
              {...props}
              autoPlay={mediaAutoLoad}
              previewMediaStrategy="stable"
              viewerItems={imageViewerItems}
              viewerItemId={eventId}
              renderImage={(p) => (
                <Image {...p} loading={mediaAutoLoad ? 'eager' : 'lazy'} decoding="async" />
              )}
              renderViewer={(p) => <ImageViewer {...p} />}
            />
          )}
        />
      );
    }

    if (
      mEvent.getType() === MessageEvent.PollStart ||
      mEvent.getType() === POLL_START_EVENT_TYPE ||
      mEvent.getType() === UNSTABLE_POLL_START_EVENT_TYPE
    ) {
      return (
        <RenderMessageContent
          displayName={displayName}
          msgType={mEvent.getContent().msgtype ?? ''}
          eventType={mEvent.getType()}
          ts={mEvent.getTs()}
          getContent={(() => mEvent.getContent()) as GetContentCallback}
          mediaAutoLoad={mediaAutoLoad}
          urlPreview={urlPreview}
          htmlReactParserOptions={htmlReactParserOptions}
          linkifyOpts={linkifyOpts}
          outlineAttachment
          room={room}
          eventId={eventId}
          imageViewerItems={imageViewerItems}
        />
      );
    }

    if (mEvent.getType() === MessageEvent.RoomMessage) {
      const editedEvent = getEditedEvent(eventId, mEvent, timelineSet);
      const getContent = (() =>
        editedEvent?.getContent()['m.new_content'] ?? mEvent.getContent()) as GetContentCallback;

      return (
        <RenderMessageContent
          displayName={displayName}
          msgType={mEvent.getContent().msgtype ?? ''}
          eventType={mEvent.getType()}
          ts={mEvent.getTs()}
          edited={!!editedEvent}
          getContent={getContent}
          mediaAutoLoad={mediaAutoLoad}
          urlPreview={urlPreview}
          htmlReactParserOptions={htmlReactParserOptions}
          linkifyOpts={linkifyOpts}
          outlineAttachment
          room={room}
          eventId={eventId}
          imageViewerItems={imageViewerItems}
        />
      );
    }

    return (
      <RenderMessageContent
        displayName={displayName}
        msgType={mEvent.getContent().msgtype ?? ''}
        eventType={mEvent.getType()}
        ts={mEvent.getTs()}
        getContent={(() => mEvent.getContent()) as GetContentCallback}
        mediaAutoLoad={mediaAutoLoad}
        urlPreview={urlPreview}
        htmlReactParserOptions={htmlReactParserOptions}
        linkifyOpts={linkifyOpts}
        outlineAttachment
        room={room}
        eventId={eventId}
        imageViewerItems={imageViewerItems}
      />
    );
  };

  return (
    <Box className={css.MessageCard} direction="Column">
      <ModernLayout
        before={
          <AvatarBase>
            <Avatar size="300">
              <UserAvatar
                userId={senderId || eventId || room.roomId}
                src={
                  senderAvatarMxc
                    ? mxcUrlToHttp(mx, senderAvatarMxc, useAuthentication, 48, 48, 'crop') ??
                      undefined
                    : undefined
                }
                alt={displayName}
                renderFallback={() => <Icon size="200" src={Icons.User} filled />}
              />
            </Avatar>
          </AvatarBase>
        }
      >
        <Box
          className={css.MessageHeader}
          gap="300"
          justifyContent="SpaceBetween"
          alignItems="Start"
        >
          <Box direction="Column" gap="50" grow="Yes">
            <Box alignItems="Center" gap="200">
              <Username style={{ color: usernameColor }}>
                <Text as="span" size="T400" truncate>
                  <UsernameBold>{displayName}</UsernameBold>
                </Text>
              </Username>
              {tagIconSrc && <PowerIcon size="100" iconSrc={tagIconSrc} />}
            </Box>
            <Time
              ts={mEvent.getTs()}
              hour24Clock={hour24Clock}
              dateFormatString={dateFormatString}
            />
          </Box>
          {eventId && (
            <Chip
              className={css.LocateChip}
              variant="Secondary"
              radii="Pill"
              before={<Icon size="50" src={Icons.ArrowGoRight} />}
              onClick={() => onLocate(eventId)}
            >
              <Text size="L400">定位</Text>
            </Chip>
          )}
        </Box>

        <Box className={css.MessageBody} direction="Column">
          <EncryptedContent mEvent={mEvent}>{renderContent}</EncryptedContent>
        </Box>
      </ModernLayout>
    </Box>
  );
}

type ThreadReplyComposerProps = {
  room: Room;
  rootEventId: string;
  rootEvent?: MatrixEvent;
  onSent: () => void;
};

function ThreadReplyComposer({ room, rootEventId, rootEvent, onSent }: ThreadReplyComposerProps) {
  const mx = useMatrixClient();
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();

  const trimmedMessage = message.trim();
  const canSend = trimmedMessage.length > 0 && !sending;

  const submit = useCallback(async () => {
    if (!canSend) return;

    const rootSenderId = rootEvent?.getSender();
    const myUserId = mx.getUserId();
    const mentionUserIds = rootSenderId && rootSenderId !== myUserId ? [rootSenderId] : [];
    const content: IContent = {
      msgtype: MsgType.Text,
      body: trimmedMessage,
      'm.relates_to': {
        'm.in_reply_to': {
          event_id: rootEventId,
        },
        event_id: rootEventId,
        rel_type: RelationType.Thread,
        is_falling_back: false,
      },
      'm.mentions': getMentionContent(mentionUserIds, false),
    };

    setSending(true);
    setSendError(undefined);

    try {
      await mx.sendMessage(room.roomId, content as never);
      setMessage('');
      dispatchRoomFollowLatest(room.roomId);
      onSent();
      requestAnimationFrame(() => textAreaRef.current?.focus());
    } catch (error) {
      setSendError(getThreadSendErrorMessage(error));
    } finally {
      setSending(false);
    }
  }, [canSend, mx, onSent, room.roomId, rootEvent, rootEventId, trimmedMessage]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    submit().catch(() => undefined);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (evt) => {
    if (evt.key !== 'Enter' || evt.shiftKey || evt.nativeEvent.isComposing) return;

    evt.preventDefault();
    submit().catch(() => undefined);
  };

  return (
    <Box className={css.ComposerFooter} direction="Column" gap="200">
      {sendError && (
        <Text className={css.ComposerError} size="T300">
          {sendError}
        </Text>
      )}
      <Box as="form" className={css.ComposerForm} gap="200" onSubmit={handleSubmit}>
        <TextArea
          ref={textAreaRef}
          className={css.ComposerTextArea}
          value={message}
          onChange={(evt) => setMessage(evt.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder="在线程中回复..."
          variant="SurfaceVariant"
          radii="400"
          resize="None"
          rows={2}
          disabled={sending}
        />
        <Button
          className={css.ComposerSendButton}
          type="submit"
          variant="Primary"
          radii="400"
          disabled={!canSend}
          aria-label="发送线程回复"
        >
          {sending ? (
            <Spinner size="100" variant="Primary" fill="Solid" />
          ) : (
            <Icon size="100" src={Icons.Send} filled />
          )}
        </Button>
      </Box>
      <Text className={css.ComposerHint} size="T200" priority="300">
        Enter 发送，Shift + Enter 换行
      </Text>
    </Box>
  );
}

export function ThreadDialog({
  room,
  timelineSet,
  rootEventId,
  requestClose,
  onOpenEvent,
  mediaAutoLoad,
  urlPreview,
  htmlReactParserOptions,
  linkifyOpts,
  getMemberPowerTag,
  accessibleTagColors,
  legacyUsernameColor,
  hour24Clock,
  dateFormatString,
}: ThreadDialogProps) {
  const mx = useMatrixClient();
  const queryClient = useQueryClient();
  const viewportStyle = useThreadDialogViewportStyle();
  const [, setTimelineRevision] = useState(0);
  const getLocalRootEvent = useCallback(
    () => timelineSet.findEventById(rootEventId),
    [timelineSet, rootEventId]
  );
  const rootRoomEvent = useRoomEvent(room, rootEventId, getLocalRootEvent);
  const localThreadEvents = getLocalThreadEvents(timelineSet, rootEventId);
  const threadRelationsQueryKey = useMemo(
    () => ['room-thread-relations', room.roomId, rootEventId] as const,
    [room.roomId, rootEventId]
  );

  const threadQuery = useQuery({
    queryKey: threadRelationsQueryKey,
    queryFn: () => fetchThreadRelations(mx, room.roomId, rootEventId),
    staleTime: 30 * 1000,
  });

  const rootEvent = rootRoomEvent || threadQuery.data?.originalEvent;
  const threadEvents = useMemo(
    () =>
      mergeThreadEvents(rootEventId, [...(threadQuery.data?.events ?? []), ...localThreadEvents]),
    [rootEventId, threadQuery.data?.events, localThreadEvents]
  );
  const imageViewerItems = useMemo(() => {
    const events = rootEvent ? [rootEvent, ...threadEvents] : threadEvents;
    return getThreadImageViewerItems(events);
  }, [rootEvent, threadEvents]);

  const handleLocate = (eventId: string) => {
    requestClose();
    onOpenEvent(eventId);
  };

  const bumpTimelineRevision = useCallback(() => {
    setTimelineRevision((currentRevision) => currentRevision + 1);
  }, []);

  const handlePotentialThreadEvent = useCallback(
    (mEvent: MatrixEvent) => {
      if (mEvent.getId() === rootEventId || getThreadRootId(mEvent) === rootEventId) {
        bumpTimelineRevision();
      }
    },
    [bumpTimelineRevision, rootEventId]
  );

  useEffect(() => {
    const handleTimeline: EventTimelineSetHandlerMap[RoomEvent.Timeline] = (mEvent, eventRoom) => {
      if (eventRoom?.roomId !== room.roomId) return;
      handlePotentialThreadEvent(mEvent);
    };

    const handleLocalEchoUpdated: RoomEventHandlerMap[RoomEvent.LocalEchoUpdated] = (
      mEvent,
      eventRoom
    ) => {
      if (eventRoom?.roomId !== room.roomId) return;
      handlePotentialThreadEvent(mEvent);
    };

    const handleRedaction: RoomEventHandlerMap[RoomEvent.Redaction] = (_mEvent, eventRoom) => {
      if (eventRoom?.roomId !== room.roomId) return;
      bumpTimelineRevision();
    };

    const handleTimelineRefresh: RoomEventHandlerMap[RoomEvent.TimelineRefresh] = (eventRoom) => {
      if (eventRoom.roomId !== room.roomId) return;
      bumpTimelineRevision();
    };

    room.on(RoomEvent.Timeline, handleTimeline);
    room.on(RoomEvent.LocalEchoUpdated, handleLocalEchoUpdated);
    room.on(RoomEvent.Redaction, handleRedaction);
    room.on(RoomEvent.TimelineRefresh, handleTimelineRefresh);
    return () => {
      room.removeListener(RoomEvent.Timeline, handleTimeline);
      room.removeListener(RoomEvent.LocalEchoUpdated, handleLocalEchoUpdated);
      room.removeListener(RoomEvent.Redaction, handleRedaction);
      room.removeListener(RoomEvent.TimelineRefresh, handleTimelineRefresh);
    };
  }, [bumpTimelineRevision, handlePotentialThreadEvent, room]);

  const handleSentReply = useCallback(() => {
    bumpTimelineRevision();
    queryClient.invalidateQueries({ queryKey: threadRelationsQueryKey }).catch(() => undefined);
  }, [bumpTimelineRevision, queryClient, threadRelationsQueryKey]);

  const replyCountText = `${threadEvents.length} 条回复`;

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter className={css.OverlayCenter} style={viewportStyle}>
        <Dialog className={css.Dialog} variant="Surface">
          <Box className={css.Shell} direction="Column">
            <Header className={css.Header} variant="Surface" size="600">
              <Box alignItems="Center" gap="300" grow="Yes">
                <span className={css.IconBadge}>
                  <Icon size="100" src={Icons.Thread} />
                </span>
                <Box direction="Column" gap="50" grow="Yes">
                  <Text size="H3" truncate>
                    线程
                  </Text>
                  <Text size="T300" priority="300" truncate>
                    {replyCountText}
                  </Text>
                </Box>
              </Box>
              <Box shrink="No">
                <IconButton onClick={requestClose} variant="SurfaceVariant" size="300" radii="300">
                  <Icon src={Icons.Cross} />
                </IconButton>
              </Box>
            </Header>

            <Box className={css.RootPanel} direction="Column" gap="200">
              <Text size="L400" priority="300">
                原消息
              </Text>
              <Box className={css.RootMessage}>
                {rootEvent ? (
                  <ThreadMessageView
                    room={room}
                    timelineSet={timelineSet}
                    mEvent={rootEvent}
                    imageViewerItems={imageViewerItems}
                    mediaAutoLoad={mediaAutoLoad}
                    urlPreview={urlPreview}
                    htmlReactParserOptions={htmlReactParserOptions}
                    linkifyOpts={linkifyOpts}
                    getMemberPowerTag={getMemberPowerTag}
                    accessibleTagColors={accessibleTagColors}
                    legacyUsernameColor={legacyUsernameColor}
                    hour24Clock={hour24Clock}
                    dateFormatString={dateFormatString}
                    onLocate={handleLocate}
                  />
                ) : (
                  <Box className={css.StatusBox} alignItems="Center" gap="200">
                    <Spinner size="200" variant="Secondary" />
                    <Text size="T300" priority="300">
                      正在加载原消息...
                    </Text>
                  </Box>
                )}
              </Box>
            </Box>

            <Box className={css.ScrollArea} grow="Yes">
              <Scroll size="300" hideTrack visibility="Hover">
                <Box className={css.Content} direction="Column" gap="300">
                  {threadQuery.isLoading && (
                    <Box className={css.StatusBox} alignItems="Center" gap="200">
                      <Spinner size="200" variant="Secondary" />
                      <Text size="T300" priority="300">
                        正在加载线程消息...
                      </Text>
                    </Box>
                  )}

                  {threadQuery.error && (
                    <Box className={css.StatusBox} alignItems="Center" gap="200">
                      <Icon size="100" src={Icons.Warning} />
                      <Text size="T300" priority="300">
                        线程消息加载失败，已显示本地可见消息
                      </Text>
                    </Box>
                  )}

                  {!threadQuery.isLoading && threadEvents.length === 0 && (
                    <Box
                      className={css.EmptyState}
                      direction="Column"
                      alignItems="Center"
                      justifyContent="Center"
                      gap="100"
                    >
                      <Icon size="400" src={Icons.Thread} />
                      <Text size="H5">暂无线程回复</Text>
                    </Box>
                  )}

                  <Box className={css.MessageList} direction="Column" gap="300">
                    {threadEvents.map((mEvent) => {
                      const eventId = mEvent.getId();
                      if (!eventId) return null;

                      return (
                        <ThreadMessageView
                          key={eventId}
                          room={room}
                          timelineSet={timelineSet}
                          mEvent={mEvent}
                          imageViewerItems={imageViewerItems}
                          mediaAutoLoad={mediaAutoLoad}
                          urlPreview={urlPreview}
                          htmlReactParserOptions={htmlReactParserOptions}
                          linkifyOpts={linkifyOpts}
                          getMemberPowerTag={getMemberPowerTag}
                          accessibleTagColors={accessibleTagColors}
                          legacyUsernameColor={legacyUsernameColor}
                          hour24Clock={hour24Clock}
                          dateFormatString={dateFormatString}
                          onLocate={handleLocate}
                        />
                      );
                    })}
                  </Box>
                </Box>
              </Scroll>
            </Box>

            {threadQuery.data?.hasMore && (
              <>
                <Line variant="SurfaceVariant" size="300" />
                <Box className={css.Footer}>
                  <Text size="T300" priority="300">
                    这条线程还有更多回复未显示
                  </Text>
                </Box>
              </>
            )}

            <Line variant="SurfaceVariant" size="300" />
            <ThreadReplyComposer
              room={room}
              rootEventId={rootEventId}
              rootEvent={rootEvent}
              onSent={handleSentReply}
            />
          </Box>
        </Dialog>
      </OverlayCenter>
    </Overlay>
  );
}
