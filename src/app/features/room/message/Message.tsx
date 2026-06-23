import {
  Avatar,
  Box,
  Button,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Line,
  Menu,
  MenuItem,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  RectCords,
  Spinner,
  Text,
  as,
  color,
  config,
} from 'folds';
import React, {
  FormEventHandler,
  MouseEventHandler,
  PointerEventHandler,
  ReactNode,
  useEffect,
  useCallback,
  useRef,
  useState,
} from 'react';
import FocusTrap from 'focus-trap-react';
import { useHover, useFocusWithin } from 'react-aria';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { EventType, MatrixClient, MatrixEvent, MsgType, Room, RoomEvent } from 'matrix-js-sdk';
import { Relations } from 'matrix-js-sdk/lib/models/relations';
import classNames from 'classnames';
import { RoomPinnedEventsEventContent } from 'matrix-js-sdk/lib/types';
import {
  AvatarBase,
  BubbleLayout,
  CompactLayout,
  MessageBase,
  ModernLayout,
  Time,
  Username,
  UsernameBold,
} from '../../../components/message';
import {
  canEditEvent,
  getEventEdits,
  getMemberAvatarMxc,
  getMemberDisplayName,
  trimReplyFromBody,
} from '../../../utils/room';
import {
  decryptFile,
  downloadEncryptedMedia,
  downloadMedia,
  getCanonicalAliasOrRoomId,
  getMxIdLocalPart,
  isRoomAlias,
  mxcUrlToHttp,
  uploadContent,
} from '../../../utils/matrix';
import { MessageLayout, MessageSpacing, settingsAtom } from '../../../state/settings';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useRecentEmoji } from '../../../hooks/useRecentEmoji';
import { useSetting } from '../../../state/hooks/settings';
import { useAccountDataCallback } from '../../../hooks/useAccountDataCallback';
import * as css from './styles.css';
import { EventReaders } from '../../../components/event-readers';
import { TextViewer } from '../../../components/text-viewer';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { EmojiBoard } from '../../../components/emoji-board';
import { ReactionViewer } from '../reaction-viewer';
import { MessageEditor } from './MessageEditor';
import { UserAvatar } from '../../../components/user-avatar';
import { copyToClipboard } from '../../../utils/dom';
import { stopPropagation } from '../../../utils/keyboard';
import { getMatrixToRoomEvent } from '../../../plugins/matrix-to';
import { getViaServers } from '../../../plugins/via-servers';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { useRoomPinnedEvents } from '../../../hooks/useRoomPinnedEvents';
import { useFavoritesRoom, useFavoritesRoomId } from '../../../hooks/useFavoritesRoom';
import { MemberPowerTag, StateEvent } from '../../../../types/matrix/room';
import { PowerIcon } from '../../../components/power';
import colorMXID from '../../../../util/colorMXID';
import { getPowerTagIconSrc } from '../../../hooks/useMemberPowerTag';
import { ForwardableMessage } from '../forwardMessages';
import {
  FALLBACK_MIMETYPE,
  IMAGE_MIME_TYPES,
  getFileNameWithoutExt,
  mimeTypeToExt,
} from '../../../utils/mimeTypes';
import {
  addImageToDefaultPersonalPack,
  CINNY_SOURCE_MXC,
  ImageUsage,
  isDefaultPersonalPackImageSaved,
  PackImage,
} from '../../../plugins/custom-emoji';
import { AccountDataEvent } from '../../../../types/matrix/accountData';
import {
  ensureFavoritesRoom,
  favoriteMessageToRoom,
  getFavoriteEventsBySource,
  getFavoritesRoomId,
  removeFavoriteMessage,
  removeFavoriteNote,
} from '../../favorites';
import {
  parsePollData,
  POLL_START_EVENT_TYPE,
  UNSTABLE_POLL_START_EVENT_TYPE,
} from '../../../utils/polls';

export type ReactionHandler = (keyOrMxc: string, shortcode: string) => void;
const DEFAULT_INLINE_READ_RECEIPTS = 7;
const MIN_INLINE_READ_RECEIPTS = 1;
const MAX_INLINE_READ_RECEIPTS = 50;
const MESSAGE_EMOJI_REOPEN_SUPPRESS_MS = 400;

function MessageCopyIcon() {
  return (
    <>
      <path
        d="M8 4.75C8 3.7835 8.7835 3 9.75 3H17.25C18.2165 3 19 3.7835 19 4.75V14.25C19 15.2165 18.2165 16 17.25 16H9.75C8.7835 16 8 15.2165 8 14.25V4.75ZM9.5 4.75V14.25C9.5 14.3881 9.61193 14.5 9.75 14.5H17.25C17.3881 14.5 17.5 14.3881 17.5 14.25V4.75C17.5 4.61193 17.3881 4.5 17.25 4.5H9.75C9.61193 4.5 9.5 4.61193 9.5 4.75Z"
        fill="currentColor"
      />
      <path
        d="M5 8.75C5 7.7835 5.7835 7 6.75 7H7V8.5H6.75C6.61193 8.5 6.5 8.61193 6.5 8.75V18.25C6.5 18.3881 6.61193 18.5 6.75 18.5H14.25C14.3881 18.5 14.5 18.3881 14.5 18.25V18H16V18.25C16 19.2165 15.2165 20 14.25 20H6.75C5.7835 20 5 19.2165 5 18.25V8.75Z"
        fill="currentColor"
      />
    </>
  );
}

const getMessageCopyText = (mEvent: MatrixEvent): string | undefined => {
  if (mEvent.isRedacted()) return undefined;

  if (mEvent.getType() === EventType.Sticker) {
    const stickerBody = mEvent.getContent().body;
    return typeof stickerBody === 'string' ? stickerBody : '[贴图]';
  }

  if (
    mEvent.getType() === POLL_START_EVENT_TYPE ||
    mEvent.getType() === UNSTABLE_POLL_START_EVENT_TYPE
  ) {
    const poll = parsePollData(mEvent.getContent());
    return poll ? `[投票] ${poll.title}` : undefined;
  }

  if (mEvent.getType() !== EventType.RoomMessage) return undefined;

  const content = mEvent.getContent();
  const body = typeof content.body === 'string' ? trimReplyFromBody(content.body).trim() : '';
  if (body) return body;

  const msgType = content.msgtype ?? MsgType.Text;
  if (msgType === MsgType.Image) return '[图片]';
  if (msgType === MsgType.Video) return '[视频]';
  if (msgType === MsgType.Audio) return '[音频]';
  if (msgType === MsgType.File) return '[文件]';
  if (msgType === MsgType.Location) return '[位置]';

  return undefined;
};

type MessageMediaCopySource = {
  url: string;
  mimeType?: string;
  encInfo?: EncryptedAttachmentInfo;
};

const getMessageMediaCopySource = (mEvent: MatrixEvent): MessageMediaCopySource | undefined => {
  if (mEvent.isRedacted()) return undefined;

  const content = mEvent.getContent();
  const sourceUrl = typeof content.file?.url === 'string' ? content.file.url : content.url;
  const mimeType =
    typeof content.info?.mimetype === 'string' ? content.info.mimetype : undefined;

  if (typeof sourceUrl !== 'string') return undefined;

  if (mEvent.getType() === EventType.Sticker) {
    return {
      url: sourceUrl,
      mimeType,
      encInfo: content.file,
    };
  }

  if (mEvent.getType() !== EventType.RoomMessage || content.msgtype !== MsgType.Image) {
    return undefined;
  }

  return {
    url: sourceUrl,
    mimeType,
    encInfo: content.file,
  };
};

const getClipboardImageMimeType = (mimeType?: string, blobType?: string): string | undefined => {
  const candidates = [mimeType, blobType]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => value.split(';')[0].trim().toLowerCase());

  return candidates.find((value) => IMAGE_MIME_TYPES.includes(value));
};

type MessageEmojiSaveSource = {
  image: PackImage;
  preferredShortcode: string;
  fileName: string;
  mimeType?: string;
  encInfo?: EncryptedAttachmentInfo;
};

