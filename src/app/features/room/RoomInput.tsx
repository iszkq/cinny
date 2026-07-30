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
import { Descendant, Editor, RangeRef, Transforms } from 'slate';
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
import { flushSync } from 'react-dom';

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
  getEmojiKeywordAutocompleteQuery,
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
import { CloudSendMode, EmojiBoard, EmojiBoardTab } from '../../components/emoji-board';
import * as emojiBoardCss from '../../components/emoji-board/styles.css';
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
  fetchMediaWithAuth,
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
import {
  dispatchRoomComposerViewportChange,
  dispatchRoomFollowLatest,
  ROOM_COMPOSER_ACTION,
  RoomComposerAction,
} from '../../utils/roomViewEvents';
import { getMemberDisplayName, getMentionContent, getReplyPreviewBody } from '../../utils/room';
import { CommandAutocomplete } from './CommandAutocomplete';
import { Command, SHRUG, TABLEFLIP, UNFLIP, useCommands } from '../../hooks/useCommands';
import { mobileOrTablet } from '../../utils/user-agent';
import { isAndroidApp } from '../../utils/nativePlatform';
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
import { PackImageReader } from '../../plugins/custom-emoji';

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
    sender: userId,
    room_id: room.roomId,
    origin_server_ts: Date.now(),
  });

  localEvent.setTxnId(txnId);
  localEvent.setStatus(EventStatus.SENDING);
  return { localEvent, txnId };
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
      Object.assign(localEvent, { error });
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

const cloneEditorDraft = (draft: Descendant[]): Descendant[] =>
  JSON.parse(JSON.stringify(draft)) as Descendant[];

const EMOJI_BOARD_REOPEN_SUPPRESS_MS = 400;
const REMOTE_STICKER_DOWNLOAD_TIMEOUT_MS = 15000;
const STICKER_EVENT_FALLBACK_BODY = 'Sticker';
const NOTE_TEXT_MIME_TYPE = 'text/plain;charset=utf-8';
const NOTE_DEFAULT_BASENAME = 'note';

