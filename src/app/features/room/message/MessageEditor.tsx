import React, {
  KeyboardEventHandler,
  MouseEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Box,
  Chip,
  Icon,
  IconButton,
  Icons,
  Line,
  PopOut,
  RectCords,
  Spinner,
  Text,
  as,
  color,
  config,
} from 'folds';
import { Editor, Transforms } from 'slate';
import { ReactEditor } from 'slate-react';
import { IContent, IMentions, MatrixEvent, MsgType, RelationType, Room } from 'matrix-js-sdk';
import { isKeyHotkey } from 'is-hotkey';
import {
  AUTOCOMPLETE_PREFIXES,
  AutocompletePrefix,
  AutocompleteQuery,
  CustomEditor,
  EmoticonAutocomplete,
  RoomMentionAutocomplete,
  Toolbar,
  UserMentionAutocomplete,
  createEmoticonElement,
  customHtmlEqualsPlainText,
  getAutocompleteQuery,
  getPrevWorldRange,
  htmlToEditorInput,
  moveCursor,
  plainToEditorInput,
  toMatrixCustomHTML,
  toPlainText,
  trimCustomHtml,
  useEditor,
  getMentions,
} from '../../../components/editor';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { UseStateProvider } from '../../../components/UseStateProvider';
import { EmojiBoard } from '../../../components/emoji-board';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { getEditedEvent, getMentionContent, trimReplyFromFormattedBody } from '../../../utils/room';
import { mobileOrTablet } from '../../../utils/user-agent';
import { useComposingCheck } from '../../../hooks/useComposingCheck';
import { useFilePicker } from '../../../hooks/useFilePicker';
import { safeFile } from '../../../utils/mimeTypes';
import { encryptFile } from '../../../utils/matrix';
import { TUploadItem } from '../../../state/room/roomInputDrafts';
import { getImageMsgContent } from '../msgContent';

type MessageEditorProps = {
  roomId: string;
  room: Room;
  mEvent: MatrixEvent;
  imagePackRooms?: Room[];
  onCancel: () => void;
};

const EMOJI_BOARD_REOPEN_SUPPRESS_MS = 400;

const getImageReplaceErrorMessage = (error: unknown): string => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return '\u5f53\u524d\u7f51\u7edc\u5df2\u65ad\u5f00\uff0c\u65b0\u56fe\u7247\u8fd8\u6ca1\u6709\u66ff\u6362\u6210\u529f\u3002';
  }

  const matrixError = error as {
    data?: { error?: string };
    message?: string;
  };
  const detail = matrixError?.data?.error ?? matrixError?.message;
  return detail
    ? `\u66ff\u6362\u56fe\u7247\u5931\u8d25\uff1a${detail}`
    : '\u66ff\u6362\u56fe\u7247\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002';
};