const getPackImageInfo = (info: unknown): PackImage['info'] | undefined => {
  if (!info || typeof info !== 'object') return undefined;

  const safeInfo: NonNullable<PackImage['info']> = {};
  const imageInfo = info as Record<string, unknown>;

  if (typeof imageInfo.w === 'number') safeInfo.w = imageInfo.w;
  if (typeof imageInfo.h === 'number') safeInfo.h = imageInfo.h;
  if (typeof imageInfo.mimetype === 'string') safeInfo.mimetype = imageInfo.mimetype;
  if (typeof imageInfo.size === 'number') safeInfo.size = imageInfo.size;
  if (typeof imageInfo['xyz.amorgan.blurhash'] === 'string') {
    safeInfo['xyz.amorgan.blurhash'] = imageInfo['xyz.amorgan.blurhash'];
  }

  return Object.keys(safeInfo).length > 0 ? safeInfo : undefined;
};

const getMessageEmojiFileName = (name: string, mimeType?: string): string => {
  const safeName = name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'image';

  if (safeName.lastIndexOf('.') > 0) return safeName;

  const normalizedMimeType = mimeType?.split(';')[0].trim().toLowerCase();
  const ext = normalizedMimeType ? mimeTypeToExt(normalizedMimeType) : '';

  return ext ? `${safeName}.${ext}` : safeName;
};

const getMessageEmojiSaveSource = (mEvent: MatrixEvent): MessageEmojiSaveSource | undefined => {
  if (mEvent.isRedacted()) return undefined;

  const content = mEvent.getContent();
  const sourceUrl = typeof content.file?.url === 'string' ? content.file.url : content.url;

  if (typeof sourceUrl !== 'string') return undefined;

  const mimeType =
    typeof content.info?.mimetype === 'string' ? content.info.mimetype : undefined;
  const body = typeof content.body === 'string' ? content.body : undefined;
  const filename = typeof content.filename === 'string' ? content.filename : undefined;

  if (
    mEvent.getType() !== EventType.Sticker &&
    (mEvent.getType() !== EventType.RoomMessage || content.msgtype !== MsgType.Image)
  ) {
    return undefined;
  }

  const label = filename ?? body ?? 'image';

  return {
    image: {
      url: sourceUrl,
      body,
      info: getPackImageInfo(content.info),
      usage:
        mEvent.getType() === EventType.Sticker
          ? [ImageUsage.Sticker]
          : [ImageUsage.Emoticon, ImageUsage.Sticker],
    },
    preferredShortcode: getFileNameWithoutExt(label),
    fileName: getMessageEmojiFileName(label, mimeType),
    mimeType,
    encInfo: content.file,
  };
};

const uploadPackImageFile = async (mx: MatrixClient, file: File) =>
  new Promise<string>((resolve, reject) => {
    uploadContent(mx, file, {
      name: file.name,
      fileType: file.type,
      onSuccess: resolve,
      onError: reject,
    });
  });

type MessageQuickReactionsProps = {
  onReaction: ReactionHandler;
};
export const MessageQuickReactions = as<'div', MessageQuickReactionsProps>(
  ({ onReaction, ...props }, ref) => {
    const mx = useMatrixClient();
    const recentEmojis = useRecentEmoji(mx, 4);

    if (recentEmojis.length === 0) return <span />;
    return (
      <>
        <Box
          style={{ padding: config.space.S200 }}
          alignItems="Center"
          justifyContent="Center"
          gap="200"
          {...props}
          ref={ref}
        >
          {recentEmojis.map((emoji) => (
            <IconButton
              key={emoji.unicode}
              className={css.MessageQuickReaction}
              size="300"
              variant="SurfaceVariant"
              radii="Pill"
              title={emoji.shortcode}
              aria-label={emoji.shortcode}
              onClick={() => onReaction(emoji.unicode, emoji.shortcode)}
            >
              <Text size="T500">{emoji.unicode}</Text>
            </IconButton>
          ))}
        </Box>
        <Line size="300" />
      </>
    );
  }
);

export const MessageAllReactionItem = as<
  'button',
  {
    room: Room;
    relations: Relations;
    onClose?: () => void;
  }
>(({ room, relations, onClose, ...props }, ref) => {
  const [open, setOpen] = useState(false);

  const handleClose = () => {
    setOpen(false);
    onClose?.();
  };

  return (
    <>
      <Overlay
        onContextMenu={(evt: any) => {
          evt.stopPropagation();
        }}
        open={open}
        backdrop={<OverlayBackdrop />}
      >
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              returnFocusOnDeactivate: false,
              onDeactivate: () => handleClose(),
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Modal variant="Surface" size="300">
              <ReactionViewer
                room={room}
                relations={relations}
                requestClose={() => setOpen(false)}
              />
            </Modal>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
      <MenuItem
        size="300"
        after={<Icon size="100" src={Icons.Smile} />}
        radii="300"
        onClick={() => setOpen(true)}
        {...props}
        ref={ref}
        aria-pressed={open}
      >
        <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
          查看回应
        </Text>
      </MenuItem>
    </>
  );
});

export const MessageReadReceiptItem = as<
  'button',
  {
    room: Room;
    eventId: string;
    onClose?: () => void;
  }
>(({ room, eventId, onClose, ...props }, ref) => {
  const [open, setOpen] = useState(false);

  const handleClose = () => {
    setOpen(false);
    onClose?.();
  };

  return (
    <>
      <Overlay open={open} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: handleClose,
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Modal variant="Surface" size="300">
              <EventReaders room={room} eventId={eventId} requestClose={handleClose} />
            </Modal>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
      <MenuItem
        size="300"
        after={<Icon size="100" src={Icons.CheckTwice} />}
        radii="300"
        onClick={() => setOpen(true)}
        {...props}
        ref={ref}
        aria-pressed={open}
      >
        <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
          已读详情
        </Text>
      </MenuItem>
    </>
  );
});

export const MessageSourceCodeItem = as<
  'button',
  {
    room: Room;
    mEvent: MatrixEvent;
    onClose?: () => void;
  }
>(({ room, mEvent, onClose, ...props }, ref) => {
  const [open, setOpen] = useState(false);

  const getContent = (evt: MatrixEvent) =>
    evt.isEncrypted()
      ? {
          [`<== DECRYPTED_EVENT ==>`]: evt.getEffectiveEvent(),
          [`<== ORIGINAL_EVENT ==>`]: evt.event,
        }
      : evt.event;

  const getText = (): string => {
    const evtId = mEvent.getId()!;
    const evtTimeline = room.getTimelineForEvent(evtId);
    const edits =
      evtTimeline &&
      getEventEdits(evtTimeline.getTimelineSet(), evtId, mEvent.getType())?.getRelations();

    if (!edits) return JSON.stringify(getContent(mEvent), null, 2);

    const content: Record<string, unknown> = {
      '<== MAIN_EVENT ==>': getContent(mEvent),
    };

    edits.forEach((editEvt, index) => {
      content[`<== REPLACEMENT_EVENT_${index + 1} ==>`] = getContent(editEvt);
    });

    return JSON.stringify(content, null, 2);
  };

  const handleClose = () => {
    setOpen(false);
    onClose?.();
  };

  return (
    <>
      <Overlay open={open} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: handleClose,
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Modal variant="Surface" size="500">
              <TextViewer
                name="消息源码"
                langName="json"
                text={getText()}
                requestClose={handleClose}
              />
            </Modal>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
      <MenuItem
        size="300"
        after={<Icon size="100" src={Icons.BlockCode} />}
        radii="300"
        onClick={() => setOpen(true)}
        {...props}
        ref={ref}
        aria-pressed={open}
      >
        <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
          查看源码
        </Text>
      </MenuItem>
    </>
  );
});

export const MessageCopyLinkItem = as<
  'button',
  {
    room: Room;
    mEvent: MatrixEvent;
    onClose?: () => void;
  }
>(({ room, mEvent, onClose, ...props }, ref) => {
  const mx = useMatrixClient();

  const handleCopy = () => {
    const eventId = mEvent.getId();
    if (!eventId) return;
    copyToClipboard(getMatrixToRoomEvent(room.roomId, eventId, getViaServers(room)));
    onClose?.();
  };

  return (
    <MenuItem
      size="300"
      after={<Icon size="100" src={Icons.Link} />}
      radii="300"
      onClick={handleCopy}
      {...props}
      ref={ref}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        复制链接
      </Text>
    </MenuItem>
  );
});