const NOTE_CN = {
  title: '\u4fbf\u7b7e\u8bb0\u4e8b\u672c',
  hint: '\u8f93\u5165\u7684\u5185\u5bb9\u4f1a\u4f5c\u4e3a txt \u6587\u4ef6\u53d1\u9001\uff0c\u6362\u884c\u3001\u7a7a\u683c\u548c\u7f29\u8fdb\u4f1a\u4fdd\u7559\u3002',
  fileName: '\u6587\u4ef6\u540d',
  fileNamePlaceholder: '\u7559\u7a7a\u5219\u4f7f\u7528 note.txt',
  content: '\u5185\u5bb9',
  contentPlaceholder:
    '\u5728\u8fd9\u91cc\u7c98\u8d34\u6216\u8f93\u5165\u9700\u8981\u53d1\u9001\u7684\u957f\u6587\u672c',
  cancel: '\u53d6\u6d88',
  send: '\u53d1\u9001',
  sending: '\u53d1\u9001\u4e2d...',
  needContent: '\u8bf7\u5148\u8f93\u5165\u8981\u53d1\u9001\u7684\u6587\u672c\u5185\u5bb9\u3002',
  tooShort:
    '\u5185\u5bb9\u592a\u77ed\uff0c\u670d\u52a1\u5668\u65e0\u6cd5\u5c06\u5b83\u4f5c\u4e3a\u6587\u4ef6\u4e0a\u4f20\uff0c\u8bf7\u518d\u8f93\u5165\u4e00\u4e9b\u6587\u5b57\u540e\u91cd\u8bd5\u3002',
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

type RemoteMediaOperation = 'download' | 'upload';

type ErrorDetail = {
  data?: { error?: string; errcode?: string; mr_errcode?: string };
  errcode?: string;
  httpStatus?: number;
  message?: string;
};

const getErrorDetail = (error: unknown): string | undefined => {
  const detail = error as ErrorDetail;
  return detail?.data?.error?.trim() || detail?.message?.trim();
};

const isMediaTooSmallError = (error: unknown): boolean => {
  const detail = error as ErrorDetail;
  return (
    detail?.data?.mr_errcode === 'M_MEDIA_TOO_SMALL' ||
    detail?.data?.errcode === 'M_MEDIA_TOO_SMALL' ||
    detail?.errcode === 'M_MEDIA_TOO_SMALL'
  );
};

class RemoteMediaOperationError extends Error {
  readonly operation: RemoteMediaOperation;

  readonly originalError: unknown;

  constructor(operation: RemoteMediaOperation, originalError: unknown) {
    super(getErrorDetail(originalError) || `Remote media ${operation} failed.`);
    this.name = 'RemoteMediaOperationError';
    this.operation = operation;
    this.originalError = originalError;
  }
}

const toRemoteMediaOperationError = (
  operation: RemoteMediaOperation,
  error: unknown
): RemoteMediaOperationError =>
  error instanceof RemoteMediaOperationError
    ? error
    : new RemoteMediaOperationError(operation, error);

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
const remoteEmojiUploadCache = new Map<string, Promise<string>>();
const REMOTE_EMOJI_PREPARE_TIMEOUT_MS = 20_000;

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

const getStickerEventBody = (label: string): string => label.trim() || STICKER_EVENT_FALLBACK_BODY;

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

const loadRemoteStickerMediaWithBrowser = async (
  url: string,
  info: IImageInfo | undefined,
  cache: 'force-cache' | 'reload',
  signal: AbortSignal
): Promise<RemoteStickerMedia> => {
  const response = await fetch(url, {
    cache,
    signal,
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
    try {
      return await loadRemoteStickerMediaWithBrowser(
        url,
        info,
        'force-cache',
        abortController.signal
      );
    } catch (error) {
      if ((error as DOMException | undefined)?.name === 'AbortError') {
        throw error;
      }
      return loadRemoteStickerMediaWithBrowser(url, info, 'reload', abortController.signal);
    }
  } catch (error) {
    if (!isDesktopUpdaterSupported()) {
      throw error instanceof Error
        ? error
        : new Error('云端图片读取失败，Web 端无法上传为 Matrix 媒体。');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const fetchRemoteStickerMediaWithAndroid = async (
  url: string,
  info?: IImageInfo
): Promise<RemoteStickerMedia> => {
  const response = await fetchMediaWithAuth(url, { method: 'GET', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to download remote sticker: ${response.status}`);
  }

  const blob = await response.blob();
  const mimeType = getRemoteStickerMimeType(blob.type, info);
  return {
    blob: blob.type ? blob : new Blob([blob], { type: mimeType }),
    mimeType,
  };
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
  try {
    // Remote sticker hosts commonly omit CORS headers. Android can fetch them through the native
    // HTTP bridge, while the existing Web and desktop paths remain unchanged.
    if (isAndroidApp()) {
      return await fetchRemoteStickerMediaWithAndroid(url, info);
    }

    if (isDesktopUpdaterSupported()) {
      try {
        return await fetchRemoteStickerMediaWithDesktop(url, info);
      } catch (error) {
        console.warn(error);
      }
    }

    return await fetchRemoteStickerMediaWithBrowser(url, info);
  } catch (error) {
    throw toRemoteMediaOperationError('download', error);
  }
};

const uploadRemoteEmojiMxc = async (
  mx: ReturnType<typeof useMatrixClient>,
  url: string,
  label: string,
  info?: IImageInfo
): Promise<string> => {
  const { blob, mimeType } = await fetchRemoteStickerMedia(url, info);
  const fileName = getRemoteStickerFileName(label, mimeType);
  const sourceFile = new File([blob], fileName, { type: mimeType });

  // Inline custom emoji only carries an image src. It cannot carry encrypted-file metadata,
  // so upload it as regular Matrix media even when the surrounding room is encrypted.
  const upload = await mx
    .uploadContent(sourceFile, {
      includeFilename: true,
      name: fileName,
      type: sourceFile.type || mimeType,
    })
    .catch((error) => {
      throw toRemoteMediaOperationError('upload', error);
    });
  const mxc = upload.content_uri;
  if (!mxc) {
    throw toRemoteMediaOperationError('upload', new Error('Matrix did not return a media URL.'));
  }

  return mxc;
};

const getRemoteEmojiUploadCacheKey = (
  mx: ReturnType<typeof useMatrixClient>,
  url: string
): string => `${mx.getUserId() ?? 'anonymous'}:${url}`;

const clearRemoteEmojiUploadCache = (mx: ReturnType<typeof useMatrixClient>, url: string): void => {
  remoteEmojiUploadCache.delete(getRemoteEmojiUploadCacheKey(mx, url));
};

export const getRemoteEmojiMxc = async (
  mx: ReturnType<typeof useMatrixClient>,
  url: string,
  label: string,
  info?: IImageInfo
): Promise<string> => {
  const cacheKey = getRemoteEmojiUploadCacheKey(mx, url);
  let uploadPromise = remoteEmojiUploadCache.get(cacheKey);
  if (!uploadPromise) {
    uploadPromise = uploadRemoteEmojiMxc(mx, url, label, info).catch((error) => {
      remoteEmojiUploadCache.delete(cacheKey);
      throw error;
    });
    remoteEmojiUploadCache.set(cacheKey, uploadPromise);
  }

  return uploadPromise;
};

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });

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

  const upload = await mx
    .uploadContent(uploadItem.file, {
      includeFilename: true,
      name: fileName,
      type: uploadItem.file.type || mimeType,
    })
    .catch((error) => {
      throw toRemoteMediaOperationError('upload', error);
    });
  const mxc = upload.content_uri;
  if (!mxc) {
    throw toRemoteMediaOperationError('upload', new Error('Matrix did not return a media URL.'));
  }

  const mediaInfo = await getRemoteStickerImageInfo(blob, mimeType, info);
  const content: IContent = {
    body: getStickerEventBody(label),
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

  const uploadedContent = await uploadPromise;
  const content = cloneMessageContent(uploadedContent);
  content.body = getStickerEventBody(label);
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

const NETWORK_ERROR_PATTERN =
  /networkerror|failed to fetch|fetch resource|load failed|cors|cross-origin|network request failed/i;
const ABORT_ERROR_PATTERN = /abort|aborted|operation was aborted/i;
const TIMEOUT_ERROR_PATTERN = /timed out|timeout/i;

const getRemoteMediaOperationErrorMessage = (
  error: unknown,
  mediaName: '贴纸' | '表情'
): string | undefined => {
  if (!(error instanceof RemoteMediaOperationError)) return undefined;

  const originalError = error.originalError as ErrorDetail;
  const detail = getErrorDetail(error);
  const errcode = originalError?.errcode ?? originalError?.data?.errcode;

  if (error.operation === 'download') {
    if (detail && ABORT_ERROR_PATTERN.test(detail)) {
      return `读取云端${mediaName}已取消，请重新选择后再试。`;
    }
    if (detail && TIMEOUT_ERROR_PATTERN.test(detail)) {
      return `读取云端${mediaName}超时。请检查网络连接后重试。`;
    }
    if (detail && /unsupported sticker media url/i.test(detail)) {
      return `这张云端${mediaName}的地址不受支持，请选择其他${mediaName}。`;
    }
    if (detail && NETWORK_ERROR_PATTERN.test(detail)) {
      return `暂时无法读取云端${mediaName}原文件。图片能预览不代表浏览器一定能下载，请刷新页面后重试；如果仍然失败，请检查网络代理或浏览器扩展。`;
    }
    return detail
      ? `读取云端${mediaName}失败：${detail}`
      : `暂时无法读取云端${mediaName}，请稍后重试。`;
  }

  if (
    originalError?.httpStatus === 413 ||
    errcode === 'M_TOO_LARGE' ||
    (detail && /too large|content too large|payload too large|size limit/i.test(detail))
  ) {
    return `图片已经读取成功，但超过了 Matrix 服务器的上传大小限制。请选择较小的${mediaName}。`;
  }
  if (
    originalError?.httpStatus === 429 ||
    errcode === 'M_LIMIT_EXCEEDED' ||
    (detail && /rate limit|too many requests/i.test(detail))
  ) {
    return '图片已经读取成功，但 Matrix 服务器当前请求较多。请稍后再试。';
  }
  if (
    originalError?.httpStatus === 401 ||
    originalError?.httpStatus === 403 ||
    errcode === 'M_FORBIDDEN' ||
    errcode === 'M_UNKNOWN_TOKEN'
  ) {
    return '图片已经读取成功，但 Matrix 服务器拒绝了上传。请重新登录后再试。';
  }
  if (detail && NETWORK_ERROR_PATTERN.test(detail)) {
    return '图片已经读取成功，但无法连接到 Matrix 媒体服务器。请检查当前网络或服务器状态后重试。';
  }

  return detail
    ? `图片已经读取成功，但保存到 Matrix 媒体服务器失败：${detail}`
    : '图片已经读取成功，但 Matrix 媒体服务器没有完成保存。请稍后重试。';
};

const getStickerSendErrorMessage = (
  error: unknown,
  remoteSticker: boolean,
  phase: 'prepare' | 'send' = 'prepare'
): string => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return '当前网络已断开，贴纸还没有发送出去。';
  }

  if (phase === 'prepare') {
    const operationMessage = getRemoteMediaOperationErrorMessage(error, '贴纸');
    if (operationMessage) return operationMessage;
  }

  const detail = getErrorDetail(error);
  const matrixError = error as ErrorDetail;
  const errcode = matrixError?.errcode ?? matrixError?.data?.errcode;

  if (detail && ABORT_ERROR_PATTERN.test(detail)) {
    return remoteSticker ? '云端贴纸发送被中止，请重试。' : '贴纸发送被中止，请重试。';
  }
  if (phase === 'send' && detail && NETWORK_ERROR_PATTERN.test(detail)) {
    return '网络连接不稳定，这张贴纸还没有发送到聊天室。请确认网络恢复后重试。';
  }
  if (phase === 'send' && (matrixError?.httpStatus === 429 || errcode === 'M_LIMIT_EXCEEDED')) {
    return 'Matrix 服务器当前请求较多，这张贴纸还没有发送。请稍后重试。';
  }
  if (phase === 'send' && (matrixError?.httpStatus === 401 || errcode === 'M_UNKNOWN_TOKEN')) {
    return '登录状态已经失效，这张贴纸还没有发送。请重新登录后再试。';
  }
  if (phase === 'send' && (matrixError?.httpStatus === 403 || errcode === 'M_FORBIDDEN')) {
    return '当前账号没有在这个聊天室发送贴纸的权限。';
  }

  if (detail) {
    return remoteSticker ? `云端贴纸发送失败：${detail}` : `贴纸发送失败：${detail}`;
  }

  if (remoteSticker) {
    return '云端贴纸发送失败，请重试。';
  }

  return '贴纸发送失败，请重试。';
};

const getCloudEmojiErrorMessage = (error: unknown): string => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return '\u5f53\u524d\u7f51\u7edc\u5df2\u65ad\u5f00\uff0c\u4e91\u7aef\u8868\u60c5\u8fd8\u6ca1\u6709\u63d2\u5165\u3002';
  }

  const operationMessage = getRemoteMediaOperationErrorMessage(error, '表情');
  if (operationMessage) return operationMessage;

  const detail = getErrorDetail(error);

  if (detail && ABORT_ERROR_PATTERN.test(detail)) {
    return '\u4e91\u7aef\u8868\u60c5\u51c6\u5907\u88ab\u4e2d\u6b62\uff0c\u8bf7\u91cd\u8bd5\u3002';
  }
  if (detail && TIMEOUT_ERROR_PATTERN.test(detail)) {
    return '\u4e91\u7aef\u8868\u60c5\u51c6\u5907\u8d85\u65f6\uff0c\u8bf7\u91cd\u8bd5\u3002';
  }
  if (detail) {
    return `\u4e91\u7aef\u8868\u60c5\u51c6\u5907\u5931\u8d25\uff1a${detail}`;
  }
  return '\u4e91\u7aef\u8868\u60c5\u51c6\u5907\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002';
};

export const RoomInput = forwardRef<HTMLDivElement, RoomInputProps>(
  ({ editor, fileDropContainerRef, roomId, room }, ref) => {
    const mx = useMatrixClient();
    const screenSize = useScreenSizeContext();
    const compactScreen = screenSize !== ScreenSize.Desktop;
    const mobileEmojiBoard = mobileOrTablet() || screenSize === ScreenSize.Mobile;
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
    const cloudEmojiPreparingRef = useRef(false);
    const cloudEmojiRequestIdRef = useRef(0);
    const cloudEmojiInsertionRangeRef = useRef<RangeRef>();
    const roomInputGenerationRef = useRef(0);
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
    const [emojiBoardReady, setEmojiBoardReady] = useState(false);
    const [cloudAutoSendMode, setCloudAutoSendMode] = useState<
      CloudSendMode.Emoji | CloudSendMode.Sticker
    >(CloudSendMode.Sticker);
    const [mobileAttachmentMenuOpen, setMobileAttachmentMenuOpen] = useState(false);
    const autocompleteFrameRef = useRef<number>();
    const suppressEditorRealtimeUpdatesRef = useRef(false);
    const attachmentBtnRef = useRef<HTMLButtonElement>(null);

    const emojiBoardOpenRef = useRef(emojiBoardOpen);
    const emojiBoardTouchTriggerRef = useRef(0);
    const emojiBoardSuppressOpenUntilRef = useRef(0);
    const emojiBoardSkipClickUntilRef = useRef(0);
    const emojiBoardFocusTimerRef = useRef<number>();
    const emojiBoardPendingOpenCleanupRef = useRef<() => void>();
    emojiBoardOpenRef.current = emojiBoardOpen;

    const cancelPendingEmojiBoardOpen = useCallback(() => {
      emojiBoardPendingOpenCleanupRef.current?.();
      emojiBoardPendingOpenCleanupRef.current = undefined;
    }, []);

    useEffect(() => cancelPendingEmojiBoardOpen, [cancelPendingEmojiBoardOpen]);

    useEffect(() => {
      if (!emojiBoardOpen) {
        setEmojiBoardReady(false);
        return undefined;
      }

      let secondFrame = 0;
      const firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setEmojiBoardReady(true));
      });

      return () => {
        window.cancelAnimationFrame(firstFrame);
        if (secondFrame) window.cancelAnimationFrame(secondFrame);
      };
    }, [emojiBoardOpen]);

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

        if (ReactEditor.isComposing(editor)) {
          setAutocompleteQuery(undefined);
          return;
        }

        const prevWordRange = getPrevWorldRange(editor);
        const query = prevWordRange
          ? getAutocompleteQuery<AutocompletePrefix>(
              editor,
              prevWordRange,
              AUTOCOMPLETE_PREFIXES
            ) ?? getEmojiKeywordAutocompleteQuery(editor, prevWordRange)
          : undefined;

        setAutocompleteQuery(query);
      });
    }, [editor]);

    useEffect(() => {
      const handleCompositionEnd = (evt: CompositionEvent) => {
        if (!(evt.target instanceof Element)) return;
        if (!evt.target.closest('[data-editable-name="RoomInput"]')) return;
        scheduleAutocompleteQueryUpdate();
      };

      window.addEventListener('compositionend', handleCompositionEnd, true);
      return () => window.removeEventListener('compositionend', handleCompositionEnd, true);
    }, [scheduleAutocompleteQueryUpdate]);

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

    useEffect(() => {
      const generation = roomInputGenerationRef.current + 1;
      roomInputGenerationRef.current = generation;
      cloudEmojiRequestIdRef.current += 1;
      cloudEmojiPreparingRef.current = false;
      setSendStatus(undefined);
      setSendError(undefined);

      return () => {
        if (roomInputGenerationRef.current === generation) {
          roomInputGenerationRef.current += 1;
        }
        cloudEmojiRequestIdRef.current += 1;
        cloudEmojiPreparingRef.current = false;
        cloudEmojiInsertionRangeRef.current?.unref();
        cloudEmojiInsertionRangeRef.current = undefined;
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
      };
    }, [roomId, editor, setMsgDraft, stopRecordingTracks]);

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
      if (sendingMessageRef.current || cloudEmojiPreparingRef.current) return;

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

    const handleEmoticonSelect = (key: string, shortcode: string, previewUrl?: string) => {
      editor.insertNode(createEmoticonElement(key, shortcode, previewUrl));
      moveCursor(editor, true);
    };

    const resolveCloudEmojiKey = async (
      sourceUrl: string,
      shortcode: string,
      info?: IImageInfo
    ): Promise<string> => {
      const inputGeneration = roomInputGenerationRef.current;
      const currentInput = () => roomInputGenerationRef.current === inputGeneration;

      if (isMxcUrl(sourceUrl)) {
        if (currentInput()) {
          setSendError(undefined);
          setSendStatus(undefined);
        }
        return sourceUrl;
      }
      if (!isHttpUrl(sourceUrl)) {
        const message =
          '\u4e91\u7aef\u8868\u60c5\u5730\u5740\u65e0\u6548\uff0c\u8bf7\u68c0\u67e5\u8fdc\u7a0b\u8868\u60c5\u7d22\u5f15\u3002';
        if (currentInput()) setSendError(message);
        throw new Error(message);
      }
      if (cloudEmojiPreparingRef.current) {
        const message =
          '\u4e0a\u4e00\u679a\u4e91\u7aef\u8868\u60c5\u8fd8\u5728\u51c6\u5907\u4e2d...';
        if (currentInput()) setSendStatus(message);
        throw new Error(message);
      }

      const requestId = cloudEmojiRequestIdRef.current + 1;
      cloudEmojiRequestIdRef.current = requestId;
      cloudEmojiPreparingRef.current = true;
      if (currentInput()) {
        setSendError(undefined);
        setSendStatus('\u6b63\u5728\u51c6\u5907\u4e91\u7aef\u8868\u60c5...');
      }
      try {
        const mxc = await withTimeout(
          getRemoteEmojiMxc(mx, sourceUrl, shortcode, info),
          REMOTE_EMOJI_PREPARE_TIMEOUT_MS,
          'Cloud emoji preparation timed out.'
        );
        return mxc;
      } catch (error) {
        clearRemoteEmojiUploadCache(mx, sourceUrl);
        if (currentInput() && cloudEmojiRequestIdRef.current === requestId) {
          setSendError(getCloudEmojiErrorMessage(error));
        }
        throw error;
      } finally {
        if (cloudEmojiRequestIdRef.current === requestId) {
          cloudEmojiPreparingRef.current = false;
          if (currentInput()) setSendStatus(undefined);
        }
      }
    };

    const handleCloudEmojiSelect = async (
      sourceUrl: string,
      shortcode: string,
      info?: IImageInfo
    ) => {
      const inputGeneration = roomInputGenerationRef.current;
      cloudEmojiInsertionRangeRef.current?.unref();
      const insertionRangeRef = Editor.rangeRef(
        editor,
        editor.selection ?? Editor.range(editor, Editor.end(editor, [])),
        { affinity: 'forward' }
      );
      cloudEmojiInsertionRangeRef.current = insertionRangeRef;
      const sourceDraft = JSON.stringify(editor.children);
      let rangeReleased = false;
      const releaseInsertionRange = () => {
        if (rangeReleased || cloudEmojiInsertionRangeRef.current !== insertionRangeRef) return null;
        rangeReleased = true;
        cloudEmojiInsertionRangeRef.current = undefined;
        return insertionRangeRef.unref();
      };

      try {
        const key = await resolveCloudEmojiKey(sourceUrl, shortcode, info);
        const insertionRange = releaseInsertionRange();
        if (
          roomInputGenerationRef.current !== inputGeneration ||
          !insertionRange ||
          JSON.stringify(editor.children) !== sourceDraft
        ) {
          return;
        }

        Transforms.select(editor, insertionRange);
        handleEmoticonSelect(key, shortcode, sourceUrl);
      } catch {
        releaseInsertionRange();
        // resolveCloudEmojiKey reports the user-facing failure next to the composer.
      }
    };

    const resolveAutocompleteEmojiKey = (image: PackImageReader): string | Promise<string> => {
      if (!isHttpUrl(image.url)) return image.url;
      return resolveCloudEmojiKey(image.url, image.body || image.shortcode, image.info);
    };

    const closeEmojiBoard = useCallback(
      (fromPointerTrigger = false) => {
        if (mobileEmojiBoard && emojiBoardOpenRef.current) {
          dispatchRoomComposerViewportChange(roomId);
        }
        cancelPendingEmojiBoardOpen();
        const now = Date.now();
        if (
          fromPointerTrigger ||
          now - emojiBoardTouchTriggerRef.current < EMOJI_BOARD_REOPEN_SUPPRESS_MS
        ) {
          const suppressUntil = now + EMOJI_BOARD_REOPEN_SUPPRESS_MS;
          emojiBoardSuppressOpenUntilRef.current = suppressUntil;
          emojiBoardSkipClickUntilRef.current = suppressUntil;
        }
        emojiBoardOpenRef.current = false;
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
      [cancelPendingEmojiBoardOpen, editor, mobileEmojiBoard, roomId]
    );

    const toggleEmojiBoard = useCallback(() => {
      const now = Date.now();
      const currentOpen = emojiBoardOpenRef.current;

      if (emojiBoardPendingOpenCleanupRef.current) {
        cancelPendingEmojiBoardOpen();
        return;
      }

      if (!currentOpen && now < emojiBoardSuppressOpenUntilRef.current) {
        return;
      }

      if (currentOpen) {
        emojiBoardSuppressOpenUntilRef.current = now + EMOJI_BOARD_REOPEN_SUPPRESS_MS;
        closeEmojiBoard();
        return;
      }

      emojiBoardSuppressOpenUntilRef.current = 0;
      dispatchRoomComposerViewportChange(roomId);
      setCloudAutoSendMode(
        !isEmptyEditor(editor) || ReactEditor.isFocused(editor) || editor.selection !== null
          ? CloudSendMode.Emoji
          : CloudSendMode.Sticker
      );
      const editorFocused = ReactEditor.isFocused(editor);
      if (mobileEmojiBoard && editorFocused) {
        ReactEditor.blur(editor);
      }
      setEmojiBoardTab(EmojiBoardTab.Emoji);

      const viewport = window.visualViewport;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const keyboardLikelyOpen =
        mobileEmojiBoard &&
        viewport !== null &&
        viewport !== undefined &&
        viewportHeight < window.screen.height * 0.82;

      if (keyboardLikelyOpen && viewport) {
        const initialHeight = viewportHeight;
        let settleTimer = 0;
        let fallbackTimer = 0;
        let disposed = false;
        let revealBoard = () => undefined;

        const handleViewportResize = () => {
          if (viewport.height < initialHeight + 24) return;
          if (settleTimer) window.clearTimeout(settleTimer);
          settleTimer = window.setTimeout(revealBoard, 80);
        };

        const cleanup = () => {
          disposed = true;
          viewport.removeEventListener('resize', handleViewportResize);
          if (settleTimer) window.clearTimeout(settleTimer);
          if (fallbackTimer) window.clearTimeout(fallbackTimer);
        };
        revealBoard = () => {
          if (disposed) return;
          viewport.removeEventListener('resize', handleViewportResize);
          if (settleTimer) window.clearTimeout(settleTimer);
          if (fallbackTimer) window.clearTimeout(fallbackTimer);
          emojiBoardPendingOpenCleanupRef.current = undefined;
          window.requestAnimationFrame(() => setEmojiBoardOpen(true));
        };

        viewport.addEventListener('resize', handleViewportResize, { passive: true });
        fallbackTimer = window.setTimeout(revealBoard, 480);
        emojiBoardPendingOpenCleanupRef.current = cleanup;
        return;
      }

      setEmojiBoardOpen(true);
    }, [cancelPendingEmojiBoardOpen, closeEmojiBoard, editor, mobileEmojiBoard, roomId]);

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

    useEffect(() => {
      const handleComposerAction = (evt: Event) => {
        const { detail } = evt as CustomEvent<{
          roomId?: string;
          action?: RoomComposerAction;
        }>;
        if (detail.roomId !== roomId) return;

        if (detail.action === 'poll') {
          setPollDialog(true);
        } else if (detail.action === 'note') {
          handleOpenNoteDialog();
        }
      };

      window.addEventListener(ROOM_COMPOSER_ACTION, handleComposerAction);
      return () => window.removeEventListener(ROOM_COMPOSER_ACTION, handleComposerAction);
    }, [handleOpenNoteDialog, roomId]);

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

        const file = safeFile(
          new File([noteText], getNoteFileName(noteFileName), {
            type: NOTE_TEXT_MIME_TYPE,
          })
        );

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
        } catch (error) {
          setNoteStatus(isMediaTooSmallError(error) ? NOTE_CN.tooShort : NOTE_CN.sendFailed);
          setNoteSubmitting(false);
        }
      },
      [
        editor,
        mx,
        noteFileName,
        noteText,
        replyDraft,
        room,
        roomId,
        sendTypingStatus,
        setReplyDraft,
      ]
    );

    const handleStickerSelect = async (mxc: string, label: string, info?: IImageInfo) => {
      const remoteSticker = isHttpUrl(mxc);
      const matrixSticker = isMxcUrl(mxc);
      if (remoteSticker && stickerSendingRef.current) {
        setSendStatus(
          '\u4e0a\u4e00\u5f20\u4e91\u7aef\u8d34\u7eb8\u8fd8\u5728\u51c6\u5907\u4e2d...'
        );
        return;
      }

      if (!remoteSticker && !matrixSticker) {
        setSendError('贴纸地址无效，请检查远程表情索引。');
        return;
      }

      const replyDraftSnapshot = replyDraft;
      const currentUserId = mx.getUserId();

      if (remoteSticker) {
        stickerSendingRef.current = true;
        setSendStatus('\u6b63\u5728\u51c6\u5907\u4e91\u7aef\u8d34\u7eb8...');
      } else {
        setSendStatus(undefined);
      }
      setSendError(undefined);
      try {
        const pendingContent: IContent = {
          body: getStickerEventBody(label),
          url: mxc,
          ...(info ? { info } : {}),
        };
        const finalContent = matrixSticker
          ? cloneMessageContent(pendingContent)
          : await createRemoteStickerContent(mx, room, mxc, label, info);

        if (remoteSticker) {
          setSendStatus('\u8d34\u7eb8\u53d1\u9001\u4e2d...');
        }

        const sendPromise = sendRoomEventWithoutQueue(
          mx,
          room,
          EventType.Sticker,
          withReplyMetadata(finalContent, replyDraftSnapshot, currentUserId)
        );
        if (replyDraftSnapshot) {
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
            setSendError(getStickerSendErrorMessage(error, remoteSticker, 'send'));
            if (!replyDraftRef.current && replyDraftSnapshot) {
              setReplyDraft(replyDraftSnapshot);
            }
          })
          .finally(() => {
            if (remoteSticker) {
              stickerSendingRef.current = false;
            }
            setSendStatus(undefined);
          });
      } catch (error) {
        setSendError(getStickerSendErrorMessage(error, remoteSticker));
        if (!replyDraftRef.current && replyDraftSnapshot) {
          setReplyDraft(replyDraftSnapshot);
        }
        if (remoteSticker) {
          stickerSendingRef.current = false;
        }
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

    const emojiBoardContent = emojiBoardReady ? (
      <EmojiBoard
        tab={emojiBoardTab}
        onTabChange={setEmojiBoardTab}
        imagePackRooms={imagePackRooms}
        imagePackMode="personal"
        returnFocusOnDeactivate={false}
        closeOnOutsideClick={!mobileEmojiBoard}
        cloudAutoSendMode={cloudAutoSendMode}
        onEmojiSelect={handleEmoticonSelect}
        onCustomEmojiSelect={handleEmoticonSelect}
        onCloudEmojiSelect={handleCloudEmojiSelect}
        onStickerSelect={handleStickerSelect}
        requestClose={closeEmojiBoard}
      />
    ) : (
      <Box className={emojiBoardCss.Base} alignItems="Center" justifyContent="Center">
        <Text size="T300">正在加载表情…</Text>
      </Box>
    );

    const emojiBoardButton = (
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
        {(autocompleteQuery?.prefix === AutocompletePrefix.Emoticon ||
          autocompleteQuery?.prefix === AutocompletePrefix.EmojiKeyword) && (
          <EmoticonAutocomplete
            imagePackRooms={imagePackRooms}
            imagePackMode="personal"
            editor={editor}
            query={autocompleteQuery}
            resolveCustomEmojiKey={resolveAutocompleteEmojiKey}
            onStickerSelect={(image) =>
              handleStickerSelect(image.url, image.body || image.shortcode, image.info)
            }
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
          onFocus={() => {
            if (mobileEmojiBoard) {
              dispatchRoomComposerViewportChange(roomId);
            }
            if (mobileEmojiBoard && emojiBoardOpenRef.current) closeEmojiBoard();
          }}
          onPointerDown={(evt) => {
            if (mobileEmojiBoard && emojiBoardOpenRef.current) {
              evt.preventDefault();
              evt.stopPropagation();
              // Unmount FocusTrap before moving focus. Otherwise its focus guard can steal focus
              // back during the same pointer event (most often on Sticker/Cloud tabs), leaving the
              // panel closed but the Android software keyboard hidden.
              flushSync(() => closeEmojiBoard());
              if (!editor.selection) {
                Transforms.select(editor, Editor.end(editor, []));
              }
              ReactEditor.focus(editor);
            }
          }}
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
                          {getReplyPreviewBody(replyDraft.body, replyDraft.formattedBody)}
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
              {!mobileEmojiBoard && (
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
              )}
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
              {!mobileEmojiBoard && (
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
              )}
              {mobileEmojiBoard ? (
                emojiBoardButton
              ) : (
                <PopOut
                  offset={16}
                  alignOffset={-44}
                  position="Top"
                  align="End"
                  anchor={emojiBoardOpen ? emojiBtnRef.current?.getBoundingClientRect() : undefined}
                  content={emojiBoardContent}
                >
                  {emojiBoardButton}
                </PopOut>
              )}
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
                disabled={recording || cloudEmojiPreparingRef.current}
                aria-disabled={recording || cloudEmojiPreparingRef.current}
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
        {mobileEmojiBoard && emojiBoardOpen && (
          <Box
            justifyContent="Center"
            style={{
              width: '100%',
              paddingTop: config.space.S100,
              overflow: 'hidden',
            }}
          >
            {emojiBoardContent}
          </Box>
        )}
      </div>
    );
  }
);
