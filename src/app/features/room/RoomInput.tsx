import React, {
  FormEventHandler,
  KeyboardEventHandler,
  RefObject,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { isKeyHotkey } from 'is-hotkey';
import {
  EventStatus,
  EventType,
  IContent,
  MatrixEvent,
  MsgType,
  RelationType,
  Room,
} from 'matrix-js-sdk';
import { ReactEditor } from 'slate-react';
import { Descendant, Editor, Transforms } from 'slate';
import {
  Box,
  Button,
  Dialog,
  Icon,
  IconButton,
  Icons,
  Input,
  Line,
  Menu,
  MenuItem,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  Scroll,
  Text,
  color,
  config,
  toRem,
} from 'folds';
import FocusTrap from 'focus-trap-react';

import { useMatrixClient } from '../../hooks/useMatrixClient';
import {
  CustomEditor,
  Toolbar,
  toMatrixCustomHTML,
  toPlainText,
  AUTOCOMPLETE_PREFIXES,
  AutocompletePrefix,
  AutocompleteQuery,
  getAutocompleteQuery,
  getPrevWorldRange,
  resetEditor,
  RoomMentionAutocomplete,
  UserMentionAutocomplete,
  EmoticonAutocomplete,
  createEmoticonElement,
  moveCursor,
  resetEditorHistory,
  customHtmlEqualsPlainText,
  trimCustomHtml,
  isEmptyEditor,
  getBeginCommand,
  trimCommand,
  getMentions,
} from '../../components/editor';
import { EmojiBoard, EmojiBoardTab } from '../../components/emoji-board';
import {
  getAudioFileUrl,
  getImageFileUrl,
  loadAudioElement,
  loadImageElement,
  SelectFileOptions,
} from '../../utils/dom';
import {
  getAudioInfo,
  TUploadContent,
  encryptFile,
  getMxIdLocalPart,
  isHttpUrl,
  isMxcUrl,
} from '../../utils/matrix';
import { useTypingStatusUpdater } from '../../hooks/useTypingStatusUpdater';
import { useFilePicker } from '../../hooks/useFilePicker';
import { useFilePasteHandler } from '../../hooks/useFilePasteHandler';
import { useFileDropZone } from '../../hooks/useFileDrop';
import {
  type IReplyDraft,
  TUploadItem,
  TUploadMetadata,
  roomIdToMsgDraftAtomFamily,
  roomIdToReplyDraftAtomFamily,
  roomIdToUploadItemsAtomFamily,
  roomUploadAtomFamily,
} from '../../state/room/roomInputDrafts';
import { UploadCardRenderer } from '../../components/upload-card';
import {
  UploadBoard,
  UploadBoardContent,
  UploadBoardHeader,
  UploadBoardImperativeHandlers,
} from '../../components/upload-board';
import {
  Upload,
  UploadStatus,
  UploadSuccess,
  createUploadFamilyObserverAtom,
} from '../../state/upload';
import { safeFile } from '../../utils/mimeTypes';
import { fulfilledPromiseSettledResult, millisecondsToMinutesAndSeconds } from '../../utils/common';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import {
  getAudioMsgContent,
  getFileMsgContent,
  getImageMsgContent,
  getVideoMsgContent,
} from './msgContent';
import { dispatchRoomFollowLatest } from '../../utils/roomViewEvents';
import { getMemberDisplayName, getMentionContent, trimReplyFromBody } from '../../utils/room';
import { CommandAutocomplete } from './CommandAutocomplete';
import { Command, SHRUG, TABLEFLIP, UNFLIP, useCommands } from '../../hooks/useCommands';
import { mobileOrTablet } from '../../utils/user-agent';
import { ReplyLayout, ThreadIndicator } from '../../components/message';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { useImagePackRooms } from '../../hooks/useImagePackRooms';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import colorMXID from '../../../util/colorMXID';
import { useIsDirectRoom } from '../../hooks/useRoom';
import { useAccessiblePowerTagColors, useGetMemberPowerTag } from '../../hooks/useMemberPowerTag';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useTheme } from '../../hooks/useTheme';
import { useRoomCreatorsTag } from '../../hooks/useRoomCreatorsTag';
import { usePowerLevelTags } from '../../hooks/usePowerLevelTags';
import { useComposingCheck } from '../../hooks/useComposingCheck';
import { useInterval } from '../../hooks/useInterval';
import { CreatePollModal } from './CreatePollModal';
import {
  createPollMessageContent,
  CreatePollInput,
  OUTGOING_POLL_START_EVENT_TYPE,
} from '../../utils/polls';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { IImageInfo } from '../../../types/matrix/common';
import { isDesktopUpdaterSupported } from '../../utils/desktopUpdater';

interface RoomInputProps {
  editor: Editor;
  fileDropContainerRef: RefObject<HTMLElement>;
  roomId: string;
  room: Room;
}

type FastMatrixEventSender = {
  encryptEventIfNeeded?: (event: MatrixEvent, room?: Room) => Promise<void>;
  sendEventHttpRequest?: (event: MatrixEvent) => Promise<{ event_id?: string }>;
};

type SendRoomEventWithoutQueueOptions = {
  encrypt?: boolean;
};

type LocalMatrixEvent = MatrixEvent & {
  event: MatrixEvent['event'] & {
    content?: IContent;
  };
  clearEvent?: {
    content?: IContent;
  };
};

type PendingEventRoom = Room & {
  removePendingEvent?: (eventId: string) => void;
};

const createLocalRoomEvent = (
  mx: ReturnType<typeof useMatrixClient>,
  room: Room,
  eventType: string,
  content: IContent
): { localEvent: MatrixEvent; txnId: string } => {
  const txnId = mx.makeTxnId();
  const userId = mx.getUserId() ?? undefined;
  const localEvent = new MatrixEvent({
    type: eventType,
    content,
    event_id: `~${room.roomId}:${txnId}`,
    user_id: userId,
    sender: userId,
    room_id: room.roomId,
    origin_server_ts: Date.now(),
  });

  localEvent.setTxnId(txnId);
  localEvent.setStatus(EventStatus.SENDING);
  return { localEvent, txnId };
};

const setLocalEventContent = (event: MatrixEvent, content: IContent): void => {
  const localEvent = event as LocalMatrixEvent;
  localEvent.event.content = content;

  if (localEvent.clearEvent) {
    localEvent.clearEvent.content = content;
  }
};

const removeLocalPendingEvent = (room: Room, localEvent: MatrixEvent): void => {
  const eventId = localEvent.getId();
  if (eventId) {
    const pendingRoom = room as PendingEventRoom;
    if (typeof pendingRoom.removePendingEvent === 'function') {
      try {
        pendingRoom.removePendingEvent(eventId);
        return;
      } catch {
        // Fall back to a cancelled pending status on older or patched SDK builds.
      }
    }
  }

  room.updatePendingEvent(localEvent, EventStatus.CANCELLED);
};

const sendLocalRoomEvent = (
  mx: ReturnType<typeof useMatrixClient>,
  room: Room,
  localEvent: MatrixEvent,
  options: SendRoomEventWithoutQueueOptions = {}
): Promise<unknown> => {
  const fastMx = mx as unknown as FastMatrixEventSender;
  if (
    typeof fastMx.encryptEventIfNeeded !== 'function' ||
    typeof fastMx.sendEventHttpRequest !== 'function'
  ) {
    return mx.sendEvent(room.roomId, localEvent.getType(), localEvent.getContent() as never);
  }

  if (localEvent.status === EventStatus.NOT_SENT) {
    return Promise.reject(new Error('Event blocked by other events not yet sent'));
  }

  return (async () => {
    try {
      if (options.encrypt !== false) {
        await fastMx.encryptEventIfNeeded?.(localEvent, room);
        if (localEvent.status === EventStatus.ENCRYPTING) {
          room.updatePendingEvent(localEvent, EventStatus.SENDING);
        }
      }

      const response = await fastMx.sendEventHttpRequest?.(localEvent);
      const eventId = response?.event_id;
      if (!eventId) {
        throw new Error('Missing event id after sending message');
      }

      room.updatePendingEvent(localEvent, EventStatus.SENT, eventId);
      return response;
    } catch (error) {
      (localEvent as MatrixEvent & { error?: unknown }).error = error;
      room.updatePendingEvent(localEvent, EventStatus.NOT_SENT);
      throw error;
    }
  })();
};