export const MessageCopyTextItem = as<
  'button',
  {
    mEvent: MatrixEvent;
    onClose?: () => void;
  }
>(({ mEvent, onClose, ...props }, ref) => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const handleCopy = async () => {
    const mediaSource = getMessageMediaCopySource(mEvent);

    if (
      mediaSource &&
      navigator.clipboard?.write &&
      typeof ClipboardItem !== 'undefined'
    ) {
      try {
        const mediaUrl = mxcUrlToHttp(mx, mediaSource.url, useAuthentication);
        if (mediaUrl) {
          const mediaBlob = mediaSource.encInfo
            ? await downloadEncryptedMedia(mediaUrl, (encBuf) =>
                decryptFile(
                  encBuf,
                  mediaSource.mimeType ?? FALLBACK_MIMETYPE,
                  mediaSource.encInfo as EncryptedAttachmentInfo
                )
              )
            : await downloadMedia(mediaUrl);

          const imageMimeType = getClipboardImageMimeType(mediaSource.mimeType, mediaBlob.type);
          if (imageMimeType) {
            const clipboardBlob =
              mediaBlob.type === imageMimeType
                ? mediaBlob
                : new Blob([mediaBlob], { type: imageMimeType });

            await navigator.clipboard.write([
              new ClipboardItem({
                [imageMimeType]: clipboardBlob,
              }),
            ]);
            onClose?.();
            return;
          }
        }
      } catch {
        // fall back to text copy when binary clipboard write is unavailable
      }
    }

    const text = getMessageCopyText(mEvent);
    if (!text) return;
    copyToClipboard(text);
    onClose?.();
  };

  return (
    <MenuItem
      size="300"
      after={<Icon size="100" src={MessageCopyIcon} />}
      radii="300"
      onClick={handleCopy}
      {...props}
      ref={ref}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        复制消息
      </Text>
    </MenuItem>
  );
});

export const MessagePinItem = as<
  'button',
  {
    room: Room;
    mEvent: MatrixEvent;
    onClose?: () => void;
  }
>(({ room, mEvent, onClose, ...props }, ref) => {
  const mx = useMatrixClient();
  const pinnedEvents = useRoomPinnedEvents(room);
  const isPinned = pinnedEvents.includes(mEvent.getId() ?? '');

  const handlePin = () => {
    const eventId = mEvent.getId();
    const pinContent: RoomPinnedEventsEventContent = {
      pinned: Array.from(pinnedEvents).filter((id) => id !== eventId),
    };
    if (!isPinned && eventId) {
      pinContent.pinned.push(eventId);
    }
    mx.sendStateEvent(room.roomId, StateEvent.RoomPinnedEvents as any, pinContent);
    onClose?.();
  };

  return (
    <MenuItem
      size="300"
      after={<Icon size="100" src={Icons.Pin} />}
      radii="300"
      onClick={handlePin}
      {...props}
      ref={ref}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        {isPinned ? '取消置顶消息' : '置顶消息'}
      </Text>
    </MenuItem>
  );
});

export const MessageForwardItem = as<
  'button',
  {
    selected: boolean;
    onToggle: () => void;
    onClose?: () => void;
  }
>(({ selected, onToggle, onClose, ...props }, ref) => (
  <MenuItem
    size="300"
    after={<Icon size="100" src={selected ? Icons.Check : Icons.ArrowGoRight} />}
    radii="300"
    onClick={() => {
      onToggle();
      onClose?.();
    }}
    {...props}
    ref={ref}
  >
    <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
      {selected
        ? '\u53d6\u6d88\u8f6c\u53d1\u9009\u62e9'
        : '\u52a0\u5165\u8f6c\u53d1\u5217\u8868'}
    </Text>
  </MenuItem>
));

export const MessageFavoriteItem = as<
  'button',
  {
    room: Room;
    mEvent: MatrixEvent;
    onClose?: () => void;
  }
>(({ room, mEvent, onClose, ...props }, ref) => {
  const mx = useMatrixClient();
  const favoritesRoom = useFavoritesRoom();
  const sourceEventId = mEvent.getId() ?? '';

  const getFavoriteEventIds = useCallback(
    () =>
      getFavoriteEventsBySource(favoritesRoom, room.roomId, sourceEventId)
        .map((event) => event.getId())
        .filter((eventId): eventId is string => typeof eventId === 'string'),
    [favoritesRoom, room.roomId, sourceEventId]
  );

  const [favoriteEventIds, setFavoriteEventIds] = useState<string[]>(getFavoriteEventIds);

  useEffect(() => {
    setFavoriteEventIds(getFavoriteEventIds());
  }, [getFavoriteEventIds]);

  useEffect(() => {
    if (!favoritesRoom) return undefined;

    const refresh = () => setFavoriteEventIds(getFavoriteEventIds());

    favoritesRoom.on(RoomEvent.Timeline, refresh);
    favoritesRoom.on(RoomEvent.TimelineRefresh, refresh);

    return () => {
      favoritesRoom.removeListener(RoomEvent.Timeline, refresh);
      favoritesRoom.removeListener(RoomEvent.TimelineRefresh, refresh);
    };
  }, [favoritesRoom, getFavoriteEventIds]);

  const favorited = favoriteEventIds.length > 0;
  const [favoriteState, favorite] = useAsyncCallback(
    useCallback(async () => {
      if (favorited) {
        const targetFavoritesRoomId = favoritesRoom?.roomId ?? getFavoritesRoomId(mx);
        if (!targetFavoritesRoomId) {
          throw new Error('Missing favorites room id.');
        }

        await Promise.all(
          favoriteEventIds.map((eventId) =>
            removeFavoriteMessage(mx, targetFavoritesRoomId, eventId)
          )
        );
        await removeFavoriteNote(mx, room.roomId, sourceEventId);

        return {
          eventIds: [] as string[],
          favorited: false,
        };
      }

      const favoritesRoomId = favoritesRoom?.roomId ?? (await ensureFavoritesRoom(mx));
      const favoriteEventId = await favoriteMessageToRoom(mx, favoritesRoomId, room, mEvent);

      return {
        eventIds: favoriteEventId ? [favoriteEventId] : getFavoriteEventIds(),
        favorited: true,
      };
    }, [favorited, favoriteEventIds, favoritesRoom, mx, room, mEvent, getFavoriteEventIds])
  );

  const handleFavorite = () => {
    if (favoriteState.status === AsyncStatus.Loading) return;

    favorite()
      .then((result) => {
        if (!result) return;
        setFavoriteEventIds(result.eventIds);
      })
      .catch(() => {});
  };

  const favoriteLoadingLabel = favorited ? '\u53d6\u6d88\u4e2d...' : '\u6536\u85cf\u4e2d...';
  const favoriteDefaultLabel = favorited ? '\u5df2\u6536\u85cf' : '\u6536\u85cf';

  return (
    <MenuItem
      size="300"
      after={
        favoriteState.status === AsyncStatus.Loading ? (
          <Spinner size="100" variant="Secondary" />
        ) : (
          <Icon
            style={favorited ? { color: color.Critical.Main } : undefined}
            size="100"
            src={Icons.Heart}
            filled={favorited}
          />
        )
      }
      radii="300"
      onClick={handleFavorite}
      aria-pressed={favorited}
      {...props}
      ref={ref}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        {favoriteState.status === AsyncStatus.Loading
          ? favoriteLoadingLabel
          : favoriteDefaultLabel}
      </Text>
    </MenuItem>
  );
});

export const MessageSaveEmojiItem = as<
  'button',
  {
    mEvent: MatrixEvent;
    onClose?: () => void;
  }