const ImageMessageEditor = as<'div', MessageEditorProps>(
  ({ room, roomId, mEvent, onCancel, ...props }, ref) => {
    const mx = useMatrixClient();
    const [selectedFile, setSelectedFile] = useState<File>();
    const [selectionError, setSelectionError] = useState<string>();
    const previewUrl = useMemo(
      () => (selectedFile ? URL.createObjectURL(selectedFile) : undefined),
      [selectedFile]
    );

    useEffect(
      () => () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      },
      [previewUrl]
    );

    const handleFileSelect = useCallback((file: File) => {
      const imageFile = safeFile(file);
      if (!imageFile.type.startsWith('image/')) {
        setSelectedFile(undefined);
        setSelectionError(
          '\u8bf7\u9009\u62e9 JPEG\u3001PNG\u3001GIF\u3001WebP \u6216 AVIF \u56fe\u7247\u3002'
        );
        return;
      }

      setSelectionError(undefined);
      setSelectedFile(imageFile);
    }, []);
    const pickImage = useFilePicker(handleFileSelect, false);

    const [replaceState, replaceImage] = useAsyncCallback(
      useCallback(async () => {
        if (!selectedFile) return undefined;

        const uploadItem: TUploadItem = room.hasEncryptionStateEvent()
          ? {
              ...(await encryptFile(selectedFile)),
              metadata: { markedAsSpoiler: false },
            }
          : {
              file: selectedFile,
              originalFile: selectedFile,
              encInfo: undefined,
              metadata: { markedAsSpoiler: false },
            };

        const upload = await mx.uploadContent(uploadItem.file, {
          includeFilename: true,
          name: selectedFile.name,
          type: selectedFile.type,
        });
        const mxc = upload.content_uri;
        if (!mxc) {
          throw new Error('Matrix did not return a media URL.');
        }

        const newContent = await getImageMsgContent(mx, uploadItem, mxc);
        const replacementContent: IContent = {
          ...newContent,
          body: `* ${newContent.body ?? selectedFile.name}`,
          'm.new_content': newContent,
          'm.relates_to': {
            event_id: mEvent.getId(),
            rel_type: RelationType.Replace,
          },
        };

        return mx.sendMessage(roomId, replacementContent as never);
      }, [mx, mEvent, room, roomId, selectedFile])
    );

    useEffect(() => {
      if (replaceState.status === AsyncStatus.Success) {
        onCancel();
      }
    }, [onCancel, replaceState.status]);

    const loading = replaceState.status === AsyncStatus.Loading;
    const errorMessage =
      selectionError ??
      (replaceState.status === AsyncStatus.Error
        ? getImageReplaceErrorMessage(replaceState.error)
        : undefined);

    return (
      <div {...props} ref={ref}>
        <Box direction="Column" gap="300" style={{ padding: config.space.S300 }}>
          <Text size="T300">
            {
              '\u9009\u62e9\u4e00\u5f20\u65b0\u56fe\u7247\uff0c\u5b8c\u6210\u540e\u4f1a\u5728\u539f\u6d88\u606f\u4f4d\u7f6e\u66ff\u6362\u65e7\u56fe\u7247\u3002'
            }
          </Text>
          {previewUrl && (
            <img
              src={previewUrl}
              alt={selectedFile?.name ?? ''}
              style={{
                display: 'block',
                width: 'auto',
                height: 'auto',
                maxWidth: 'min(100%, 360px)',
                maxHeight: '320px',
                objectFit: 'contain',
                borderRadius: config.radii.R300,
              }}
            />
          )}
          {selectedFile && (
            <Text size="T200" priority="300">
              {selectedFile.name}
            </Text>
          )}
          {errorMessage && (
            <Text size="T300" style={{ color: color.Critical.Main }}>
              {errorMessage}
            </Text>
          )}
          <Box gap="200" wrap="Wrap">
            <Chip
              onClick={() => pickImage('image/*')}
              variant="SurfaceVariant"
              radii="Pill"
              disabled={loading}
              outlined
            >
              <Text size="B300">
                {selectedFile ? '\u91cd\u65b0\u9009\u62e9' : '\u9009\u62e9\u65b0\u56fe\u7247'}
              </Text>
            </Chip>
            <Chip
              onClick={() => replaceImage().catch(() => undefined)}
              variant="Primary"
              radii="Pill"
              disabled={!selectedFile || loading}
              outlined
              before={loading ? <Spinner variant="Primary" fill="Soft" size="100" /> : undefined}
            >
              <Text size="B300">{'\u66ff\u6362\u56fe\u7247'}</Text>
            </Chip>
            <Chip onClick={onCancel} variant="SurfaceVariant" radii="Pill" disabled={loading}>
              <Text size="B300">{'\u53d6\u6d88'}</Text>
            </Chip>
          </Box>
        </Box>
      </div>
    );
  }
);