const sendRoomEventWithoutQueue = (
  mx: ReturnType<typeof useMatrixClient>,
  room: Room,
  eventType: string,
  content: IContent,
  options: SendRoomEventWithoutQueueOptions = {}
): Promise<unknown> => {
  const fastMx = mx as unknown as FastMatrixEventSender;
  if (
    typeof fastMx.encryptEventIfNeeded !== 'function' ||
    typeof fastMx.sendEventHttpRequest !== 'function'
  ) {
    return mx.sendEvent(room.roomId, eventType, content as never);
  }

  const { localEvent, txnId } = createLocalRoomEvent(mx, room, eventType, content);
  room.addPendingEvent(localEvent, txnId);
  return sendLocalRoomEvent(mx, room, localEvent, options);
};

const sendRoomMessageWithoutQueue = (
  mx: ReturnType<typeof useMatrixClient>,
  room: Room,
  content: IContent,
  options: SendRoomEventWithoutQueueOptions = {}
): Promise<unknown> => sendRoomEventWithoutQueue(mx, room, EventType.RoomMessage, content, options);

const sendRoomEventWithPendingContent = (
  mx: ReturnType<typeof useMatrixClient>,
  room: Room,
  eventType: string,
  pendingContent: IContent,
  getFinalContent: () => Promise<IContent>,
  options: SendRoomEventWithoutQueueOptions = {}
): Promise<unknown> => {
  const fastMx = mx as unknown as FastMatrixEventSender;
  if (
    typeof fastMx.encryptEventIfNeeded !== 'function' ||
    typeof fastMx.sendEventHttpRequest !== 'function'
  ) {
    return getFinalContent().then((content) =>
      mx.sendEvent(room.roomId, eventType, content as never)
    );
  }

  const { localEvent, txnId } = createLocalRoomEvent(mx, room, eventType, pendingContent);
  room.addPendingEvent(localEvent, txnId);

  if (localEvent.status === EventStatus.NOT_SENT) {
    return Promise.reject(new Error('Event blocked by other events not yet sent'));
  }

  return (async () => {
    let finalContent: IContent;
    try {
      finalContent = await getFinalContent();
    } catch (error) {
      (localEvent as MatrixEvent & { error?: unknown }).error = error;
      removeLocalPendingEvent(room, localEvent);
      throw error;
    }

    try {
      setLocalEventContent(localEvent, finalContent);
      return await sendLocalRoomEvent(mx, room, localEvent, options);
    } catch (error) {
      (localEvent as MatrixEvent & { error?: unknown }).error = error;
      room.updatePendingEvent(localEvent, EventStatus.NOT_SENT);
      throw error;
    }
  })();
};

const cloneEditorDraft = (draft: Descendant[]): Descendant[] =>
  JSON.parse(JSON.stringify(draft)) as Descendant[];

const EMOJI_BOARD_REOPEN_SUPPRESS_MS = 400;
const REMOTE_STICKER_DOWNLOAD_TIMEOUT_MS = 15000;
const STICKER_EVENT_BODY = '';
const NOTE_TEXT_MIME_TYPE = 'text/plain;charset=utf-8';
const NOTE_DEFAULT_BASENAME = 'note';

const NOTE_CN = {
  title: '\u4fbf\u7b7e\u8bb0\u4e8b\u672c',
  hint: '\u8f93\u5165\u7684\u5185\u5bb9\u4f1a\u4f5c\u4e3a txt \u6587\u4ef6\u53d1\u9001\uff0c\u6362\u884c\u3001\u7a7a\u683c\u548c\u7f29\u8fdb\u4f1a\u4fdd\u7559\u3002',
  fileName: '\u6587\u4ef6\u540d',
  fileNamePlaceholder: '\u7559\u7a7a\u5219\u4f7f\u7528 note.txt',
  content: '\u5185\u5bb9',
  contentPlaceholder: '\u5728\u8fd9\u91cc\u7c98\u8d34\u6216\u8f93\u5165\u9700\u8981\u53d1\u9001\u7684\u957f\u6587\u672c',
  cancel: '\u53d6\u6d88',
  send: '\u53d1\u9001',
  sending: '\u53d1\u9001\u4e2d...',
  needContent: '\u8bf7\u5148\u8f93\u5165\u8981\u53d1\u9001\u7684\u6587\u672c\u5185\u5bb9\u3002',
  sendFailed: '\u53d1\u9001 txt \u6587\u4ef6\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002',
} as const;