>(({ mEvent, ...props }, ref) => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const saveSource = getMessageEmojiSaveSource(mEvent);
  const [saved, setSaved] = useState(() =>
    isDefaultPersonalPackImageSaved(mx, saveSource?.image.url)
  );

  useEffect(() => {
    setSaved(isDefaultPersonalPackImageSaved(mx, saveSource?.image.url));
  }, [mx, saveSource]);

  useAccountDataCallback(
    mx,
    useCallback(
      (mEventData) => {
        if (mEventData.getType() === AccountDataEvent.PoniesUserEmotes) {
          setSaved(isDefaultPersonalPackImageSaved(mx, saveSource?.image.url));
        }
      },
      [mx, saveSource]
    )
  );

  const [saveState, saveEmoji] = useAsyncCallback(
    useCallback(async () => {
      if (!saveSource) throw new Error('Message does not contain a savable image.');
      if (isDefaultPersonalPackImageSaved(mx, saveSource.image.url)) {
        return saveSource.preferredShortcode;
      }

      let nextImage = saveSource.image;

      if (saveSource.encInfo) {
        const mediaUrl = mxcUrlToHttp(mx, saveSource.image.url, useAuthentication);
        if (!mediaUrl) {
          throw new Error('Invalid media URL.');
        }

        const mediaBlob = await downloadEncryptedMedia(mediaUrl, (encBuf) =>
          decryptFile(
            encBuf,
            saveSource.mimeType ?? FALLBACK_MIMETYPE,
            saveSource.encInfo as EncryptedAttachmentInfo
          )
        );
        const uploadMimeType =
          getClipboardImageMimeType(saveSource.mimeType, mediaBlob.type) ??
          saveSource.mimeType ??
          mediaBlob.type ??
          FALLBACK_MIMETYPE;
        const uploadFile = new File([mediaBlob], saveSource.fileName, {
          type: uploadMimeType,
        });
        const uploadedMxc = await uploadPackImageFile(mx, uploadFile);

        nextImage = {
          ...saveSource.image,
          url: uploadedMxc,
          [CINNY_SOURCE_MXC]: saveSource.image.url,
          info: {
            ...saveSource.image.info,
            mimetype: uploadFile.type,
            size: uploadFile.size,
          },
        };
      }

      return addImageToDefaultPersonalPack(mx, nextImage, saveSource.preferredShortcode);
    }, [mx, saveSource, useAuthentication])
  );

  if (!saveSource) return null;

  const handleSave = () => {
    if (saveState.status === AsyncStatus.Loading || saved) return;

    saveEmoji()
      .then(() => {
        setSaved(true);
      })
      .catch(() => undefined);
  };

  const saveLabel =
    saveState.status === AsyncStatus.Loading
      ? '\u6536\u85cf\u4e2d...'
      : saved
        ? '\u5df2\u6536\u85cf'
      : saveState.status === AsyncStatus.Error
        ? '\u6536\u85cf\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5'
        : '\u6536\u85cf\u8868\u60c5';

  return (
    <MenuItem
      size="300"
      after={
        saveState.status === AsyncStatus.Loading ? (
          <Spinner size="100" variant="Secondary" />
        ) : (
          <Icon
            size="100"
            src={saved ? Icons.Check : Icons.Sticker}
            style={saved ? { color: color.Success.Main } : undefined}
          />
        )
      }
      radii="300"
      onClick={handleSave}
      aria-pressed={saved}
      {...props}
      ref={ref}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        {saveLabel}
      </Text>
    </MenuItem>
  );
});

export const MessageInlineReadReceipts = as<
  'button',
  {
    room: Room;
    eventId: string;
    readerIds: string[];
    placement?: 'inline' | 'aside';
  }
>(({ room, eventId, readerIds, placement = 'inline', ...props }, ref) => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [readReceiptAvatarCount] = useSetting(settingsAtom, 'readReceiptAvatarCount');
  const [open, setOpen] = useState(false);
  const aside = placement === 'aside';

  const configuredVisibleCount = Number.isFinite(readReceiptAvatarCount)
    ? Math.trunc(readReceiptAvatarCount)
    : DEFAULT_INLINE_READ_RECEIPTS;
  const visibleCount = Math.max(
    Math.min(configuredVisibleCount, MAX_INLINE_READ_RECEIPTS),
    MIN_INLINE_READ_RECEIPTS
  );
  const visibleReaderIds = readerIds.slice(0, visibleCount);
  const overflowCount = Math.max(readerIds.length - visibleReaderIds.length, 0);

  const getName = (readerId: string) =>
    getMemberDisplayName(room, readerId) ?? getMxIdLocalPart(readerId) ?? readerId;

  return (
    <>
      <Overlay open={open} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setOpen(false),
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Modal variant="Surface" size="300">
              <EventReaders
                room={room}
                eventId={eventId}
                readerIds={readerIds}
                requestClose={() => setOpen(false)}
              />
            </Modal>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
      <Box
        className={classNames(
          css.MessageReadReceiptsRow,
          aside && css.MessageReadReceiptsRowAside
        )}
      >
        <button
          className={classNames(
            css.MessageReadReceiptsButton,
            aside && css.MessageReadReceiptsButtonAside
          )}
          type="button"
          onClick={() => setOpen(true)}
          aria-pressed={open}
          aria-label={`\u5df2\u8bfb ${readerIds.length} \u4eba`}
          {...props}
          ref={ref}
        >
          {!aside && (
            <Icon className={css.MessageReadReceiptsIcon} size="100" src={Icons.CheckTwice} />
          )}
          {overflowCount > 0 && (
            <Text
              className={classNames(
                css.MessageReadReceiptOverflow,
                aside && css.MessageReadReceiptOverflowAside
              )}
              size="T100"
              priority="300"
            >
              {`+${overflowCount}`}
            </Text>
          )}
          <Box
            className={classNames(
              css.MessageReadReceiptStack,
              aside && css.MessageReadReceiptStackAside
            )}
          >
            {visibleReaderIds.map((readerId) => {
              const avatarMxcUrl = room.getMember(readerId)?.getMxcAvatarUrl();
              const avatarUrl = avatarMxcUrl
                ? mx.mxcUrlToHttp(avatarMxcUrl, 48, 48, 'crop', undefined, false, useAuthentication)
                : undefined;

              return (
                <Avatar
                  key={readerId}
                  className={classNames(
                    css.MessageReadReceiptAvatar,
                    aside && css.MessageReadReceiptAvatarAside
                  )}
                  size="200"
                  title={getName(readerId)}
                >
                  <UserAvatar
                    userId={readerId}
                    src={avatarUrl ?? undefined}
                    alt={getName(readerId)}
                    renderFallback={() => <Icon size="50" src={Icons.User} filled />}
                  />
                </Avatar>
              );
            })}
          </Box>
        </button>
      </Box>
    </>
  );
});

export const MessageDeleteItem = as<
  'button',
  {
    room: Room;
    mEvent: MatrixEvent;
    onClose?: () => void;
  }
>(({ room, mEvent, onClose, ...props }, ref) => {
  const mx = useMatrixClient();
  const [open, setOpen] = useState(false);

  const [deleteState, deleteMessage] = useAsyncCallback(
    useCallback(
      (eventId: string, reason?: string) =>
        mx.redactEvent(room.roomId, eventId, undefined, reason ? { reason } : undefined),
      [mx, room]
    )
  );

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const eventId = mEvent.getId();
    if (
      !eventId ||
      deleteState.status === AsyncStatus.Loading ||
      deleteState.status === AsyncStatus.Success
    )
      return;
    const target = evt.target as HTMLFormElement | undefined;
    const reasonInput = target?.reasonInput as HTMLInputElement | undefined;
    const reason = reasonInput && reasonInput.value.trim();
    deleteMessage(eventId, reason);
  };

  const handleClose = () => {
    setOpen(false);
    onClose?.();
  };

  return (
    <>
      <Overlay open={open} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: handleClose,
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Dialog variant="Surface">
              <Header
                style={{
                  padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                  borderBottomWidth: config.borderWidth.B300,
                }}
                variant="Surface"
                size="500"
              >
                <Box grow="Yes">
                  <Text size="H4">删除消息</Text>
                </Box>
                <IconButton size="300" onClick={handleClose} radii="300">
                  <Icon src={Icons.Cross} />
                </IconButton>
              </Header>
              <Box
                as="form"
                onSubmit={handleSubmit}
                style={{ padding: config.space.S400 }}
                direction="Column"
                gap="400"
              >
                <Text priority="400">
                  删除后无法恢复，确定要删除这条消息吗？
                </Text>
                <Box direction="Column" gap="100">
                  <Text size="L400">
                    删除原因{' '}
                    <Text as="span" size="T200">
                      （可选）
                    </Text>
                  </Text>
                  <Input name="reasonInput" variant="Background" />
                  {deleteState.status === AsyncStatus.Error && (
                    <Text style={{ color: color.Critical.Main }} size="T300">
                      删除失败，请稍后重试。
                    </Text>
                  )}
                </Box>
                <Button
                  type="submit"
                  variant="Critical"
                  before={
                    deleteState.status === AsyncStatus.Loading ? (
                      <Spinner fill="Solid" variant="Critical" size="200" />
                    ) : undefined
                  }
                  aria-disabled={deleteState.status === AsyncStatus.Loading}
                >
                  <Text size="B400">
                    {deleteState.status === AsyncStatus.Loading ? '删除中...' : '删除'}
                  </Text>
                </Button>
              </Box>
            </Dialog>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
      <Button
        variant="Critical"
        fill="None"
        size="300"
        after={<Icon size="100" src={Icons.Delete} />}
        radii="300"
        onClick={() => setOpen(true)}
        aria-pressed={open}
        {...props}
        ref={ref}
      >
        <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
          删除
        </Text>
      </Button>
    </>
  );
});

