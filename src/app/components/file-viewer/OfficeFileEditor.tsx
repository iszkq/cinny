import React, { KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Icon,
  IconButton,
  Icons,
  Modal,
  Overlay,
  OverlayBackdrop,
  Spinner,
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { MsgType, RelationType, Room } from 'matrix-js-sdk';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { createPortal } from 'react-dom';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useClientConfig } from '../../hooks/useClientConfig';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { bytesToSize } from '../../utils/common';
import { getFileNameExt, getOfficeDocumentKind, mimeTypeToExt } from '../../utils/mimeTypes';
import {
  decryptFile,
  downloadEncryptedMedia,
  downloadMedia,
  encryptFile,
  mxcUrlToHttp,
} from '../../utils/matrix';
import { saveDownloadedFile } from '../../utils/saveDownloadedFile';
import * as css from './OfficeFileEditor.css';

const DEFAULT_OFFICE_EDITOR_URL = 'https://office.221819.best/editor';
const OFFICE_UPDATE_PROPERTY = 'com.xinghuo.office_update';
const OFFICE_BRIDGE_READY = 'xinghuo-office-ready';
const OFFICE_BRIDGE_OPEN = 'xinghuo-office-open';
const OFFICE_BRIDGE_OPENED = 'xinghuo-office-opened';
const OFFICE_BRIDGE_DIRTY = 'xinghuo-office-dirty';
const OFFICE_BRIDGE_SAVE = 'xinghuo-office-save';
const OFFICE_BRIDGE_SAVING = 'xinghuo-office-saving';
const OFFICE_BRIDGE_SAVED = 'xinghuo-office-saved';
const OFFICE_BRIDGE_ERROR = 'xinghuo-office-error';

type EditorMode = 'preview' | 'edit';
type EditorPhase = 'loading' | 'ready' | 'saving' | 'uploading' | 'saved' | 'error';

type EditorSession = {
  mode: EditorMode;
  requestId: string;
  src: string;
};

type OfficeBridgeMessage = {
  type?: string;
  requestId?: string;
  dirty?: boolean;
  buffer?: ArrayBuffer;
  fileName?: string;
  mimeType?: string;
  message?: string;
};

export type OfficeFileEditorProps = {
  body: string;
  mimeType: string;
  url: string;
  encInfo?: EncryptedAttachmentInfo;
  infoSize?: number;
  room?: Room;
  eventId?: string;
};

const OFFICE_ICON_META = {
  word: { label: 'W', color: '#2563eb' },
  spreadsheet: { label: 'X', color: '#168454' },
  presentation: { label: 'P', color: '#e05236' },
} as const;

const makeRequestId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const getEditorUrl = (
  editorUrl: string,
  requestId: string,
  mode: EditorMode,
  fileName: string,
  mimeType: string
): string => {
  const target = new URL(editorUrl);
  target.searchParams.set('embed', '1');
  target.searchParams.set('parentOrigin', window.location.origin);
  target.searchParams.set('requestId', requestId);
  target.searchParams.set('fileName', fileName);
  target.searchParams.set('fileType', getFileNameExt(fileName));
  target.searchParams.set('mimeType', mimeType);
  target.searchParams.set('editing', mode === 'edit' ? '1' : '0');
  target.searchParams.set('lang', 'zh-CN');
  return target.toString();
};

const getPhaseLabel = (phase: EditorPhase, mode: EditorMode): string => {
  if (phase === 'loading') return '正在准备文档…';
  if (phase === 'saving') return '正在生成最新文件…';
  if (phase === 'uploading') return '正在更新原文件…';
  if (phase === 'saved') return '已保存到原消息';
  if (phase === 'error') return '操作失败，请重试';
  return mode === 'preview' ? '只读预览' : '编辑就绪';
};

