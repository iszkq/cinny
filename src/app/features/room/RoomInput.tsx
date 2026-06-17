import React, {
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
import { EventType, IContent, MsgType, RelationType, Room } from 'matrix-js-sdk';
import { ReactEditor } from 'slate-react';
import { Descendant, Editor, Transforms } from 'slate';
import {
  Box,
  Dialog,
  Icon,
  IconButton,
  Icons,
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
import { getAudioFileUrl, loadAudioElement, SelectFileOptions } from '../../utils/dom';
import { getAudioInfo, TUploadContent, encryptFile, getMxIdLocalPart } from '../../utils/matrix';
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
import { useElementSizeObserver } from '../../hooks/useElementSizeObserver';
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

interface RoomInputProps {
  editor: Editor;
  fileDropContainerRef: RefObject<HTMLElement>;
  roomId: string;
  room: Room;
}

const cloneEditorDraft = (draft: Descendant[]): Descendant[] =>
  JSON.parse(JSON.stringify(draft)) as Descendant[];

const EMOJI_BOARD_REOPEN_SUPPRESS_MS = 400;

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
    const mediaRecorderRef = useRef<MediaRecorder>();
    const mediaStreamRef = useRef<MediaStream>();
    const recordingChunksRef = useRef<Blob[]>([]);
    const [selectedFiles, setSelectedFiles] = useAtom(roomIdToUploadItemsAtomFamily(roomId));
    const [recording, setRecording] = useState(false);
    const [recordingMs, setRecordingMs] = useState(0);
    const [recordingError, setRecordingError] = useState<string>();
    const [sendError, setSendError] = useState<string>();
    const sendingMessageRef = useRef(false);
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
    const emojiBoardTabRef = useRef(emojiBoardTab);
    const emojiBoardTouchTriggerRef = useRef(0);
    const emojiBoardSuppressOpenUntilRef = useRef(0);
    const emojiBoardSkipClickUntilRef = useRef(0);
    const emojiBoardFocusTimerRef = useRef<number>();
    emojiBoardOpenRef.current = emojiBoardOpen;
    emojiBoardTabRef.current = emojiBoardTab;

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
    const [hideStickerBtn, setHideStickerBtn] = useState(document.body.clientWidth < 500);

    const isComposing = useComposingCheck();

    useElementSizeObserver(
      useCallback(() => fileDropContainerRef.current, [fileDropContainerRef]),
      useCallback((width) => setHideStickerBtn(width < 500), [])
    );

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

    const toggleEmojiBoardTab = useCallback(
      (nextTab: EmojiBoardTab) => {
        const now = Date.now();
        const currentOpen = emojiBoardOpenRef.current;
        const currentTab = emojiBoardTabRef.current;

        if (!currentOpen && now < emojiBoardSuppressOpenUntilRef.current) {
          return;
        }

        if (hideStickerBtn) {
          if (currentOpen) {
            emojiBoardSuppressOpenUntilRef.current = now + EMOJI_BOARD_REOPEN_SUPPRESS_MS;
            closeEmojiBoard();
            return;
          }

          emojiBoardSuppressOpenUntilRef.current = 0;
          setEmojiBoardTab(EmojiBoardTab.Emoji);
          setEmojiBoardOpen(true);
          return;
        }

        if (currentOpen && currentTab === nextTab) {
          emojiBoardSuppressOpenUntilRef.current = now + EMOJI_BOARD_REOPEN_SUPPRESS_MS;
          closeEmojiBoard();
          return;
        }

        emojiBoardSuppressOpenUntilRef.current = 0;
        setEmojiBoardTab(nextTab);
        setEmojiBoardOpen(true);
      },
      [closeEmojiBoard, hideStickerBtn]
    );

    const handleStickerSelect = async (mxc: string, label: string, info?: IImageInfo) => {
      setSendError(undefined);
      try {
        const content = withReplyMetadata(
          {
            body: label,
            url: mxc,
            ...(info ? { info } : {}),
          },
          replyDraft,
          mx.getUserId()
        );
        await mx.sendEvent(roomId, EventType.Sticker, content);
        if (replyDraft) {
          setReplyDraft(undefined);
          sendTypingStatus(false);
        }
        dispatchRoomFollowLatest(roomId);
      } catch (error) {
        setSendError(getSendErrorMessage(error));
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
            (replyDraft || recording || recordingError || sendError) && (
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
                {!hideStickerBtn && (
                  <IconButton
                    aria-pressed={emojiBoardOpen && emojiBoardTab === EmojiBoardTab.Sticker}
                    onPointerDown={(evt) => {
                      emojiBoardTouchTriggerRef.current = Date.now();
                      if (emojiBoardOpen && emojiBoardTab === EmojiBoardTab.Sticker) {
                        evt.preventDefault();
                        evt.stopPropagation();
                        closeEmojiBoard(true);
                      }
                    }}
                    onClick={() => {
                      if (Date.now() < emojiBoardSkipClickUntilRef.current) {
                        return;
                      }
                      toggleEmojiBoardTab(EmojiBoardTab.Sticker);
                    }}
                    variant="SurfaceVariant"
                    size="300"
                    radii="300"
                  >
                    <Icon
                      src={Icons.Sticker}
                      filled={emojiBoardOpen && emojiBoardTab === EmojiBoardTab.Sticker}
                    />
                  </IconButton>
                )}
                <IconButton
                  ref={emojiBtnRef}
                  aria-pressed={
                    hideStickerBtn
                      ? emojiBoardOpen
                      : emojiBoardOpen && emojiBoardTab === EmojiBoardTab.Emoji
                  }
                  onPointerDown={(evt) => {
                    emojiBoardTouchTriggerRef.current = Date.now();
                    if (
                      hideStickerBtn
                        ? emojiBoardOpen
                        : emojiBoardOpen && emojiBoardTab === EmojiBoardTab.Emoji
                    ) {
                      evt.preventDefault();
                      evt.stopPropagation();
                      closeEmojiBoard(true);
                    }
                  }}
                  onClick={() => {
                    if (Date.now() < emojiBoardSkipClickUntilRef.current) {
                      return;
                    }
                    toggleEmojiBoardTab(EmojiBoardTab.Emoji);
                  }}
                  variant="SurfaceVariant"
                  size="300"
                  radii="300"
                >
                  <Icon
                    src={Icons.Smile}
                    filled={
                      hideStickerBtn
                        ? emojiBoardOpen
                        : emojiBoardOpen && emojiBoardTab === EmojiBoardTab.Emoji
                    }
                  />
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