export const MessageReportItem = as<
  'button',
  {
    room: Room;
    mEvent: MatrixEvent;
    onClose?: () => void;
  }
>(({ room, mEvent, onClose, ...props }, ref) => {
  const mx = useMatrixClient();
  const [open, setOpen] = useState(false);

  const [reportState, reportMessage] = useAsyncCallback(
    useCallback(
      (eventId: string, score: number, reason: string) =>
        mx.reportEvent(room.roomId, eventId, score, reason),
      [mx, room]
    )
  );

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const eventId = mEvent.getId();
    if (
      !eventId ||
      reportState.status === AsyncStatus.Loading ||
      reportState.status === AsyncStatus.Success
    )
      return;
    const target = evt.target as HTMLFormElement | undefined;
    const reasonInput = target?.reasonInput as HTMLInputElement | undefined;
    const reason = reasonInput && reasonInput.value.trim();
    if (reasonInput) reasonInput.value = '';
    reportMessage(eventId, reason ? -100 : -50, reason || '未填写原因');
  };

  const handleClose = () => {
    setOpen(false);
    onClose?.();
  };

  return (
    <>
      <Overlay open={open} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: handleClose,
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Dialog variant="Surface">
              <Header
                style={{
                  padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                  borderBottomWidth: config.borderWidth.B300,
                }}
                variant="Surface"
                size="500"
              >
                <Box grow="Yes">
                  <Text size="H4">举报消息</Text>
                </Box>
                <IconButton size="300" onClick={handleClose} radii="300">
                  <Icon src={Icons.Cross} />
                </IconButton>
              </Header>
              <Box
                as="form"
                onSubmit={handleSubmit}
                style={{ padding: config.space.S400 }}
                direction="Column"
                gap="400"
              >
                <Text priority="400">
                  举报后服务器可能会通知管理员或相关处理人员进行核查。
                </Text>
                <Box direction="Column" gap="100">
                  <Text size="L400">举报原因</Text>
                  <Input name="reasonInput" variant="Background" required />
                  {reportState.status === AsyncStatus.Error && (
                    <Text style={{ color: color.Critical.Main }} size="T300">
                      举报失败，请稍后重试。
                    </Text>
                  )}
                  {reportState.status === AsyncStatus.Success && (
                    <Text style={{ color: color.Success.Main }} size="T300">
                      已成功举报这条消息。
                    </Text>
                  )}
                </Box>
                <Button
                  type="submit"
                  variant="Critical"
                  before={
                    reportState.status === AsyncStatus.Loading ? (
                      <Spinner fill="Solid" variant="Critical" size="200" />
                    ) : undefined
                  }
                  aria-disabled={
                    reportState.status === AsyncStatus.Loading ||
                    reportState.status === AsyncStatus.Success
                  }
                >
                  <Text size="B400">
                    {reportState.status === AsyncStatus.Loading ? '提交中...' : '举报'}
                  </Text>
                </Button>
              </Box>
            </Dialog>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
      <Button
        variant="Critical"
        fill="None"
        size="300"
        after={<Icon size="100" src={Icons.Warning} />}
        radii="300"
        onClick={() => setOpen(true)}
        aria-pressed={open}
        {...props}
        ref={ref}
      >
        <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
          举报
        </Text>
      </Button>
    </>
  );
});

export type MessageProps = {
  room: Room;
  mEvent: MatrixEvent;
  forwardSource?: ForwardableMessage;
  forwardSelectionMode?: boolean;
  forwardSelected?: boolean;
  onToggleForwardSelection?: (message: ForwardableMessage) => void;
  collapse: boolean;
  highlight: boolean;
  edit?: boolean;
  canDelete?: boolean;
  canSendReaction?: boolean;
  canPinEvent?: boolean;
  imagePackRooms?: Room[];
  relations?: Relations;
  messageLayout: MessageLayout;
  messageSpacing: MessageSpacing;
  onUserClick: MouseEventHandler<HTMLButtonElement>;
  onUsernameClick: MouseEventHandler<HTMLButtonElement>;
  onReplyClick: (
    ev: Parameters<MouseEventHandler<HTMLButtonElement>>[0],
    startThread?: boolean
  ) => void;
  onEditId?: (eventId?: string) => void;
  onReactionToggle: (targetEventId: string, key: string, shortcode?: string) => void;
  reply?: ReactNode;
  reactions?: ReactNode;
  hideReadReceipts?: boolean;
  showDeveloperTools?: boolean;
  memberPowerTag?: MemberPowerTag;
  accessibleTagColors?: Map<string, string>;
  legacyUsernameColor?: boolean;
  hour24Clock: boolean;
  dateFormatString: string;
  readReceiptUserIds?: string[];
};

type PendingMessageStatus = 'encrypting' | 'queued' | 'sending' | 'not_sent' | 'cancelled';

const getPendingMessageStatus = (mEvent: MatrixEvent): PendingMessageStatus | undefined => {
  const status = (mEvent as MatrixEvent & { status?: unknown }).status;
  return typeof status === 'string' ? (status as PendingMessageStatus) : undefined;
};

const isPlainTextPendingMessage = (mEvent: MatrixEvent): boolean => {
  if (mEvent.getType() !== EventType.RoomMessage) return false;

  const msgType = mEvent.getContent().msgtype ?? MsgType.Text;
  return msgType === MsgType.Text || msgType === MsgType.Notice || msgType === MsgType.Emote;
};

function MessageSendStatus({ room, mEvent }: { room: Room; mEvent: MatrixEvent }) {
  const mx = useMatrixClient();
  const status = getPendingMessageStatus(mEvent);
  const plainTextPendingMessage = isPlainTextPendingMessage(mEvent);

  const [retryState, retrySend] = useAsyncCallback<void, Error, []>(
    useCallback(async () => {
      const resendEvent = (
        mx as MatrixClient & {
          resendEvent?: (event: MatrixEvent, eventRoom: Room) => Promise<unknown>;
        }
      ).resendEvent;

      if (typeof resendEvent !== 'function') {
        throw new Error('当前版本暂不支持重新发送失败消息。');
      }

      await resendEvent.call(mx, mEvent, room);
    }, [mx, mEvent, room])
  );

  if (!status || mEvent.getSender() !== mx.getUserId()) {
    return null;
  }

  let statusText: string | undefined;
  let statusColor = color.Warning.Main;

  if (plainTextPendingMessage) {
    if (status !== 'not_sent') {
      return null;
    }

    statusText =
      retryState.status === AsyncStatus.Error
        ? retryState.error.message || '重新发送失败，这条消息目前可能只有你自己可见。'
        : '发送失败，这条消息目前可能只有你自己可见。';
    statusColor = color.Critical.Main;
  } else if (retryState.status === AsyncStatus.Loading && status === 'not_sent') {
    statusText = '正在重新发送...';
  } else if (retryState.status === AsyncStatus.Error && status === 'not_sent') {
    statusText =
      retryState.error.message || '重新发送失败，这条消息目前可能只有你自己可见。';
    statusColor = color.Critical.Main;
  } else {
    switch (status) {
      case 'encrypting':
        statusText = '正在加密并发送...';
        break;
      case 'queued':
        statusText = '已加入发送队列...';
        break;
      case 'sending':
        statusText = '发送中...';
        break;
      case 'not_sent':
        statusText = '发送失败，这条消息目前可能只有你自己可见。';
        statusColor = color.Critical.Main;
        break;
      case 'cancelled':
        statusText = '这条消息已取消发送。';
        break;
      default:
        statusText = undefined;
    }
  }

  if (!statusText) return null;

  return (
    <Box className={css.MessageSendStatus}>
      <Text size="T200" style={{ color: statusColor }}>
        {statusText}
      </Text>
      {status === 'not_sent' && (
        <Button
          size="300"
          variant="Critical"
          fill="None"
          radii="Pill"
          disabled={retryState.status === AsyncStatus.Loading}
          onClick={() => {
            retrySend().catch(() => undefined);
          }}
          before={
            !plainTextPendingMessage && retryState.status === AsyncStatus.Loading ? (
              <Spinner fill="Solid" variant="Critical" size="100" />
            ) : undefined
          }
        >
          <Text size="B300">
            {!plainTextPendingMessage && retryState.status === AsyncStatus.Loading
              ? '重试中...'
              : '重试'}
          </Text>
        </Button>
      )}
    </Box>
  );
}