export function OfficeFileEditor({
  body,
  mimeType,
  url,
  encInfo,
  infoSize,
  room,
  eventId,
}: OfficeFileEditorProps) {
  const mx = useMatrixClient();
  const clientConfig = useClientConfig();
  const useAuthentication = useMediaAuthentication();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sessionRef = useRef<EditorSession>();
  const sourceBufferRef = useRef<ArrayBuffer>();
  const iframeReadyRef = useRef(false);
  const closeAfterSaveRef = useRef(false);
  const uploadingRef = useRef(false);

  const [session, setSession] = useState<EditorSession>();
  const [phase, setPhase] = useState<EditorPhase>('loading');
  const [dirty, setDirty] = useState(false);
  const [showClosePrompt, setShowClosePrompt] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  const officeKind = getOfficeDocumentKind(body, mimeType);
  const officeEditorUrl = clientConfig.officeEditor?.url?.trim() || DEFAULT_OFFICE_EDITOR_URL;
  const canEdit = Boolean(room && eventId?.startsWith('$'));

  const loadSourceFile = useCallback(async (): Promise<Blob> => {
    const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
    if (!mediaUrl) throw new Error('Invalid media URL');

    return encInfo
      ? downloadEncryptedMedia(mediaUrl, (buffer) => decryptFile(buffer, mimeType, encInfo))
      : downloadMedia(mediaUrl);
  }, [encInfo, mimeType, mx, url, useAuthentication]);

  const closeModal = useCallback(() => {
    sessionRef.current = undefined;
    sourceBufferRef.current = undefined;
    iframeReadyRef.current = false;
    closeAfterSaveRef.current = false;
    uploadingRef.current = false;
    setSession(undefined);
    setDirty(false);
    setShowClosePrompt(false);
    setPhase('loading');
  }, []);

  const postToOffice = useCallback((message: Record<string, unknown>) => {
    const activeSession = sessionRef.current;
    const targetWindow = iframeRef.current?.contentWindow;
    if (!activeSession || !targetWindow) return;

    targetWindow.postMessage(
      { ...message, requestId: activeSession.requestId },
      new URL(activeSession.src).origin
    );
  }, []);

  const transferSourceIfReady = useCallback(() => {
    const activeSession = sessionRef.current;
    const targetWindow = iframeRef.current?.contentWindow;
    const buffer = sourceBufferRef.current;
    if (!activeSession || !targetWindow || !iframeReadyRef.current || !buffer) return;

    targetWindow.postMessage(
      {
        type: OFFICE_BRIDGE_OPEN,
        requestId: activeSession.requestId,
        fileName: body,
        fileType: getFileNameExt(body),
        mimeType,
        buffer,
      },
      new URL(activeSession.src).origin,
      [buffer]
    );
    sourceBufferRef.current = undefined;
  }, [body, mimeType]);

  const openEditor = useCallback(
    (mode: EditorMode) => {
      if (!officeKind || (mode === 'edit' && !canEdit)) return;

      const requestId = makeRequestId();
      const nextSession: EditorSession = {
        mode,
        requestId,
        src: getEditorUrl(officeEditorUrl, requestId, mode, body, mimeType),
      };
      sessionRef.current = nextSession;
      sourceBufferRef.current = undefined;
      iframeReadyRef.current = false;
      closeAfterSaveRef.current = false;
      uploadingRef.current = false;
      setSession(nextSession);
      setPhase('loading');
      setDirty(false);
      setShowClosePrompt(false);

      void loadSourceFile()
        .then((file) => file.arrayBuffer())
        .then((buffer) => {
          if (sessionRef.current?.requestId !== requestId) return;
          sourceBufferRef.current = buffer;
          transferSourceIfReady();
        })
        .catch(() => {
          if (sessionRef.current?.requestId === requestId) setPhase('error');
        });
    },
    [body, canEdit, loadSourceFile, mimeType, officeEditorUrl, officeKind, transferSourceIfReady]
  );

  const replaceOriginalFile = useCallback(
    async (buffer: ArrayBuffer, replacementMimeType?: string) => {
      if (!room || !eventId) throw new Error('Missing Matrix event');

      const outputMimeType =
        replacementMimeType && replacementMimeType !== 'application/octet-stream'
          ? replacementMimeType
          : mimeType || 'application/octet-stream';
      const replacementFile = new File([buffer], body, { type: outputMimeType });
      const uploadItem = room.hasEncryptionStateEvent()
        ? await encryptFile(replacementFile)
        : { file: replacementFile, encInfo: undefined };
      const upload = await mx.uploadContent(uploadItem.file, {
        includeFilename: !uploadItem.encInfo,
        name: body,
        type: outputMimeType,
      });
      const replacementMxc = upload.content_uri;
      if (!replacementMxc) throw new Error('Missing MXC URI');

      const newContent: Record<string, unknown> = {
        msgtype: MsgType.File,
        body,
        filename: body,
        info: {
          mimetype: outputMimeType,
          size: replacementFile.size,
        },
        [OFFICE_UPDATE_PROPERTY]: {
          source_event_id: eventId,
          updated_at: Date.now(),
        },
      };

      if (uploadItem.encInfo) {
        newContent.file = { ...uploadItem.encInfo, url: replacementMxc };
      } else {
        newContent.url = replacementMxc;
      }

      await mx.sendMessage(room.roomId, {
        ...newContent,
        body: `* ${body}`,
        'm.new_content': newContent,
        'm.relates_to': {
          event_id: eventId,
          rel_type: RelationType.Replace,
        },
        [OFFICE_UPDATE_PROPERTY]: true,
      } as never);
    },
    [body, eventId, mimeType, mx, room]
  );

  useEffect(() => {
    const handleOfficeMessage = (event: MessageEvent<OfficeBridgeMessage>) => {
      const activeSession = sessionRef.current;
      const targetWindow = iframeRef.current?.contentWindow;
      if (!activeSession || event.source !== targetWindow) return;
      if (event.origin !== new URL(activeSession.src).origin) return;
      if (event.data?.requestId !== activeSession.requestId) return;

      if (event.data.type === OFFICE_BRIDGE_READY) {
        iframeReadyRef.current = true;
        transferSourceIfReady();
        return;
      }
      if (event.data.type === OFFICE_BRIDGE_OPENED) {
        setPhase('ready');
        return;
      }
      if (event.data.type === OFFICE_BRIDGE_DIRTY && event.data.dirty === true) {
        setDirty(true);
        setPhase('ready');
        return;
      }
      if (event.data.type === OFFICE_BRIDGE_SAVING) {
        setPhase('saving');
        return;
      }
      if (event.data.type === OFFICE_BRIDGE_ERROR) {
        closeAfterSaveRef.current = false;
        setPhase('error');
        return;
      }
      if (
        event.data.type === OFFICE_BRIDGE_SAVED &&
        event.data.buffer instanceof ArrayBuffer &&
        !uploadingRef.current
      ) {
        uploadingRef.current = true;
        setPhase('uploading');
        void replaceOriginalFile(event.data.buffer, event.data.mimeType)
          .then(() => {
            uploadingRef.current = false;
            setDirty(false);
            setPhase('saved');
            if (closeAfterSaveRef.current) closeModal();
          })
          .catch(() => {
            uploadingRef.current = false;
            closeAfterSaveRef.current = false;
            setDirty(true);
            setPhase('error');
          });
      }
    };

    window.addEventListener('message', handleOfficeMessage);
    return () => window.removeEventListener('message', handleOfficeMessage);
  }, [closeModal, replaceOriginalFile, transferSourceIfReady]);

  useEffect(() => {
    if (!session || !dirty) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty, session]);

  const requestSave = useCallback(
    (closeAfterSave = false) => {
      if (!session || session.mode !== 'edit' || phase === 'saving' || phase === 'uploading')
        return;
      closeAfterSaveRef.current = closeAfterSave;
      setShowClosePrompt(false);
      setPhase('saving');
      postToOffice({ type: OFFICE_BRIDGE_SAVE });
    },
    [phase, postToOffice, session]
  );

  const requestClose = useCallback(() => {
    if (phase === 'saving' || phase === 'uploading') return;
    if (session?.mode === 'edit' && dirty) {
      setShowClosePrompt(true);
      return;
    }
    closeModal();
  }, [closeModal, dirty, phase, session]);

  const handleModalKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      requestClose();
    }
  };

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(false);
    try {
      const source = await loadSourceFile();
      await saveDownloadedFile(source, body);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  }, [body, downloading, loadSourceFile]);

  if (!officeKind) return null;

  const iconMeta = OFFICE_ICON_META[officeKind];
  const extLabel = (getFileNameExt(body) || mimeTypeToExt(mimeType)).toUpperCase();
  const sizeLabel = typeof infoSize === 'number' ? bytesToSize(infoSize) : undefined;
  const busy = phase === 'saving' || phase === 'uploading';

  return (
    <>
      <div className={css.card}>
        <div className={css.fileSummary}>
          <div className={css.fileIcon} style={{ backgroundColor: iconMeta.color }} aria-hidden>
            {iconMeta.label}
          </div>
          <div className={css.fileMeta}>
            <Text size="T300" truncate className={css.fileName} title={body}>
              {body}
            </Text>
            <Text size="O400" priority="300">
              {[sizeLabel, extLabel].filter(Boolean).join(' · ')}
            </Text>
          </div>
        </div>
        <div className={css.actions}>
          <button className={css.actionButton} type="button" onClick={() => openEditor('preview')}>
            在线预览
          </button>
          <button
            className={css.actionButton}
            type="button"
            onClick={() => openEditor('edit')}
            disabled={!canEdit}
            title={canEdit ? '在线编辑并保存到原消息' : '当前消息无法编辑'}
          >
            在线编辑
          </button>
          <button
            className={css.actionButton}
            type="button"
            onClick={() => void handleDownload()}
            disabled={downloading}
            title={downloadError ? '下载失败，点击重试' : '下载文件'}
          >
            {downloading ? <Spinner size="100" /> : '下载'}
          </button>
        </div>
      </div>

      {session &&
        typeof document !== 'undefined' &&
        createPortal(
          <Overlay open backdrop={<OverlayBackdrop onClick={requestClose} />}>
            <div className={css.overlayCenter}>
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  escapeDeactivates: false,
                  clickOutsideDeactivates: false,
                }}
              >
                <Modal
                  className={css.editorModal}
                  variant="Background"
                  role="dialog"
                  aria-modal="true"
                  aria-label={`${session.mode === 'edit' ? '在线编辑' : '在线预览'} ${body}`}
                  onKeyDown={handleModalKeyDown}
                  onContextMenu={(event: React.MouseEvent<HTMLElement>) => event.stopPropagation()}
                >
                  <header className={css.editorHeader}>
                    <Box alignItems="Center" gap="200" grow="Yes" style={{ minWidth: 0 }}>
                      <div
                        className={css.headerIcon}
                        style={{ backgroundColor: iconMeta.color }}
                        aria-hidden
                      >
                        {iconMeta.label}
                      </div>
                      <Box direction="Column" grow="Yes" style={{ minWidth: 0 }}>
                        <Text size="B400" truncate title={body}>
                          {body}
                        </Text>
                        <Text size="O400" priority={phase === 'error' ? '300' : '400'} truncate>
                          {getPhaseLabel(phase, session.mode)}
                        </Text>
                      </Box>
                    </Box>
                    <Box alignItems="Center" gap="100" shrink="No">
                      {session.mode === 'edit' && (
                        <Button
                          variant="Primary"
                          fill="Solid"
                          size="300"
                          radii="300"
                          disabled={!dirty || phase !== 'ready'}
                          onClick={() => requestSave(false)}
                          before={busy ? <Spinner size="100" fill="Solid" /> : undefined}
                        >
                          <Text size="B300">保存</Text>
                        </Button>
                      )}
                      <IconButton
                        variant="Surface"
                        size="300"
                        radii="300"
                        onClick={requestClose}
                        disabled={busy}
                        aria-label="关闭 Office 文档"
                      >
                        <Icon src={Icons.Cross} size="100" />
                      </IconButton>
                    </Box>
                  </header>

                  <div className={css.editorBody}>
                    <iframe
                      ref={iframeRef}
                      className={css.editorFrame}
                      src={session.src}
                      title={`${session.mode === 'edit' ? '在线编辑' : '在线预览'} ${body}`}
                      allow="clipboard-read; clipboard-write"
                    />
                    {phase === 'loading' && (
                      <div className={css.loadingLayer}>
                        <Spinner size="400" />
                        <Text size="T300">正在打开 Office 文档…</Text>
                      </div>
                    )}
                    {phase === 'error' && (
                      <div className={css.errorLayer}>
                        <Icon src={Icons.Warning} size="300" />
                        <Text size="T300">文档打开或保存失败，请检查网络后重试。</Text>
                      </div>
                    )}
                    {showClosePrompt && (
                      <div className={css.promptBackdrop}>
                        <div className={css.promptCard} role="alertdialog" aria-modal="true">
                          <Box direction="Column" gap="100">
                            <Text size="H4">保存对文档的修改？</Text>
                            <Text size="T300" priority="300">
                              保存后会直接更新聊天中原位置的文件；不保存则不会产生任何更新。
                            </Text>
                          </Box>
                          <Box gap="100" justifyContent="End" wrap="Wrap">
                            <Button
                              variant="Secondary"
                              fill="Soft"
                              size="300"
                              radii="300"
                              onClick={() => setShowClosePrompt(false)}
                            >
                              <Text size="B300">继续编辑</Text>
                            </Button>
                            <Button
                              variant="Critical"
                              fill="Soft"
                              size="300"
                              radii="300"
                              onClick={closeModal}
                            >
                              <Text size="B300">不保存</Text>
                            </Button>
                            <Button
                              variant="Primary"
                              fill="Solid"
                              size="300"
                              radii="300"
                              onClick={() => requestSave(true)}
                            >
                              <Text size="B300">保存并关闭</Text>
                            </Button>
                          </Box>
                        </div>
                      </div>
                    )}
                  </div>
                </Modal>
              </FocusTrap>
            </div>
          </Overlay>,
          document.body
        )}
    </>
  );
}