const TextMessageEditor = as<'div', MessageEditorProps>(
  ({ room, roomId, mEvent, imagePackRooms, onCancel, ...props }, ref) => {
    const mx = useMatrixClient();
    const editor = useEditor();
    const [enterForNewline] = useSetting(settingsAtom, 'enterForNewline');
    const [globalToolbar] = useSetting(settingsAtom, 'editorToolbar');
    const [isMarkdown] = useSetting(settingsAtom, 'isMarkdown');
    const [toolbar, setToolbar] = useState(globalToolbar);
    const isComposing = useComposingCheck();
    const emojiBoardTouchTriggerRef = useRef(0);
    const emojiBoardSuppressOpenUntilRef = useRef(0);
    const emojiBoardSkipClickUntilRef = useRef(0);

    const [autocompleteQuery, setAutocompleteQuery] =
      useState<AutocompleteQuery<AutocompletePrefix>>();

    const getPrevBodyAndFormattedBody = useCallback((): [
      string | undefined,
      string | undefined,
      IMentions | undefined
    ] => {
      const evtId = mEvent.getId();
      const evtTimeline = evtId ? room.getTimelineForEvent(evtId) : undefined;
      const editedEvent =
        evtId && evtTimeline
          ? getEditedEvent(evtId, mEvent, evtTimeline.getTimelineSet())
          : undefined;

      const content: IContent = editedEvent?.getContent()['m.new_content'] ?? mEvent.getContent();
      const { body, formatted_body: customHtml }: Record<string, unknown> = content;

      const mMentions: IMentions | undefined = content['m.mentions'];

      return [
        typeof body === 'string' ? body : undefined,
        typeof customHtml === 'string' ? customHtml : undefined,
        mMentions,
      ];
    }, [room, mEvent]);

    const [saveState, save] = useAsyncCallback(
      useCallback(async () => {
        const plainText = toPlainText(editor.children, isMarkdown).trim();
        const customHtml = trimCustomHtml(
          toMatrixCustomHTML(editor.children, {
            allowTextFormatting: true,
            allowBlockMarkdown: isMarkdown,
            allowInlineMarkdown: isMarkdown,
          })
        );

        const [prevBody, prevCustomHtml, prevMentions] = getPrevBodyAndFormattedBody();

        if (plainText === '') return undefined;
        if (prevBody) {
          if (prevCustomHtml && trimReplyFromFormattedBody(prevCustomHtml) === customHtml) {
            return undefined;
          }
          if (
            !prevCustomHtml &&
            prevBody === plainText &&
            customHtmlEqualsPlainText(customHtml, plainText)
          ) {
            return undefined;
          }
        }

        const newContent: IContent = {
          msgtype: mEvent.getContent().msgtype,
          body: plainText,
        };

        const mentionData = getMentions(mx, roomId, editor);

        prevMentions?.user_ids?.forEach((prevMentionId) => {
          mentionData.users.add(prevMentionId);
        });

        const mMentions = getMentionContent(Array.from(mentionData.users), mentionData.room);
        newContent['m.mentions'] = mMentions;

        if (!customHtmlEqualsPlainText(customHtml, plainText)) {
          newContent.format = 'org.matrix.custom.html';
          newContent.formatted_body = customHtml;
        }

        const content: IContent = {
          ...newContent,
          body: `* ${plainText}`,
          'm.new_content': newContent,
          'm.relates_to': {
            event_id: mEvent.getId(),
            rel_type: RelationType.Replace,
          },
        };

        return mx.sendMessage(roomId, content);
      }, [mx, editor, roomId, mEvent, isMarkdown, getPrevBodyAndFormattedBody])
    );

    const handleSave = useCallback(() => {
      if (saveState.status !== AsyncStatus.Loading) {
        save();
      }
    }, [saveState, save]);

    const handleKeyDown: KeyboardEventHandler = useCallback(
      (evt) => {
        if (
          (isKeyHotkey('mod+enter', evt) || (!enterForNewline && isKeyHotkey('enter', evt))) &&
          !isComposing(evt)
        ) {
          evt.preventDefault();
          handleSave();
        }
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          onCancel();
        }
      },
      [onCancel, handleSave, enterForNewline, isComposing]
    );

    const handleKeyUp: KeyboardEventHandler = useCallback(
      (evt) => {
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          return;
        }

        const prevWordRange = getPrevWorldRange(editor);
        const query = prevWordRange
          ? getAutocompleteQuery<AutocompletePrefix>(editor, prevWordRange, AUTOCOMPLETE_PREFIXES)
          : undefined;
        setAutocompleteQuery(query);
      },
      [editor]
    );

    const handleCloseAutocomplete = useCallback(() => {
      ReactEditor.focus(editor);
      setAutocompleteQuery(undefined);
    }, [editor]);

    const handleEmoticonSelect = (key: string, shortcode: string) => {
      editor.insertNode(createEmoticonElement(key, shortcode));
      moveCursor(editor);
    };

    const closeEmojiBoard = useCallback(
      (
        setAnchor: React.Dispatch<React.SetStateAction<RectCords | undefined>>,
        returnFocus = true,
        fromPointerTrigger = false
      ) => {
        const now = Date.now();
        if (
          fromPointerTrigger ||
          now - emojiBoardTouchTriggerRef.current < EMOJI_BOARD_REOPEN_SUPPRESS_MS
        ) {
          const suppressUntil = now + EMOJI_BOARD_REOPEN_SUPPRESS_MS;
          emojiBoardSuppressOpenUntilRef.current = suppressUntil;
          emojiBoardSkipClickUntilRef.current = suppressUntil;
        }

        setAnchor((current) => {
          if (current && returnFocus && !mobileOrTablet()) ReactEditor.focus(editor);
          return undefined;
        });
      },
      [editor]
    );

    const toggleEmojiBoardAnchor = useCallback(
      (
        setAnchor: React.Dispatch<React.SetStateAction<RectCords | undefined>>,
        nextAnchor: RectCords
      ) => {
        const now = Date.now();
        setAnchor((current) => {
          if (current) {
            emojiBoardSuppressOpenUntilRef.current =
              now + EMOJI_BOARD_REOPEN_SUPPRESS_MS;
            if (!mobileOrTablet()) ReactEditor.focus(editor);
            return undefined;
          }

          if (now < emojiBoardSuppressOpenUntilRef.current) {
            return current;
          }

          emojiBoardSuppressOpenUntilRef.current = 0;
          return nextAnchor;
        });
      },
      [editor]
    );

    useEffect(() => {
      const [body, customHtml] = getPrevBodyAndFormattedBody();

      const initialValue =
        typeof customHtml === 'string'
          ? htmlToEditorInput(customHtml, isMarkdown)
          : plainToEditorInput(typeof body === 'string' ? body : '', isMarkdown);

      Transforms.select(editor, {
        anchor: Editor.start(editor, []),
        focus: Editor.end(editor, []),
      });

      editor.insertFragment(initialValue);
      if (!mobileOrTablet()) ReactEditor.focus(editor);
    }, [editor, getPrevBodyAndFormattedBody, isMarkdown]);

    useEffect(() => {
      if (saveState.status === AsyncStatus.Success) {
        onCancel();
      }
    }, [saveState, onCancel]);

    return (
      <div {...props} ref={ref}>
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
            imagePackRooms={imagePackRooms || []}
            imagePackMode="personal"
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        <CustomEditor
          editor={editor}
          placeholder="编辑消息..."
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          bottom={
            <>
              <Box
                style={{ padding: config.space.S200, paddingTop: 0 }}
                alignItems="End"
                justifyContent="SpaceBetween"
                gap="100"
              >
                <Box gap="Inherit">
                  <Chip
                    onClick={handleSave}
                    variant="Primary"
                    radii="Pill"
                    disabled={saveState.status === AsyncStatus.Loading}
                    outlined
                    before={
                      saveState.status === AsyncStatus.Loading ? (
                        <Spinner variant="Primary" fill="Soft" size="100" />
                      ) : undefined
                    }
                  >
                    <Text size="B300">保存</Text>
                  </Chip>
                  <Chip onClick={onCancel} variant="SurfaceVariant" radii="Pill">
                    <Text size="B300">取消</Text>
                  </Chip>
                </Box>
                <Box gap="Inherit">
                  <IconButton
                    variant="SurfaceVariant"
                    size="300"
                    radii="300"
                    onClick={() => setToolbar(!toolbar)}
                  >
                    <Icon size="400" src={toolbar ? Icons.AlphabetUnderline : Icons.Alphabet} />
                  </IconButton>
                  <UseStateProvider initial={undefined}>
                    {(anchor: RectCords | undefined, setAnchor) => (
                      <PopOut
                        anchor={anchor}
                        alignOffset={-8}
                        position="Top"
                        align="End"
                        content={
                          <EmojiBoard
                            imagePackRooms={imagePackRooms ?? []}
                            imagePackMode="personal"
                            returnFocusOnDeactivate={false}
                            onEmojiSelect={handleEmoticonSelect}
                            onCustomEmojiSelect={handleEmoticonSelect}
                            requestClose={() => closeEmojiBoard(setAnchor)}
                          />
                        }
                      >
                        <IconButton
                          aria-pressed={anchor !== undefined}
                          onPointerDown={(evt) => {
                            emojiBoardTouchTriggerRef.current = Date.now();
                            if (!anchor) {
                              return;
                            }
                            evt.preventDefault();
                            evt.stopPropagation();
                            closeEmojiBoard(setAnchor, false, true);
                          }}
                          onClick={
                            ((evt) => {
                              if (Date.now() < emojiBoardSkipClickUntilRef.current) {
                                return;
                              }
                              toggleEmojiBoardAnchor(
                                setAnchor,
                                evt.currentTarget.getBoundingClientRect()
                              );
                            }) as MouseEventHandler<HTMLButtonElement>
                          }
                          variant="SurfaceVariant"
                          size="300"
                          radii="300"
                        >
                          <Icon size="400" src={Icons.Smile} filled={anchor !== undefined} />
                        </IconButton>
                      </PopOut>
                    )}
                  </UseStateProvider>
                </Box>
              </Box>
              {toolbar && (
                <div>
                  <Line variant="SurfaceVariant" size="300" />
                  <Toolbar />
                </div>
              )}
            </>
          }
        />
      </div>
    );
  }
);

export const MessageEditor = as<'div', MessageEditorProps>(
  ({ room, roomId, mEvent, imagePackRooms, onCancel, ...props }, ref) => {
    if (mEvent.getContent().msgtype === MsgType.Image) {
      return (
        <ImageMessageEditor
          {...props}
          ref={ref}
          room={room}
          roomId={roomId}
          mEvent={mEvent}
          onCancel={onCancel}
        />
      );
    }

    return (
      <TextMessageEditor
        {...props}
        ref={ref}
        room={room}
        roomId={roomId}
        mEvent={mEvent}
        imagePackRooms={imagePackRooms}
        onCancel={onCancel}
      />
    );
  }
);