const sanitizeNoteFileBaseName = (name: string): string => {
  const baseName = name
    .trim()
    .replace(/\.txt$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .replace(/[.\s]+$/g, '')
    .slice(0, 80);

  return baseName || NOTE_DEFAULT_BASENAME;
};

const getNoteFileName = (name: string): string => `${sanitizeNoteFileBaseName(name)}.txt`;

type RemoteStickerMediaResponse = {
  dataBase64: string;
  mimeType?: string;
};

type RemoteStickerMedia = {
  blob: Blob;
  mimeType: string;
};

const REMOTE_STICKER_MIME_EXTENSION: Record<string, string> = {
  'image/apng': 'apng',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

const remoteStickerUploadCache = new Map<string, Promise<IContent>>();

const base64ToBlob = (dataBase64: string, mimeType: string): Blob => {
  const binary = window.atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
};

const getRemoteStickerMimeType = (mimeType?: string, info?: IImageInfo): string =>
  mimeType || info?.mimetype || 'image/gif';

const sanitizeRemoteStickerFileName = (label: string): string => {
  const safeName = label
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+$/, '')
    .slice(0, 80);

  return safeName || 'sticker';
};

const getRemoteStickerFileName = (label: string, mimeType: string): string => {
  const baseName = sanitizeRemoteStickerFileName(label).replace(/\.[a-z0-9]{2,5}$/i, '');
  const extension = REMOTE_STICKER_MIME_EXTENSION[mimeType.toLowerCase()] ?? 'gif';
  return `${baseName}.${extension}`;
};

const createRemoteStickerHttpContent = (url: string, info?: IImageInfo): IContent => ({
  body: STICKER_EVENT_BODY,
  url,
  info: {
    ...info,
    mimetype: getRemoteStickerMimeType(undefined, info),
  },
});

const cloneMessageContent = (content: IContent): IContent =>
  JSON.parse(JSON.stringify(content)) as IContent;

const getRemoteStickerImageInfo = async (
  blob: Blob,
  mimeType: string,
  fallbackInfo?: IImageInfo
): Promise<IImageInfo> => {
  const info: IImageInfo = {
    ...fallbackInfo,
    mimetype: mimeType,
    size: blob.size,
  };

  if (info.w && info.h) {
    return info;
  }

  const imageUrl = getImageFileUrl(blob);
  try {
    const img = await loadImageElement(imageUrl);
    info.w = img.naturalWidth || img.width || info.w;
    info.h = img.naturalHeight || img.height || info.h;
  } catch (error) {
    console.warn(error);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }

  return info;
};

const fetchRemoteStickerMediaWithBrowser = async (
  url: string,
  info?: IImageInfo
): Promise<RemoteStickerMedia> => {
  const abortController = new AbortController();
  const timeoutId = window.setTimeout(
    () => abortController.abort(),
    REMOTE_STICKER_DOWNLOAD_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to download remote sticker: ${response.status}`);
    }

    const blob = await response.blob();
    const mimeType = getRemoteStickerMimeType(blob.type, info);
    return {
      blob: blob.type ? blob : new Blob([blob], { type: mimeType }),
      mimeType,
    };
  } catch (error) {
    if (!isDesktopUpdaterSupported()) {
      throw new Error(
        '云端图片缺少跨域访问权限，Web 端无法上传为 Matrix 媒体。请先在 CF/R2 为图片域名开启 CORS。'
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const fetchRemoteStickerMediaWithDesktop = async (
  url: string,
  info?: IImageInfo
): Promise<RemoteStickerMedia> => {
  const { invoke } = await import('@tauri-apps/api/core');
  const result = await invoke<RemoteStickerMediaResponse>('fetch_remote_sticker_media', { url });
  const mimeType = getRemoteStickerMimeType(result.mimeType, info);

  return {
    blob: base64ToBlob(result.dataBase64, mimeType),
    mimeType,
  };
};

const fetchRemoteStickerMedia = async (
  url: string,
  info?: IImageInfo
): Promise<RemoteStickerMedia> => {
  if (isDesktopUpdaterSupported()) {
    try {
      return await fetchRemoteStickerMediaWithDesktop(url, info);
    } catch (error) {
      console.warn(error);
    }
  }

  return fetchRemoteStickerMediaWithBrowser(url, info);
};

const getRemoteStickerUploadCacheKey = (room: Room, url: string): string =>
  room.hasEncryptionStateEvent() ? `encrypted:${room.roomId}:${url}` : `plain:${url}`;

const uploadRemoteStickerContent = async (
  mx: ReturnType<typeof useMatrixClient>,
  room: Room,
  url: string,
  label: string,
  info?: IImageInfo
): Promise<IContent> => {
  const { blob, mimeType } = await fetchRemoteStickerMedia(url, info);
  const fileName = getRemoteStickerFileName(label, mimeType);
  const sourceFile = new File([blob], fileName, { type: mimeType });
  const uploadItem: TUploadItem = room.hasEncryptionStateEvent()
    ? {
        ...(await encryptFile(sourceFile)),
        metadata: { markedAsSpoiler: false },
      }
    : {
        file: sourceFile,
        originalFile: sourceFile,
        metadata: { markedAsSpoiler: false },
        encInfo: undefined,
      };

  const upload = await mx.uploadContent(uploadItem.file, {
    includeFilename: true,
    name: fileName,
    type: uploadItem.file.type || mimeType,
  });
  const mxc = upload.content_uri;
  if (!mxc) {
    throw new Error('Failed to upload remote sticker.');
  }

  const mediaInfo = await getRemoteStickerImageInfo(blob, mimeType, info);
  const content: IContent = {
    body: STICKER_EVENT_BODY,
    info: mediaInfo,
  };

  if (uploadItem.encInfo) {
    content.file = {
      ...uploadItem.encInfo,
      url: mxc,
    };
  } else {
    content.url = mxc;
  }

  return content;
};

const createRemoteStickerContent = async (
  mx: ReturnType<typeof useMatrixClient>,
  room: Room,
  url: string,
  label: string,
  info?: IImageInfo
): Promise<IContent> => {
  const cacheKey = getRemoteStickerUploadCacheKey(room, url);
  let uploadPromise = remoteStickerUploadCache.get(cacheKey);

  if (!uploadPromise) {
    uploadPromise = uploadRemoteStickerContent(mx, room, url, label, info).catch((error) => {
      remoteStickerUploadCache.delete(cacheKey);
      throw error;
    });
    remoteStickerUploadCache.set(cacheKey, uploadPromise);
  }

  let uploadedContent: IContent;
  try {
    uploadedContent = await uploadPromise;
  } catch (error) {
    if (!isDesktopUpdaterSupported()) {
      return createRemoteStickerHttpContent(url, info);
    }
    throw error;
  }
  const content = cloneMessageContent(uploadedContent);
  content.body = STICKER_EVENT_BODY;
  return content;
};

const restoreEditorDraft = (editor: Editor, draft: Descendant[]) => {
  if (draft.length === 0) return;

  resetEditor(editor);
  Transforms.insertFragment(editor, draft);
  moveCursor(editor);
  resetEditorHistory(editor);
};

const getReplyRelation = (replyDraft: IReplyDraft): IContent['m.relates_to'] => {
  const relation: IContent['m.relates_to'] = {
    'm.in_reply_to': {
      event_id: replyDraft.eventId,
    },
  };

  if (replyDraft.relation?.rel_type === RelationType.Thread) {
    relation.event_id = replyDraft.relation.event_id;
    relation.rel_type = RelationType.Thread;
    relation.is_falling_back = false;
  }

  return relation;
};

const withReplyMetadata = (
  content: IContent,
  replyDraft: IReplyDraft | undefined,
  currentUserId: string | null
): IContent => {
  if (!replyDraft) return content;

  const replyContent: IContent = {
    ...content,
    'm.relates_to': getReplyRelation(replyDraft),
  };

  if (replyDraft.userId !== currentUserId) {
    const mentions = replyContent['m.mentions'] ?? {};
    const userIds = new Set(mentions.user_ids ?? []);
    userIds.add(replyDraft.userId);
    replyContent['m.mentions'] = {
      ...mentions,
      user_ids: Array.from(userIds),
    };
  }

  return replyContent;
};

const getSendErrorMessage = (error: unknown): string => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return '当前网络已断开，这条消息还没有真正发送出去。';
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

  return '发送失败，这条消息目前可能只有你自己可见，请重试。';
};

const getStickerSendErrorMessage = (error: unknown, remoteSticker: boolean): string => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return '当前网络已断开，贴纸还没有发送出去。';
  }

  const matrixError = error as {
    data?: { error?: string };
    message?: string;
  };

  const detail =
    typeof matrixError?.data?.error === 'string' && matrixError.data.error.trim()
      ? matrixError.data.error.trim()
      : typeof matrixError?.message === 'string' && matrixError.message.trim()
      ? matrixError.message.trim()
      : undefined;

  if (detail && /abort|aborted|operation was aborted/i.test(detail)) {
    return remoteSticker
      ? '远程贴纸发送被中止，请检查 CF 图片链接，或在表情索引里补充 mxc 地址。'
      : '贴纸发送被中止，请重试。';
  }

  if (detail) {
    return `贴纸发送失败：${detail}`;
  }

  if (remoteSticker) {
    return '远程贴纸发送失败，请检查 CF 图片链接，或在表情索引里补充 mxc 地址。';
  }

  return '贴纸发送失败，请重试。';
};

export const RoomInput = forwardRef<HTMLDivElement, RoomInputProps>(
  ({ editor, fileDropContainerRef, roomId, room }, ref) => {
    const mx = useMatrixClient();
    const screenSize = useScreenSizeContext();
    const compactScreen = screenSize !== ScreenSize.Desktop;
    const [enterForNewline] = useSetting(settingsAtom, 'enterForNewline');
    const [isMarkdown] = useSetting(settingsAtom, 'isMarkdown');
    const [sendTypingNotifications] = useSetting(settingsAtom, 'sendTypingNotifications');
    const [legacyUsernameColor] = useSetting(settingsAtom, 'legacyUsernameColor');
    const direct = useIsDirectRoom();
    const commands = useCommands(mx, room);
    const emojiBtnRef = useRef<HTMLButtonElement>(null);
    const roomToParents = useAtomValue(roomToParentsAtom);
    const powerLevels = usePowerLevelsContext();
    const creators = useRoomCreators(room);

    const [msgDraft, setMsgDraft] = useAtom(roomIdToMsgDraftAtomFamily(roomId));
    const [replyDraft, setReplyDraft] = useAtom(roomIdToReplyDraftAtomFamily(roomId));
    const replyUserID = replyDraft?.userId;
    const replyDraftRef = useRef(replyDraft);
    replyDraftRef.current = replyDraft;

    const powerLevelTags = usePowerLevelTags(room, powerLevels);
    const creatorsTag = useRoomCreatorsTag();
    const getMemberPowerTag = useGetMemberPowerTag(room, creators, powerLevels);
    const theme = useTheme();
    const accessibleTagColors = useAccessiblePowerTagColors(
      theme.kind,
      creatorsTag,
      powerLevelTags
    );

    const replyPowerTag = replyUserID ? getMemberPowerTag(replyUserID) : undefined;
    const replyPowerColor = replyPowerTag?.color
      ? accessibleTagColors.get(replyPowerTag.color)
      : undefined;
    const replyUsernameColor =
      legacyUsernameColor || direct ? colorMXID(replyUserID ?? '') : replyPowerColor;

    const [uploadBoard, setUploadBoard] = useState(true);
    const [pollDialog, setPollDialog] = useState(false);
    const [noteDialogOpen, setNoteDialogOpen] = useState(false);
    const [noteFileName, setNoteFileName] = useState('');
    const [noteText, setNoteText] = useState('');
    const [noteStatus, setNoteStatus] = useState<string>();
    const [noteSubmitting, setNoteSubmitting] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder>();
    const mediaStreamRef = useRef<MediaStream>();
    const recordingChunksRef = useRef<Blob[]>([]);
    const [selectedFiles, setSelectedFiles] = useAtom(roomIdToUploadItemsAtomFamily(roomId));
    const [recording, setRecording] = useState(false);
    const [recordingMs, setRecordingMs] = useState(0);
    const [recordingError, setRecordingError] = useState<string>();
    const [sendError, setSendError] = useState<string>();
    const [sendStatus, setSendStatus] = useState<string>();
    const sendingMessageRef = useRef(false);
    const stickerSendingRef = useRef(false);
    const uploadFamilyObserverAtom = createUploadFamilyObserverAtom(
      roomUploadAtomFamily,
      selectedFiles.map((f) => f.file)
    );
    const uploadBoardHandlers = useRef<UploadBoardImperativeHandlers>();

    const imagePackRooms: Room[] = useImagePackRooms(roomId, roomToParents);

    const [toolbar, setToolbar] = useSetting(settingsAtom, 'editorToolbar');
    const [autocompleteQuery, setAutocompleteQuery] =
      useState<AutocompleteQuery<AutocompletePrefix>>();
    const [emojiBoardTab, setEmojiBoardTab] = useState(EmojiBoardTab.Emoji);
    const [emojiBoardOpen, setEmojiBoardOpen] = useState(false);
    const [mobileAttachmentMenuOpen, setMobileAttachmentMenuOpen] = useState(false);
    const autocompleteFrameRef = useRef<number>();
    const suppressEditorRealtimeUpdatesRef = useRef(false);
    const attachmentBtnRef = useRef<HTMLButtonElement>(null);
    const emojiBoardOpenRef = useRef(emojiBoardOpen);
    const emojiBoardTouchTriggerRef = useRef(0);
    const emojiBoardSuppressOpenUntilRef = useRef(0);
    const emojiBoardSkipClickUntilRef = useRef(0);
    const emojiBoardFocusTimerRef = useRef<number>();
    emojiBoardOpenRef.current = emojiBoardOpen;

    const sendTypingStatus = useTypingStatusUpdater(mx, roomId);
    const mobileAttachmentMenuEnabled = compactScreen && mobileOrTablet();

    useEffect(() => {
      if (!sendTypingNotifications) {
        sendTypingStatus(false);
      }
    }, [sendTypingStatus, sendTypingNotifications]);

    useEffect(() => {
      if (!mobileAttachmentMenuEnabled) {
        setMobileAttachmentMenuOpen(false);
      }
    }, [mobileAttachmentMenuEnabled]);

    useInterval(
      useCallback(() => {
        setRecordingMs((current) => current + 1000);
      }, []),
      recording ? 1000 : -1
    );

    const stopRecordingTracks = useCallback(() => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = undefined;
    }, []);

    const getAudioMetadata = useCallback(async (file: File): Promise<Partial<TUploadMetadata>> => {
      if (!file.type.startsWith('audio')) {
        return {};
      }

      const audioUrl = getAudioFileUrl(file);
      try {
        const audio = await loadAudioElement(audioUrl);
        const info = getAudioInfo(audio, file);
        return {
          audioDuration: info.duration,
          voice: file.name.startsWith('voice-note-'),
        };
      } finally {
        URL.revokeObjectURL(audioUrl);
      }
    }, []);

    const handleFiles = useCallback(
      async (files: File[]) => {
        setUploadBoard(true);
        const safeFiles = files.map(safeFile);
        const metadataList = await Promise.all(safeFiles.map(getAudioMetadata));
        const fileItems: TUploadItem[] = [];

        if (room.hasEncryptionStateEvent()) {
          const encryptFiles = fulfilledPromiseSettledResult(
            await Promise.allSettled(safeFiles.map((f) => encryptFile(f)))
          );
          encryptFiles.forEach((ef, index) =>
            fileItems.push({
              ...ef,
              metadata: {
                markedAsSpoiler: false,
                ...metadataList[index],
              },
            })
          );
        } else {
          safeFiles.forEach((f, index) =>
            fileItems.push({
              file: f,
              originalFile: f,
              encInfo: undefined,
              metadata: {
                markedAsSpoiler: false,
                ...metadataList[index],
              },
            })
          );
        }
        setSelectedFiles({
          type: 'PUT',
          item: fileItems,
        });
      },
      [getAudioMetadata, setSelectedFiles, room]
    );
    const pickFile = useFilePicker(handleFiles, true);
    const pickSingleFile = useFilePicker((file) => handleFiles([file]), false);
    const handlePaste = useFilePasteHandler(handleFiles);
    const dropZoneVisible = useFileDropZone(fileDropContainerRef, handleFiles);

    const isComposing = useComposingCheck();

    useEffect(() => {
      suppressEditorRealtimeUpdatesRef.current = true;
      Transforms.insertFragment(editor, msgDraft);
      suppressEditorRealtimeUpdatesRef.current = false;
    }, [editor, msgDraft]);

    const scheduleAutocompleteQueryUpdate = useCallback(() => {
      if (autocompleteFrameRef.current) {
        window.cancelAnimationFrame(autocompleteFrameRef.current);
      }

      autocompleteFrameRef.current = window.requestAnimationFrame(() => {
        autocompleteFrameRef.current = undefined;

        const prevWordRange = getPrevWorldRange(editor);
        const query = prevWordRange
          ? getAutocompleteQuery<AutocompletePrefix>(editor, prevWordRange, AUTOCOMPLETE_PREFIXES)
          : undefined;

        setAutocompleteQuery(query);
      });
    }, [editor]);

    const handleEditorChange = useCallback(() => {
      if (suppressEditorRealtimeUpdatesRef.current) return;

      const hasContentChange = editor.operations.some(
        (operation) => operation.type !== 'set_selection'
      );

      if (hasContentChange) {
        if (sendTypingNotifications) {
          sendTypingStatus(!isEmptyEditor(editor));
        }

        scheduleAutocompleteQueryUpdate();
        return;
      }

      if (autocompleteQuery) {
        scheduleAutocompleteQueryUpdate();
      }
    }, [
      autocompleteQuery,
      editor,
      scheduleAutocompleteQueryUpdate,
      sendTypingNotifications,
      sendTypingStatus,
    ]);

    useEffect(
      () => () => {
        if (autocompleteFrameRef.current) {
          window.cancelAnimationFrame(autocompleteFrameRef.current);
        }
        if (emojiBoardFocusTimerRef.current) {
          window.clearTimeout(emojiBoardFocusTimerRef.current);
        }
        stopRecordingTracks();
        if (!isEmptyEditor(editor)) {
          const parsedDraft = JSON.parse(JSON.stringify(editor.children));
          setMsgDraft(parsedDraft);
        } else {
          setMsgDraft([]);
        }
        resetEditor(editor);
        resetEditorHistory(editor);
      },
      [roomId, editor, setMsgDraft, stopRecordingTracks]
    );

    const finalizeVoiceRecording = useCallback(async () => {
      const recorder = mediaRecorderRef.current;
      const mimeType = recorder?.mimeType || 'audio/webm';
      const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';
      const blob = new Blob(recordingChunksRef.current, { type: mimeType });
      recordingChunksRef.current = [];
      stopRecordingTracks();

      if (blob.size === 0) return;

      const voiceFile = new File([blob], `voice-note-${Date.now()}.${extension}`, {
        type: mimeType,
      });
      await handleFiles([voiceFile]);
    }, [handleFiles, stopRecordingTracks]);

    const startVoiceRecording = useCallback(async () => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setRecordingError(
          '\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u8bed\u97f3\u5f55\u5236\u3002'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType =
          ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/ogg'].find(
            (type) =>
              typeof MediaRecorder.isTypeSupported === 'function' &&
              MediaRecorder.isTypeSupported(type)
          ) ?? 'audio/webm';

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recordingChunksRef.current = [];
        mediaStreamRef.current = stream;
        mediaRecorderRef.current = recorder;
        setRecordingError(undefined);
        setRecordingMs(0);

        recorder.ondataavailable = (evt) => {
          if (evt.data.size > 0) {
            recordingChunksRef.current.push(evt.data);
          }
        };
        recorder.onstop = () => {
          setRecording(false);
          finalizeVoiceRecording().catch((error) => {
            setRecordingError(
              error instanceof Error ? error.message : '\u4fdd\u5b58\u5f55\u97f3\u5931\u8d25\u3002'
            );
          });
        };

        recorder.start();
        setRecording(true);
      } catch (error) {
        setRecordingError(
          error instanceof Error
            ? error.message
            : '\u65e0\u6cd5\u8bbf\u95ee\u9ea6\u514b\u98ce\u3002'
        );
        stopRecordingTracks();
      }
    }, [finalizeVoiceRecording, stopRecordingTracks]);

    const stopVoiceRecording = useCallback(() => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') return;
      recorder.stop();
    }, []);

    const cancelVoiceRecording = useCallback(() => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        recordingChunksRef.current = [];
        setRecording(false);
        stopRecordingTracks();
        return;
      }

      recorder.onstop = () => {
        recordingChunksRef.current = [];
        setRecording(false);
        stopRecordingTracks();
      };
      recorder.stop();
    }, [stopRecordingTracks]);

    const handleFileMetadata = useCallback(
      (fileItem: TUploadItem, metadata: TUploadMetadata) => {
        setSelectedFiles({
          type: 'REPLACE',
          item: fileItem,
          replacement: { ...fileItem, metadata },
        });
      },
      [setSelectedFiles]
    );

    const handleRemoveUpload = useCallback(
      (upload: TUploadContent | TUploadContent[]) => {
        const uploads = Array.isArray(upload) ? upload : [upload];
        setSelectedFiles({
          type: 'DELETE',
          item: selectedFiles.filter((f) => uploads.find((u) => u === f.file)),
        });
        uploads.forEach((u) => roomUploadAtomFamily.remove(u));
      },
      [setSelectedFiles, selectedFiles]
    );

    const handleCancelUpload = (uploads: Upload[]) => {
      uploads.forEach((upload) => {
        if (upload.status === UploadStatus.Loading) {
          mx.cancelUpload(upload.promise);
        }
      });
      handleRemoveUpload(uploads.map((upload) => upload.file));
    };

    const handleSendUpload = async (uploads: UploadSuccess[]): Promise<boolean> => {
      if (uploads.length === 0) return true;

      setSendError(undefined);
      const sentUploads: UploadSuccess[] = [];
      const sendUploadAtIndex = async (index: number): Promise<boolean> => {
        const upload = uploads[index];
        if (!upload) return true;

        const fileItem = selectedFiles.find((f) => f.file === upload.file);
        if (!fileItem) {
          if (sentUploads.length > 0) {
            handleRemoveUpload(sentUploads.map((item) => item.file));
          }
          setSendError('附件状态异常，未发出的附件已保留，请重新发送。');
          return false;
        }

        try {
          let content: IContent;
          if (fileItem.file.type.startsWith('image')) {
            content = await getImageMsgContent(mx, fileItem, upload.mxc);
          } else if (fileItem.file.type.startsWith('video')) {
            content = await getVideoMsgContent(mx, fileItem, upload.mxc);
          } else if (fileItem.file.type.startsWith('audio')) {
            content = await getAudioMsgContent(fileItem, upload.mxc);
          } else {
            content = await getFileMsgContent(fileItem, upload.mxc);
          }

          await mx.sendMessage(
            roomId,
            withReplyMetadata(content, replyDraft, mx.getUserId()) as never
          );
          dispatchRoomFollowLatest(roomId);
          sentUploads.push(upload);
        } catch (error) {
          if (sentUploads.length > 0) {
            handleRemoveUpload(sentUploads.map((item) => item.file));
          }
          setSendError(
            sentUploads.length > 0
              ? '部分附件发送失败，未发出的附件已保留，请重试。'
              : getSendErrorMessage(error)
          );
          return false;
        }
        return sendUploadAtIndex(index + 1);
      };

      const sentAll = await sendUploadAtIndex(0);
      if (!sentAll) return false;

      handleRemoveUpload(sentUploads.map((item) => item.file));
      return true;
    };

    const submit = useCallback(async () => {
      if (sendingMessageRef.current) return;

      const hasUploadDraft = selectedFiles.length > 0;
      const uploadSendSuccess = await uploadBoardHandlers.current?.handleSend();
      if (uploadSendSuccess === false) return;
      const uploadSent = hasUploadDraft && uploadSendSuccess === true;

      const commandName = getBeginCommand(editor);
      let plainText = toPlainText(editor.children, isMarkdown).trim();
      let customHtml = trimCustomHtml(
        toMatrixCustomHTML(editor.children, {
          allowTextFormatting: true,
          allowBlockMarkdown: isMarkdown,
          allowInlineMarkdown: isMarkdown,
        })
      );
      let msgType = MsgType.Text;

      if (commandName) {
        plainText = trimCommand(commandName, plainText);
        customHtml = trimCommand(commandName, customHtml);
      }
      if (commandName === Command.Me) {
        msgType = MsgType.Emote;
      } else if (commandName === Command.Notice) {
        msgType = MsgType.Notice;
      } else if (commandName === Command.Shrug) {
        plainText = `${SHRUG} ${plainText}`;
        customHtml = `${SHRUG} ${customHtml}`;
      } else if (commandName === Command.TableFlip) {
        plainText = `${TABLEFLIP} ${plainText}`;
        customHtml = `${TABLEFLIP} ${customHtml}`;
      } else if (commandName === Command.UnFlip) {
        plainText = `${UNFLIP} ${plainText}`;
        customHtml = `${UNFLIP} ${customHtml}`;
      } else if (commandName) {
        const commandContent = commands[commandName];
        if (commandContent) {
          commandContent.exe(plainText);
        }
        resetEditor(editor);
        resetEditorHistory(editor);
        sendTypingStatus(false);
        return;
      }

      if (plainText === '') {
        if (uploadSent) {
          setReplyDraft(undefined);
          replyDraftRef.current = undefined;
          sendTypingStatus(false);
        }
        return;
      }

      const draftSnapshot = cloneEditorDraft(editor.children);
      const replyDraftSnapshot = replyDraft;
      const body = plainText;
      const formattedBody = customHtml;
      const mentionData = getMentions(mx, roomId, editor);

      const content: IContent = {
        msgtype: msgType,
        body,
      };

      const mMentions = getMentionContent(Array.from(mentionData.users), mentionData.room);
      content['m.mentions'] = mMentions;
      const replyContent = withReplyMetadata(content, replyDraft, mx.getUserId());

      if (replyDraft || !customHtmlEqualsPlainText(formattedBody, body)) {
        replyContent.format = 'org.matrix.custom.html';
        replyContent.formatted_body = formattedBody;
      }
      setSendError(undefined);
      resetEditor(editor);
      resetEditorHistory(editor);
      setReplyDraft(undefined);
      replyDraftRef.current = undefined;
      sendTypingStatus(false);
      sendingMessageRef.current = true;

      try {
        await mx.sendMessage(roomId, replyContent as never);
        dispatchRoomFollowLatest(roomId);
      } catch (error) {
        if (isEmptyEditor(editor)) {
          restoreEditorDraft(editor, draftSnapshot);
        }
        if (!replyDraftRef.current && replyDraftSnapshot) {
          setReplyDraft(replyDraftSnapshot);
        }
        if (sendTypingNotifications && !isEmptyEditor(editor)) {
          sendTypingStatus(true);
        }
        setSendError(getSendErrorMessage(error));
      } finally {
        sendingMessageRef.current = false;
      }
    }, [
      commands,
      editor,
      isMarkdown,
      mx,
      replyDraft,
      roomId,
      sendTypingNotifications,
      sendTypingStatus,
      selectedFiles.length,
      setReplyDraft,
    ]);

    const handleKeyDown: KeyboardEventHandler = useCallback(
      (evt) => {
        if (
          (isKeyHotkey('mod+enter', evt) || (!enterForNewline && isKeyHotkey('enter', evt))) &&
          !isComposing(evt)
        ) {
          evt.preventDefault();
          submit().catch(() => undefined);
        }
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          if (autocompleteQuery) {
            setAutocompleteQuery(undefined);
            return;
          }
          setReplyDraft(undefined);
        }
      },
      [submit, setReplyDraft, enterForNewline, autocompleteQuery, isComposing]
    );

    const handleCloseAutocomplete = useCallback(() => {
      setAutocompleteQuery(undefined);
      ReactEditor.focus(editor);
    }, [editor]);

    const handleEmoticonSelect = (key: string, shortcode: string) => {
      editor.insertNode(createEmoticonElement(key, shortcode));
      moveCursor(editor, true);
    };

    const closeEmojiBoard = useCallback(
      (fromPointerTrigger = false) => {
        const now = Date.now();
        if (
          fromPointerTrigger ||
          now - emojiBoardTouchTriggerRef.current < EMOJI_BOARD_REOPEN_SUPPRESS_MS
        ) {
          const suppressUntil = now + EMOJI_BOARD_REOPEN_SUPPRESS_MS;
          emojiBoardSuppressOpenUntilRef.current = suppressUntil;
          emojiBoardSkipClickUntilRef.current = suppressUntil;
        }
        setEmojiBoardOpen(false);
        if (!mobileOrTablet()) {
          if (emojiBoardFocusTimerRef.current) {
            window.clearTimeout(emojiBoardFocusTimerRef.current);
          }
          emojiBoardFocusTimerRef.current = window.setTimeout(() => {
            ReactEditor.focus(editor);
          }, 0);
        }
      },
      [editor]
    );

    const toggleEmojiBoard = useCallback(() => {
      const now = Date.now();
      const currentOpen = emojiBoardOpenRef.current;

      if (!currentOpen && now < emojiBoardSuppressOpenUntilRef.current) {
        return;
      }

      if (currentOpen) {
        emojiBoardSuppressOpenUntilRef.current = now + EMOJI_BOARD_REOPEN_SUPPRESS_MS;
        closeEmojiBoard();
        return;
      }

      emojiBoardSuppressOpenUntilRef.current = 0;
      setEmojiBoardTab(EmojiBoardTab.Emoji);
      setEmojiBoardOpen(true);
    }, [closeEmojiBoard]);

    const closeNoteDialog = useCallback(() => {
      if (noteSubmitting) return;
      setNoteDialogOpen(false);
      setNoteStatus(undefined);
      setTimeout(() => ReactEditor.focus(editor), 100);
    }, [editor, noteSubmitting]);

    const handleOpenNoteDialog = useCallback(() => {
      if (emojiBoardFocusTimerRef.current) {
        window.clearTimeout(emojiBoardFocusTimerRef.current);
      }
      setEmojiBoardOpen(false);
      setNoteFileName('');
      setNoteText('');
      setNoteStatus(undefined);
      setNoteSubmitting(false);
      setNoteDialogOpen(true);
    }, []);

    const handleNoteSubmit: FormEventHandler<HTMLFormElement> = useCallback(
      async (evt) => {
        evt.preventDefault();

        const nativeSubmitEvent = evt.nativeEvent as SubmitEvent;
        const submitter = nativeSubmitEvent.submitter as HTMLElement | null;
        if (submitter?.getAttribute('data-note-submit') !== 'true') {
          return;
        }

        if (noteText.length === 0) {
          setNoteStatus(NOTE_CN.needContent);
          return;
        }

        const file = safeFile(new File([noteText], getNoteFileName(noteFileName), {
          type: NOTE_TEXT_MIME_TYPE,
        }));

        try {
          setNoteSubmitting(true);
          const fileItem: TUploadItem = room.hasEncryptionStateEvent()
            ? {
                ...(await encryptFile(file)),
                metadata: { markedAsSpoiler: false },
              }
            : {
                file,
                originalFile: file,
                encInfo: undefined,
                metadata: { markedAsSpoiler: false },
              };

          const upload = await mx.uploadContent(fileItem.file, {
            includeFilename: !fileItem.encInfo,
            name: file.name,
            type: file.type || 'text/plain',
          });
          const mxc = upload.content_uri;
          if (!mxc) {
            throw new Error('Missing MXC URI after note upload.');
          }

          const content = withReplyMetadata(
            getFileMsgContent(fileItem, mxc),
            replyDraft,
            mx.getUserId()
          );

          await mx.sendMessage(roomId, content as never);
          dispatchRoomFollowLatest(roomId);
          if (replyDraft) {
            setReplyDraft(undefined);
            replyDraftRef.current = undefined;
            sendTypingStatus(false);
          }

          setNoteDialogOpen(false);
          setNoteFileName('');
          setNoteText('');
          setNoteStatus(undefined);
          setNoteSubmitting(false);
          setTimeout(() => ReactEditor.focus(editor), 100);
        } catch {
          setNoteStatus(NOTE_CN.sendFailed);
          setNoteSubmitting(false);
        }
      },
      [editor, mx, noteFileName, noteText, replyDraft, room, roomId, sendTypingStatus, setReplyDraft]
    );

    const handleStickerSelect = async (mxc: string, label: string, info?: IImageInfo) => {
      const remoteSticker = isHttpUrl(mxc);
      const matrixSticker = isMxcUrl(mxc);
      if (stickerSendingRef.current) {
        closeEmojiBoard();
        return;
      }

      if (!remoteSticker && !matrixSticker) {
        setSendError('贴纸地址无效，请检查远程表情索引。');
        closeEmojiBoard();
        return;
      }

      stickerSendingRef.current = true;
      setSendError(undefined);
      closeEmojiBoard();
      try {
        const pendingContent: IContent = {
          body: STICKER_EVENT_BODY,
          url: mxc,
          ...(info ? { info } : {}),
        };
        const finalContent = matrixSticker
          ? () => Promise.resolve(cloneMessageContent(pendingContent))
          : () => createRemoteStickerContent(mx, room, mxc, label, info);

        const sendPromise = sendRoomEventWithPendingContent(
          mx,
          room,
          EventType.Sticker,
          withReplyMetadata(pendingContent, replyDraft, mx.getUserId()),
          async () => withReplyMetadata(await finalContent(), replyDraft, mx.getUserId())
        );
        if (replyDraft) {
          setReplyDraft(undefined);
          replyDraftRef.current = undefined;
          sendTypingStatus(false);
        }
        dispatchRoomFollowLatest(roomId);
        sendPromise
          .then(() => {
            dispatchRoomFollowLatest(roomId);
          })
          .catch((error) => {
            setSendError(getStickerSendErrorMessage(error, remoteSticker));
          })
          .finally(() => {
            stickerSendingRef.current = false;
            setSendStatus(undefined);
          });
      } catch (error) {
        setSendError(getStickerSendErrorMessage(error, remoteSticker));
        stickerSendingRef.current = false;
        setSendStatus(undefined);
      }
    };

    const closeMobileAttachmentMenu = useCallback(() => {
      setMobileAttachmentMenuOpen(false);
    }, []);

    const handleMobileAttachmentPick = useCallback(
      (selectOptions: string | SelectFileOptions, single?: boolean) => {
        closeMobileAttachmentMenu();
        const pick = single ? pickSingleFile : pickFile;
        pick(selectOptions).catch(() => undefined);
      },
      [closeMobileAttachmentMenu, pickFile, pickSingleFile]
    );

    const closePollDialog = useCallback(() => {
      setPollDialog(false);
      setTimeout(() => ReactEditor.focus(editor), 100);
    }, [editor]);

    const handleCreatePoll = useCallback(
      async (input: CreatePollInput) => {
        const content = withReplyMetadata(
          createPollMessageContent(input),
          replyDraft,
          mx.getUserId()
        );

        setSendError(undefined);

        try {
          await mx.sendEvent(roomId, OUTGOING_POLL_START_EVENT_TYPE, content as never);
          dispatchRoomFollowLatest(roomId);
          setReplyDraft(undefined);
          sendTypingStatus(false);
          closePollDialog();
        } catch (error) {
          setSendError(getSendErrorMessage(error));
        }
      },
      [closePollDialog, mx, replyDraft, roomId, sendTypingStatus, setReplyDraft]
    );

    return (
      <div ref={ref}>
        <CreatePollModal
          open={pollDialog}
          requestClose={closePollDialog}
          onCreate={handleCreatePoll}
        />
        <Overlay open={noteDialogOpen} backdrop={<OverlayBackdrop />}>
          <OverlayCenter>
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                returnFocusOnDeactivate: false,
                onDeactivate: closeNoteDialog,
                clickOutsideDeactivates: true,
              }}
            >
              <Dialog
                variant="Surface"
                style={{
                  width: 'calc(100vw - 32px)',
                  maxWidth: toRem(640),
                  maxHeight: '85vh',
                }}
              >
                <Box
                  as="form"
                  direction="Column"
                  style={{ maxHeight: '85vh' }}
                  onSubmit={handleNoteSubmit}
                >
                  <Box alignItems="Center" gap="200" style={{ padding: config.space.S400 }}>
                    <Box grow="Yes" direction="Column" gap="100">
                      <Text size="H4">{NOTE_CN.title}</Text>
                      <Text size="T300" priority="300">
                        {NOTE_CN.hint}
                      </Text>
                    </Box>
                    <Box shrink="No">
                      <IconButton
                        type="button"
                        onClick={closeNoteDialog}
                        variant="SurfaceVariant"
                        size="300"
                        radii="300"
                        disabled={noteSubmitting}
                        aria-disabled={noteSubmitting}
                      >
                        <Icon src={Icons.Cross} />
                      </IconButton>
                    </Box>
                  </Box>

                  <Line variant="SurfaceVariant" size="300" />

                  <Scroll size="300" hideTrack visibility="Hover">
                    <Box direction="Column" gap="400" style={{ padding: config.space.S400 }}>
                      <Box direction="Column" gap="100">
                        <Text size="L400">{NOTE_CN.fileName}</Text>
                        <Input
                          size="500"
                          value={noteFileName}
                          onChange={(evt) => {
                            setNoteFileName(evt.currentTarget.value);
                            setNoteStatus(undefined);
                          }}
                          placeholder={NOTE_CN.fileNamePlaceholder}
                          variant="Background"
                          outlined
                          style={{ width: '100%', minWidth: 0 }}
                        />
                      </Box>

                      <Box direction="Column" gap="100">
                        <Text size="L400">{NOTE_CN.content}</Text>
                        <textarea
                          value={noteText}
                          onChange={(evt) => {
                            setNoteText(evt.currentTarget.value);
                            setNoteStatus(undefined);
                          }}
                          rows={14}
                          placeholder={NOTE_CN.contentPlaceholder}
                          style={{
                            width: '100%',
                            minWidth: 0,
                            minHeight: toRem(240),
                            resize: 'vertical',
                            borderRadius: 8,
                            border: '1px solid rgba(120, 120, 120, 0.22)',
                            padding: config.space.S300,
                            fontFamily: 'inherit',
                            whiteSpace: 'pre-wrap',
                            background: 'transparent',
                            color: 'inherit',
                          }}
                        />
                      </Box>

                      {noteStatus && (
                        <Text size="T300" style={{ color: color.Critical.Main }}>
                          {noteStatus}
                        </Text>
                      )}

                      <Box justifyContent="End" gap="200">
                        <Button
                          type="button"
                          variant="Secondary"
                          fill="Soft"
                          size="300"
                          radii="300"
                          outlined
                          onClick={closeNoteDialog}
                          disabled={noteSubmitting}
                        >
                          <Text size="B300">{NOTE_CN.cancel}</Text>
                        </Button>
                        <Button
                          type="submit"
                          data-note-submit="true"
                          variant="Primary"
                          size="300"
                          radii="300"
                          disabled={noteSubmitting}
                        >
                          <Text size="B300">{noteSubmitting ? NOTE_CN.sending : NOTE_CN.send}</Text>
                          <Icon src={Icons.Send} size="50" filled />
                        </Button>
                      </Box>
                    </Box>
                  </Scroll>
                </Box>
              </Dialog>
            </FocusTrap>
          </OverlayCenter>
        </Overlay>
        {selectedFiles.length > 0 && (
          <UploadBoard
            header={
              <UploadBoardHeader
                open={uploadBoard}
                onToggle={() => setUploadBoard(!uploadBoard)}
                uploadFamilyObserverAtom={uploadFamilyObserverAtom}
                onSend={handleSendUpload}
                imperativeHandlerRef={uploadBoardHandlers}
                onCancel={handleCancelUpload}
              />
            }
          >
            {uploadBoard && (
              <Scroll size="300" hideTrack visibility="Hover">
                <UploadBoardContent>
                  {Array.from(selectedFiles)
                    .reverse()
                    .map((fileItem, index) => (
                      <UploadCardRenderer
                        // eslint-disable-next-line react/no-array-index-key
                        key={index}
                        isEncrypted={!!fileItem.encInfo}
                        fileItem={fileItem}
                        setMetadata={handleFileMetadata}
                        onRemove={handleRemoveUpload}
                      />
                    ))}
                </UploadBoardContent>
              </Scroll>
            )}
          </UploadBoard>
        )}
        <Overlay
          open={dropZoneVisible}
          backdrop={<OverlayBackdrop />}
          style={{ pointerEvents: 'none' }}
        >
          <OverlayCenter>
            <Dialog variant="Primary">
              <Box
                direction="Column"
                justifyContent="Center"
                alignItems="Center"
                gap="500"
                style={{ padding: toRem(60) }}
              >
                <Icon size="600" src={Icons.File} />
                <Text size="H4" align="Center">
                  {`\u62d6\u653e\u6587\u4ef6\u5230\u201c${room?.name || '\u623f\u95f4'}\u201d`}
                </Text>
                <Text align="Center">
                  {
                    '\u62d6\u62fd\u6587\u4ef6\u5230\u8fd9\u91cc\uff0c\u6216\u70b9\u51fb\u9009\u62e9\u6587\u4ef6'
                  }
                </Text>
              </Box>
            </Dialog>
          </OverlayCenter>
        </Overlay>
        {autocompleteQuery?.prefix === AutocompletePrefix.RoomMention && (
          <RoomMentionAutocomplete
            roomId={roomId}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.UserMention && (
          <UserMentionAutocomplete
            room={room}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.Emoticon && (
          <EmoticonAutocomplete
            imagePackRooms={imagePackRooms}
            imagePackMode="personal"
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.Command && (
          <CommandAutocomplete
            room={room}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        <CustomEditor
          editableName="RoomInput"
          editor={editor}
          placeholder="发送消息..."
          onKeyDown={handleKeyDown}
          onChange={handleEditorChange}
          onPaste={handlePaste}
          top={
            (replyDraft || recording || recordingError || sendError || sendStatus) && (
              <div>
                {replyDraft && (
                  <Box
                    alignItems="Center"
                    gap="300"
                    style={{ padding: `${config.space.S200} ${config.space.S300} 0` }}
                  >
                    <IconButton
                      onClick={() => setReplyDraft(undefined)}
                      variant="SurfaceVariant"
                      size="300"
                      radii="300"
                    >
                      <Icon src={Icons.Cross} size="50" />
                    </IconButton>
                    <Box direction="Row" gap="200" alignItems="Center">
                      {replyDraft.relation?.rel_type === RelationType.Thread && <ThreadIndicator />}
                      <ReplyLayout
                        userColor={replyUsernameColor}
                        username={
                          <Text size="T300" truncate>
                            <b>
                              {getMemberDisplayName(room, replyDraft.userId) ??
                                getMxIdLocalPart(replyDraft.userId) ??
                                replyDraft.userId}
                            </b>
                          </Text>
                        }
                      >
                        <Text size="T300" truncate>
                          {trimReplyFromBody(replyDraft.body)}
                        </Text>
                      </ReplyLayout>
                    </Box>
                  </Box>
                )}
                {(recording || recordingError) && (
                  <Box
                    alignItems="Center"
                    gap="300"
                    style={{ padding: `${config.space.S200} ${config.space.S300} 0` }}
                  >
                    {recording ? (
                      <>
                        <IconButton
                          onClick={cancelVoiceRecording}
                          variant="SurfaceVariant"
                          size="300"
                          radii="300"
                        >
                          <Icon src={Icons.Cross} size="50" />
                        </IconButton>
                        <Text size="T300">
                          {`\u6b63\u5728\u5f55\u5236\u8bed\u97f3 ${millisecondsToMinutesAndSeconds(
                            recordingMs
                          )}`}
                        </Text>
                      </>
                    ) : (
                      <Text size="T300" style={{ color: color.Critical.Main }}>
                        {recordingError}
                      </Text>
                    )}
                  </Box>
                )}
                {sendStatus && (
                  <Box
                    alignItems="Center"
                    gap="300"
                    style={{ padding: `${config.space.S200} ${config.space.S300} 0` }}
                  >
                    <Text size="T300">{sendStatus}</Text>
                  </Box>
                )}
                {sendError && (
                  <Box
                    alignItems="Center"
                    gap="300"
                    style={{ padding: `${config.space.S200} ${config.space.S300} 0` }}
                  >
                    <Text size="T300" style={{ color: color.Critical.Main }}>
                      {sendError}
                    </Text>
                  </Box>
                )}
              </div>
            )
          }
          before={
            <PopOut
              offset={8}
              position="Top"
              align="Start"
              anchor={
                mobileAttachmentMenuEnabled && mobileAttachmentMenuOpen
                  ? attachmentBtnRef.current?.getBoundingClientRect()
                  : undefined
              }
              content={
                mobileAttachmentMenuEnabled ? (
                  <FocusTrap
                    focusTrapOptions={{
                      initialFocus: false,
                      returnFocusOnDeactivate: false,
                      onDeactivate: closeMobileAttachmentMenu,
                      clickOutsideDeactivates: true,
                    }}
                  >
                    <Menu style={{ maxWidth: toRem(200), width: 'calc(100vw - 32px)' }}>
                      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                        <MenuItem
                          size="300"
                          radii="300"
                          after={<Icon size="100" src={Icons.Photo} />}
                          onClick={() =>
                            handleMobileAttachmentPick(
                              { accept: 'image/*', capture: 'environment' },
                              true
                            )
                          }
                        >
                          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                            拍照发送
                          </Text>
                        </MenuItem>
                        <MenuItem
                          size="300"
                          radii="300"
                          after={<Icon size="100" src={Icons.VideoCamera} />}
                          onClick={() =>
                            handleMobileAttachmentPick(
                              { accept: 'video/*', capture: 'environment' },
                              true
                            )
                          }
                        >
                          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                            录像发送
                          </Text>
                        </MenuItem>
                        <MenuItem
                          size="300"
                          radii="300"
                          after={<Icon size="100" src={Icons.File} />}
                          onClick={() => handleMobileAttachmentPick('*')}
                        >
                          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                            选择附件
                          </Text>
                        </MenuItem>
                      </Box>
                    </Menu>
                  </FocusTrap>
                ) : undefined
              }
            >
              <IconButton
                ref={attachmentBtnRef}
                onClick={() => {
                  if (mobileAttachmentMenuEnabled) {
                    setMobileAttachmentMenuOpen((open) => !open);
                    return;
                  }
                  pickFile('*').catch(() => undefined);
                }}
                variant="SurfaceVariant"
                size="300"
                radii="300"
                aria-pressed={mobileAttachmentMenuEnabled ? mobileAttachmentMenuOpen : undefined}
              >
                <Icon src={Icons.PlusCircle} />
              </IconButton>
            </PopOut>
          }
          after={
            <>
              <IconButton
                onClick={() => setPollDialog(true)}
                variant="SurfaceVariant"
                size="300"
                radii="300"
                disabled={recording}
                aria-disabled={recording}
              >
                <Icon src={Icons.OrderList} />
              </IconButton>
              <IconButton
                onClick={recording ? stopVoiceRecording : startVoiceRecording}
                variant={recording ? 'Primary' : 'SurfaceVariant'}
                size="300"
                radii="300"
                aria-pressed={recording}
              >
                <Icon src={recording ? Icons.Check : Icons.Mic} />
              </IconButton>
              <IconButton
                variant="SurfaceVariant"
                size="300"
                radii="300"
                onClick={() => setToolbar(!toolbar)}
              >
                <Icon src={toolbar ? Icons.AlphabetUnderline : Icons.Alphabet} />
              </IconButton>
              <IconButton
                onClick={handleOpenNoteDialog}
                variant="SurfaceVariant"
                size="300"
                radii="300"
                disabled={recording}
                aria-disabled={recording}
                title={NOTE_CN.title}
              >
                <Icon src={Icons.File} />
              </IconButton>
              <PopOut
                offset={16}
                alignOffset={-44}
                position="Top"
                align="End"
                anchor={emojiBoardOpen ? emojiBtnRef.current?.getBoundingClientRect() : undefined}
                content={
                  <EmojiBoard
                    tab={emojiBoardTab}
                    onTabChange={setEmojiBoardTab}
                    imagePackRooms={imagePackRooms}
                    imagePackMode="personal"
                    returnFocusOnDeactivate={false}
                    onEmojiSelect={handleEmoticonSelect}
                    onCustomEmojiSelect={handleEmoticonSelect}
                    onStickerSelect={handleStickerSelect}
                    requestClose={closeEmojiBoard}
                  />
                }
              >
                <IconButton
                  ref={emojiBtnRef}
                  aria-pressed={emojiBoardOpen}
                  onPointerDown={(evt: React.PointerEvent<HTMLButtonElement>) => {
                    emojiBoardTouchTriggerRef.current = Date.now();
                    if (emojiBoardOpen) {
                      evt.preventDefault();
                      evt.stopPropagation();
                      closeEmojiBoard(true);
                    }
                  }}
                  onClick={() => {
                    if (Date.now() < emojiBoardSkipClickUntilRef.current) {
                      return;
                    }
                    toggleEmojiBoard();
                  }}
                  variant="SurfaceVariant"
                  size="300"
                  radii="300"
                >
                  <Icon src={Icons.Smile} filled={emojiBoardOpen} />
                </IconButton>
              </PopOut>
              <IconButton
                onClick={
                  recording
                    ? undefined
                    : () => {
                        submit().catch(() => undefined);
                      }
                }
                variant="SurfaceVariant"
                size="300"
                radii="300"
                disabled={recording}
                aria-disabled={recording}
              >
                <Icon src={Icons.Send} />
              </IconButton>
            </>
          }
          bottom={
            toolbar && (
              <div>
                <Line variant="SurfaceVariant" size="300" />
                <Toolbar />
              </div>
            )
          }
        />
      </div>
    );
  }
);