export const Message = as<'div', MessageProps>(
  (
    {
      className,
      room,
      mEvent,
      forwardSource,
      forwardSelectionMode,
      forwardSelected,
      onToggleForwardSelection,
      collapse,
      highlight,
      edit,
      canDelete,
      canSendReaction,
      canPinEvent,
      imagePackRooms,
      relations,
      messageLayout,
      messageSpacing,
      onUserClick,
      onUsernameClick,
      onReplyClick,
      onReactionToggle,
      onEditId,
      reply,
      reactions,
      hideReadReceipts,
      showDeveloperTools,
      memberPowerTag,
      accessibleTagColors,
      legacyUsernameColor,
      hour24Clock,
      dateFormatString,
      readReceiptUserIds,
      children,
      ...props
    },
    ref
  ) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const favoritesRoomId = useFavoritesRoomId();
    const senderId = mEvent.getSender() ?? '';
    const isOwnMessage = senderId === mx.getUserId();

    const [hover, setHover] = useState(false);
    const { hoverProps } = useHover({ onHoverChange: setHover });
    const { focusWithinProps } = useFocusWithin({ onFocusWithinChange: setHover });
    const [menuAnchor, setMenuAnchor] = useState<RectCords>();
    const [emojiBoardAnchor, setEmojiBoardAnchor] = useState<RectCords>();
    const emojiBoardTriggerAtRef = useRef(0);
    const emojiBoardSuppressOpenUntilRef = useRef(0);

    const senderDisplayName =
      getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? senderId;
    const senderAvatarMxc = getMemberAvatarMxc(room, senderId);

    const tagColor = memberPowerTag?.color
      ? accessibleTagColors?.get(memberPowerTag.color)
      : undefined;
    const tagIconSrc = memberPowerTag?.icon
      ? getPowerTagIconSrc(mx, useAuthentication, memberPowerTag.icon)
      : undefined;
    const usernameColor = legacyUsernameColor ? colorMXID(senderId) : tagColor;

    const headerJSX = !collapse && (
      <Box
        gap="300"
        direction={messageLayout === MessageLayout.Compact ? 'RowReverse' : 'Row'}
        justifyContent="SpaceBetween"
        alignItems="Baseline"
        grow="Yes"
      >
        <Box alignItems="Center" gap="200">
          <Username
            as="button"
            style={{ color: usernameColor }}
            data-user-id={senderId}
            onContextMenu={onUserClick}
            onClick={onUsernameClick}
          >
            <Text
              as="span"
              size={messageLayout === MessageLayout.Bubble ? 'T300' : 'T400'}
              truncate
            >
              <UsernameBold>{senderDisplayName}</UsernameBold>
            </Text>
          </Username>
          {tagIconSrc && <PowerIcon size="100" iconSrc={tagIconSrc} />}
        </Box>
        <Box shrink="No" gap="100">
          {messageLayout === MessageLayout.Modern && hover && (
            <>
              <Text as="span" size="T200" priority="300">
                {senderId}
              </Text>
              <Text as="span" size="T200" priority="300">
                |
              </Text>
            </>
          )}
          <Time
            ts={mEvent.getTs()}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        </Box>
      </Box>
    );

    const avatarJSX = !collapse && messageLayout !== MessageLayout.Compact && (
      <AvatarBase
        className={messageLayout === MessageLayout.Bubble ? css.BubbleAvatarBase : undefined}
      >
        <Avatar
          className={css.MessageAvatar}
          as="button"
          size="300"
          data-user-id={senderId}
          onClick={onUserClick}
        >
          <UserAvatar
            userId={senderId}
            src={
              senderAvatarMxc
                ? mxcUrlToHttp(mx, senderAvatarMxc, useAuthentication, 48, 48, 'crop') ?? undefined
                : undefined
            }
            alt={senderDisplayName}
            renderFallback={() => <Icon size="200" src={Icons.User} filled />}
          />
        </Avatar>
      </AvatarBase>
    );

    const readReceiptsJSX =
      !hideReadReceipts && readReceiptUserIds && readReceiptUserIds.length > 0 ? (
        <MessageInlineReadReceipts
          room={room}
          eventId={mEvent.getId() ?? ''}
          readerIds={readReceiptUserIds}
          placement={messageLayout === MessageLayout.Bubble ? 'aside' : 'inline'}
        />
      ) : null;

    const messageBodyJSX = edit && onEditId ? (
      <MessageEditor
        style={{
          maxWidth: '100%',
          width: '100vw',
        }}
        roomId={room.roomId}
        room={room}
        mEvent={mEvent}
        imagePackRooms={imagePackRooms}
        onCancel={() => onEditId()}
      />
    ) : (
      children
    );

    const bubbleContentJSX = (
      <Box
        direction="Column"
        alignSelf="Start"
        style={{
          maxWidth: '100%',
        }}
      >
        {reply}
        {messageBodyJSX}
        {reactions}
        <MessageSendStatus room={room} mEvent={mEvent} />
      </Box>
    );

    const msgContentJSX = (
      <Box
        direction="Column"
        alignSelf="Start"
        style={{
          maxWidth: '100%',
        }}
      >
        {reply}
        {messageBodyJSX}
        {reactions}
        <MessageSendStatus room={room} mEvent={mEvent} />
        {messageLayout !== MessageLayout.Bubble && readReceiptsJSX}
      </Box>
    );

    const handleToggleForwardSelection = useCallback(() => {
      if (!forwardSource || !onToggleForwardSelection) return;
      onToggleForwardSelection(forwardSource);
    }, [forwardSource, onToggleForwardSelection]);

    const handleContextMenu: MouseEventHandler<HTMLDivElement> = (evt) => {
      if (evt.altKey || !window.getSelection()?.isCollapsed || edit) return;
      const tag = (evt.target as any).tagName;
      if (typeof tag === 'string' && tag.toLowerCase() === 'a') return;
      evt.preventDefault();
      setMenuAnchor({
        x: evt.clientX,
        y: evt.clientY,
        width: 0,
        height: 0,
      });
    };

    const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
      const target = evt.currentTarget.parentElement?.parentElement ?? evt.currentTarget;
      setMenuAnchor(target.getBoundingClientRect());
    };

    const closeMenu = () => {
      setMenuAnchor(undefined);
    };

    const toggleEmojiBoardAnchor = useCallback((target: HTMLElement) => {
      const rect =
        target.parentElement?.parentElement?.getBoundingClientRect() ??
        target.getBoundingClientRect();
      const now = Date.now();

      setEmojiBoardAnchor((current) => {
        if (current) {
          emojiBoardSuppressOpenUntilRef.current = now + MESSAGE_EMOJI_REOPEN_SUPPRESS_MS;
          return undefined;
        }

        if (now < emojiBoardSuppressOpenUntilRef.current) {
          return current;
        }

        emojiBoardSuppressOpenUntilRef.current = 0;
        return rect;
      });
    }, []);

    const handleOpenEmojiBoardPointerDown: PointerEventHandler<HTMLButtonElement> = (evt) => {
      emojiBoardTriggerAtRef.current = Date.now();
    };

    const handleOpenEmojiBoard: MouseEventHandler<HTMLButtonElement> = (evt) => {
      toggleEmojiBoardAnchor(evt.currentTarget);
    };
    const handleAddReactions: MouseEventHandler<HTMLButtonElement> = () => {
      const rect = menuAnchor;
      closeMenu();
      // open it with timeout because closeMenu
      // FocusTrap will return focus from emojiBoard

      setTimeout(() => {
        setEmojiBoardAnchor(rect);
      }, 100);
    };

    const isThreadedMessage = mEvent.threadRootId !== undefined;

    const handleMessageClick: MouseEventHandler<HTMLDivElement> = (evt) => {
      if (!forwardSelectionMode || !forwardSource) return;

      const target = evt.target as HTMLElement | null;
      if (
        target?.closest(
          'button,a,input,textarea,select,label,summary,[role="button"],audio,video'
        )
      ) {
        return;
      }

      evt.preventDefault();
      evt.stopPropagation();
      handleToggleForwardSelection();
    };

    return (
      <MessageBase
        className={classNames(css.MessageBase, className, {
          [css.MessageBaseBubbleCollapsed]: messageLayout === MessageLayout.Bubble && collapse,
        })}
        tabIndex={0}
        space={messageSpacing}
        collapse={collapse}
        highlight={highlight}
        selected={!!menuAnchor || !!emojiBoardAnchor || !!forwardSelected}
        {...props}
        {...hoverProps}
        {...focusWithinProps}
        ref={ref}
      >
        {!edit && (hover || !!menuAnchor || !!emojiBoardAnchor) && (
          <div className={css.MessageOptionsBase}>
            <Menu className={css.MessageOptionsBar} variant="SurfaceVariant">
              <Box gap="100">
                {canSendReaction && (
                  <PopOut
                    position="Bottom"
                    align={emojiBoardAnchor?.width === 0 ? 'Start' : 'End'}
                    offset={emojiBoardAnchor?.width === 0 ? 0 : undefined}
                    anchor={emojiBoardAnchor}
                    content={
                      <EmojiBoard
                        imagePackRooms={imagePackRooms ?? []}
                        imagePackMode="personal"
                        returnFocusOnDeactivate={false}
                        allowTextCustomEmoji
                        onEmojiSelect={(key) => {
                          onReactionToggle(mEvent.getId()!, key);
                          setEmojiBoardAnchor(undefined);
                        }}
                        onCustomEmojiSelect={(mxc, shortcode) => {
                          onReactionToggle(mEvent.getId()!, mxc, shortcode);
                          setEmojiBoardAnchor(undefined);
                        }}
                        requestClose={() => {
                          const now = Date.now();
                          if (
                            now - emojiBoardTriggerAtRef.current <
                            MESSAGE_EMOJI_REOPEN_SUPPRESS_MS
                          ) {
                            emojiBoardSuppressOpenUntilRef.current =
                              now + MESSAGE_EMOJI_REOPEN_SUPPRESS_MS;
                          }
                          setEmojiBoardAnchor(undefined);
                        }}
                      />
                    }
                  >
                    <IconButton
                      onPointerDown={(evt) => {
                        handleOpenEmojiBoardPointerDown(evt);
                        if (!emojiBoardAnchor) {
                          return;
                        }
                        evt.preventDefault();
                        evt.stopPropagation();
                        const now = Date.now();
                        emojiBoardSuppressOpenUntilRef.current =
                          now + MESSAGE_EMOJI_REOPEN_SUPPRESS_MS;
                        setEmojiBoardAnchor(undefined);
                      }}
                      onClick={(evt) => {
                        if (Date.now() < emojiBoardSuppressOpenUntilRef.current) {
                          return;
                        }
                        handleOpenEmojiBoard(evt);
                      }}
                      variant="SurfaceVariant"
                      size="300"
                      radii="300"
                      aria-pressed={!!emojiBoardAnchor}
                    >
                      <Icon src={Icons.SmilePlus} size="100" />
                    </IconButton>
                  </PopOut>
                )}
                {forwardSource && (
                  <IconButton
                    onClick={handleToggleForwardSelection}
                    variant={forwardSelected ? 'Primary' : 'SurfaceVariant'}
                    size="300"
                    radii="300"
                    aria-pressed={!!forwardSelected}
                  >
                    <Icon src={forwardSelected ? Icons.Check : Icons.ArrowGoRight} size="100" />
                  </IconButton>
                )}
                <IconButton
                  onClick={onReplyClick}
                  data-event-id={mEvent.getId()}
                  variant="SurfaceVariant"
                  size="300"
                  radii="300"
                >
                  <Icon src={Icons.ReplyArrow} size="100" />
                </IconButton>
                {!isThreadedMessage && (
                  <IconButton
                    onClick={(ev) => onReplyClick(ev, true)}
                    data-event-id={mEvent.getId()}
                    variant="SurfaceVariant"
                    size="300"
                    radii="300"
                  >
                    <Icon src={Icons.ThreadPlus} size="100" />
                  </IconButton>
                )}
                {canEditEvent(mx, mEvent) && onEditId && (
                  <IconButton
                    onClick={() => onEditId(mEvent.getId())}
                    variant="SurfaceVariant"
                    size="300"
                    radii="300"
                  >
                    <Icon src={Icons.Pencil} size="100" />
                  </IconButton>
                )}
                <PopOut
                  anchor={menuAnchor}
                  position="Bottom"
                  align={menuAnchor?.width === 0 ? 'Start' : 'End'}
                  offset={menuAnchor?.width === 0 ? 0 : undefined}
                  content={
                    <FocusTrap
                      focusTrapOptions={{
                        initialFocus: false,
                        onDeactivate: () => setMenuAnchor(undefined),
                        clickOutsideDeactivates: true,
                        isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                        isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                        escapeDeactivates: stopPropagation,
                      }}
                    >
                      <Menu>
                        {canSendReaction && (
                          <MessageQuickReactions
                            onReaction={(key, shortcode) => {
                              onReactionToggle(mEvent.getId()!, key, shortcode);
                              closeMenu();
                            }}
                          />
                        )}
                        <Box direction="Column" gap="100" className={css.MessageMenuGroup}>
                          {canSendReaction && (
                            <MenuItem
                              size="300"
                              after={<Icon size="100" src={Icons.SmilePlus} />}
                              radii="300"
                              onClick={handleAddReactions}
                            >
                              <Text
                                className={css.MessageMenuItemText}
                                as="span"
                                size="T300"
                                truncate
                              >
                                {'添加表情'}
                              </Text>
                            </MenuItem>
                          )}
                          {relations && (
                            <MessageAllReactionItem
                              room={room}
                              relations={relations}
                              onClose={closeMenu}
                            />
                          )}
                          <MenuItem
                            size="300"
                            after={<Icon size="100" src={Icons.ReplyArrow} />}
                            radii="300"
                            data-event-id={mEvent.getId()}
                            onClick={(evt: any) => {
                              onReplyClick(evt);
                              closeMenu();
                            }}
                          >
                            <Text
                              className={css.MessageMenuItemText}
                              as="span"
                              size="T300"
                              truncate
                            >
                              {'回复'}
                            </Text>
                          </MenuItem>
                          {!isThreadedMessage && (
                            <MenuItem
                              size="300"
                              after={<Icon src={Icons.ThreadPlus} size="100" />}
                              radii="300"
                              data-event-id={mEvent.getId()}
                              onClick={(evt: any) => {
                                onReplyClick(evt, true);
                                closeMenu();
                              }}
                            >
                              <Text
                                className={css.MessageMenuItemText}
                                as="span"
                                size="T300"
                                truncate
                              >
                                {'在线程中回复'}
                              </Text>
                            </MenuItem>
                          )}
                          {canEditEvent(mx, mEvent) && onEditId && (
                            <MenuItem
                              size="300"
                              after={<Icon size="100" src={Icons.Pencil} />}
                              radii="300"
                              data-event-id={mEvent.getId()}
                              onClick={() => {
                                onEditId(mEvent.getId());
                                closeMenu();
                              }}
                            >
                              <Text
                                className={css.MessageMenuItemText}
                                as="span"
                                size="T300"
                                truncate
                              >
                                {'编辑消息'}
                              </Text>
                            </MenuItem>
                          )}
                          {!hideReadReceipts && (
                            <MessageReadReceiptItem
                              room={room}
                              eventId={mEvent.getId() ?? ''}
                              onClose={closeMenu}
                            />
                          )}
                          {showDeveloperTools && (
                            <MessageSourceCodeItem
                              room={room}
                              mEvent={mEvent}
                              onClose={closeMenu}
                            />
                          )}
                          {forwardSource && (
                            <MessageForwardItem
                              selected={!!forwardSelected}
                              onToggle={handleToggleForwardSelection}
                              onClose={closeMenu}
                            />
                          )}
                          {forwardSource && room.roomId !== favoritesRoomId && (
                            <MessageFavoriteItem room={room} mEvent={mEvent} onClose={closeMenu} />
                          )}
                          <MessageSaveEmojiItem mEvent={mEvent} onClose={closeMenu} />
                          <MessageCopyTextItem mEvent={mEvent} onClose={closeMenu} />
                          <MessageCopyLinkItem room={room} mEvent={mEvent} onClose={closeMenu} />
                          {canPinEvent && (
                            <MessagePinItem room={room} mEvent={mEvent} onClose={closeMenu} />
                          )}
                        </Box>
                        {((!mEvent.isRedacted() && canDelete) ||
                          mEvent.getSender() !== mx.getUserId()) && (
                          <>
                            <Line size="300" />
                            <Box direction="Column" gap="100" className={css.MessageMenuGroup}>
                              {!mEvent.isRedacted() && canDelete && (
                                <MessageDeleteItem
                                  room={room}
                                  mEvent={mEvent}
                                  onClose={closeMenu}
                                />
                              )}
                              {mEvent.getSender() !== mx.getUserId() && (
                                <MessageReportItem
                                  room={room}
                                  mEvent={mEvent}
                                  onClose={closeMenu}
                                />
                              )}
                            </Box>
                          </>
                        )}
                      </Menu>
                    </FocusTrap>
                  }
                >
                  <IconButton
                    variant="SurfaceVariant"
                    size="300"
                    radii="300"
                    onClick={handleOpenMenu}
                    aria-pressed={!!menuAnchor}
                  >
                    <Icon src={Icons.VerticalDots} size="100" />
                  </IconButton>
                </PopOut>
              </Box>
            </Menu>
          </div>
        )}
        {messageLayout === MessageLayout.Compact && (
          <CompactLayout
            before={headerJSX}
            onContextMenu={handleContextMenu}
            onClick={handleMessageClick}
          >
            {msgContentJSX}
          </CompactLayout>
        )}
        {messageLayout === MessageLayout.Bubble && (
          <BubbleLayout
            before={avatarJSX}
            header={headerJSX}
            after={readReceiptsJSX}
            tone={isOwnMessage ? 'self' : 'other'}
            onContextMenu={handleContextMenu}
            onClick={handleMessageClick}
          >
            {bubbleContentJSX}
          </BubbleLayout>
        )}
        {messageLayout !== MessageLayout.Compact && messageLayout !== MessageLayout.Bubble && (
          <ModernLayout
            before={avatarJSX}
            onContextMenu={handleContextMenu}
            onClick={handleMessageClick}
          >
            {headerJSX}
            {msgContentJSX}
          </ModernLayout>
        )}
      </MessageBase>
    );
  }
);

export type EventProps = {
  room: Room;
  mEvent: MatrixEvent;
  highlight: boolean;
  canDelete?: boolean;
  messageSpacing: MessageSpacing;
  hideReadReceipts?: boolean;
  showDeveloperTools?: boolean;
};
export const Event = as<'div', EventProps>(
  (
    {
      className,
      room,
      mEvent,
      highlight,
      canDelete,
      messageSpacing,
      hideReadReceipts,
      showDeveloperTools,
      children,
      ...props
    },
    ref
  ) => {
    const mx = useMatrixClient();
    const [hover, setHover] = useState(false);
    const { hoverProps } = useHover({ onHoverChange: setHover });
    const { focusWithinProps } = useFocusWithin({ onFocusWithinChange: setHover });
    const [menuAnchor, setMenuAnchor] = useState<RectCords>();
    const stateEvent = typeof mEvent.getStateKey() === 'string';

    const handleContextMenu: MouseEventHandler<HTMLDivElement> = (evt) => {
      if (evt.altKey || !window.getSelection()?.isCollapsed) return;
      const tag = (evt.target as any).tagName;
      if (typeof tag === 'string' && tag.toLowerCase() === 'a') return;
      evt.preventDefault();
      setMenuAnchor({
        x: evt.clientX,
        y: evt.clientY,
        width: 0,
        height: 0,
      });
    };

    const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
      const target = evt.currentTarget.parentElement?.parentElement ?? evt.currentTarget;
      setMenuAnchor(target.getBoundingClientRect());
    };

    const closeMenu = () => {
      setMenuAnchor(undefined);
    };

    return (
      <MessageBase
        className={classNames(css.MessageBase, className)}
        tabIndex={0}
        space={messageSpacing}
        autoCollapse
        highlight={highlight}
        selected={!!menuAnchor}
        {...props}
        {...hoverProps}
        {...focusWithinProps}
        ref={ref}
      >
        {(hover || !!menuAnchor) && (
          <div className={css.MessageOptionsBase}>
            <Menu className={css.MessageOptionsBar} variant="SurfaceVariant">
              <Box gap="100">
                <PopOut
                  anchor={menuAnchor}
                  position="Bottom"
                  align={menuAnchor?.width === 0 ? 'Start' : 'End'}
                  offset={menuAnchor?.width === 0 ? 0 : undefined}
                  content={
                    <FocusTrap
                      focusTrapOptions={{
                        initialFocus: false,
                        onDeactivate: () => setMenuAnchor(undefined),
                        clickOutsideDeactivates: true,
                        isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                        isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                        escapeDeactivates: stopPropagation,
                      }}
                    >
                      <Menu {...props} ref={ref}>
                        <Box direction="Column" gap="100" className={css.MessageMenuGroup}>
                          {!hideReadReceipts && (
                            <MessageReadReceiptItem
                              room={room}
                              eventId={mEvent.getId() ?? ''}
                              onClose={closeMenu}
                            />
                          )}
                          {showDeveloperTools && (
                            <MessageSourceCodeItem
                              room={room}
                              mEvent={mEvent}
                              onClose={closeMenu}
                            />
                          )}
                          <MessageCopyTextItem mEvent={mEvent} onClose={closeMenu} />
                          <MessageCopyLinkItem room={room} mEvent={mEvent} onClose={closeMenu} />
                        </Box>
                        {((!mEvent.isRedacted() && canDelete && !stateEvent) ||
                          (mEvent.getSender() !== mx.getUserId() && !stateEvent)) && (
                          <>
                            <Line size="300" />
                            <Box direction="Column" gap="100" className={css.MessageMenuGroup}>
                              {!mEvent.isRedacted() && canDelete && (
                                <MessageDeleteItem
                                  room={room}
                                  mEvent={mEvent}
                                  onClose={closeMenu}
                                />
                              )}
                              {mEvent.getSender() !== mx.getUserId() && (
                                <MessageReportItem
                                  room={room}
                                  mEvent={mEvent}
                                  onClose={closeMenu}
                                />
                              )}
                            </Box>
                          </>
                        )}
                      </Menu>
                    </FocusTrap>
                  }
                >
                  <IconButton
                    variant="SurfaceVariant"
                    size="300"
                    radii="300"
                    onClick={handleOpenMenu}
                    aria-pressed={!!menuAnchor}
                  >
                    <Icon src={Icons.VerticalDots} size="100" />
                  </IconButton>
                </PopOut>
              </Box>
            </Menu>
          </div>
        )}
        <div onContextMenu={handleContextMenu}>{children}</div>
      </MessageBase>
    );
  }
);
