import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { MsgType, Room } from 'matrix-js-sdk';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { createPortal } from 'react-dom';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useClientConfig } from '../../hooks/useClientConfig';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { bytesToSize } from '../../utils/common';
import { getFileNameExt, getOfficeDocumentKind, mimeTypeToExt } from '../../utils/mimeTypes';
import { buildOfficeFileUpdateMessage, OfficeFileMessageContent } from '../../utils/officeFile';
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
const OFFICE_BRIDGE_READY = 'xinghuo-office-ready';
const OFFICE_BRIDGE_OPEN = 'xinghuo-office-open';
const OFFICE_BRIDGE_OPENED = 'xinghuo-office-opened';
const OFFICE_BRIDGE_DIRTY = 'xinghuo-office-dirty';
const OFFICE_BRIDGE_SAVE = 'xinghuo-office-save';
const OFFICE_BRIDGE_SAVING = 'xinghuo-office-saving';
const OFFICE_BRIDGE_SAVED = 'xinghuo-office-saved';
const OFFICE_BRIDGE_ERROR = 'xinghuo-office-error';
const OFFICE_BRIDGE_CANCEL_SAVE = 'xinghuo-office-cancel-save';
const DEFAULT_EXPORT_TIMEOUT_SECONDS = 45;
const DEFAULT_PREPARE_TIMEOUT_SECONDS = 60;
const DEFAULT_UPLOAD_TIMEOUT_SECONDS = 120;

type EditorMode = 'preview' | 'edit';
type EditorPhase = 'loading' | 'ready' | 'saving' | 'uploading' | 'publishing' | 'saved' | 'error';
type BridgeSaveProtocol = 'unknown' | 'legacy' | 'save-id';

type EditorSession = {
  mode: EditorMode;
  requestId: string;
  src: string;
};

type OfficeBridgeMessage = {
  type?: string;
  requestId?: string;
  saveId?: string;
  dirty?: boolean;
  buffer?: ArrayBuffer;
  fileName?: string;
  mimeType?: string;
  message?: string;
};

type MatrixUploadPromise = ReturnType<ReturnType<typeof useMatrixClient>['uploadContent']>;

type SaveOperation = {
  id: string;
  requestId: string;
  closeAfterSave: boolean;
  stage: 'exporting' | 'uploading' | 'publishing';
  detached: boolean;
  timeoutId?: number;
  uploadPromise?: MatrixUploadPromise;
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

const getTimeoutMs = (seconds: number | undefined, fallbackSeconds: number): number => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return fallbackSeconds * 1000;
  return Math.min(Math.max(seconds, 5), 600) * 1000;
};

const isSaveShortcut = (event: globalThis.KeyboardEvent): boolean =>
  (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's';

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
  if (phase === 'publishing') return '正在发布文件更新…';
  if (phase === 'saved') return '最新文件已发布';
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
  const saveOperationRef = useRef<SaveOperation>();
  const lastSettledSaveIdRef = useRef<string>();
  const dirtyRef = useRef(false);
  const bridgeSaveProtocolRef = useRef<BridgeSaveProtocol>('unknown');
  const legacyExportInvalidatedRef = useRef(false);
  const mountedRef = useRef(true);

  const [session, setSession] = useState<EditorSession>();
  const [phase, setPhase] = useState<EditorPhase>('loading');
  const [dirty, setDirty] = useState(false);
  const [showClosePrompt, setShowClosePrompt] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [legacyRetryBlocked, setLegacyRetryBlocked] = useState(false);
  const [backgroundPublishing, setBackgroundPublishing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  const officeKind = getOfficeDocumentKind(body, mimeType);
  const officeEditorUrl = clientConfig.officeEditor?.url?.trim() || DEFAULT_OFFICE_EDITOR_URL;
  const exportTimeoutMs = getTimeoutMs(
    clientConfig.officeEditor?.exportTimeoutSeconds,
    DEFAULT_EXPORT_TIMEOUT_SECONDS
  );
  const uploadTimeoutMs = getTimeoutMs(
    clientConfig.officeEditor?.uploadTimeoutSeconds,
    DEFAULT_UPLOAD_TIMEOUT_SECONDS
  );
  const prepareTimeoutMs = getTimeoutMs(
    clientConfig.officeEditor?.prepareTimeoutSeconds,
    DEFAULT_PREPARE_TIMEOUT_SECONDS
  );
  const canEdit = Boolean(room && eventId?.startsWith('$'));

  const loadSourceFile = useCallback(async (): Promise<Blob> => {
    const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
    if (!mediaUrl) throw new Error('Invalid media URL');

    return encInfo
      ? downloadEncryptedMedia(mediaUrl, (buffer) => decryptFile(buffer, mimeType, encInfo))
      : downloadMedia(mediaUrl);
  }, [encInfo, mimeType, mx, url, useAuthentication]);

  const postToOffice = useCallback((message: Record<string, unknown>) => {
    const activeSession = sessionRef.current;
    const targetWindow = iframeRef.current?.contentWindow;
    if (!activeSession || !targetWindow) return;

    targetWindow.postMessage(
      { ...message, requestId: activeSession.requestId },
      new URL(activeSession.src).origin
    );
  }, []);

  const acceptBridgeSaveMessage = useCallback(
    (operation: SaveOperation, messageSaveId?: string): boolean => {
      if (messageSaveId) {
        bridgeSaveProtocolRef.current = 'save-id';
        return messageSaveId === operation.id;
      }
      if (bridgeSaveProtocolRef.current === 'save-id') return false;
      bridgeSaveProtocolRef.current = 'legacy';
      return !legacyExportInvalidatedRef.current;
    },
    []
  );

  const cancelSaveOperation = useCallback(
    (notifyOffice = true): SaveOperation | undefined => {
      const operation = saveOperationRef.current;
      if (!operation) return undefined;

      // Matrix room events cannot be cancelled once sendMessage has started. Keep this
      // operation single-flight and only detach its UI.
      if (operation.stage === 'publishing') {
        operation.detached = true;
        return operation;
      }

      if (operation.timeoutId !== undefined) {
        window.clearTimeout(operation.timeoutId);
        operation.timeoutId = undefined;
      }
      if (operation.uploadPromise) {
        try {
          mx.cancelUpload(operation.uploadPromise);
        } catch {
          // The SDK may have already completed or removed this upload.
        }
        operation.uploadPromise = undefined;
      }
      if (notifyOffice) {
        postToOffice({ type: OFFICE_BRIDGE_CANCEL_SAVE, saveId: operation.id });
      }
      lastSettledSaveIdRef.current = operation.id;
      saveOperationRef.current = undefined;
      return operation;
    },
    [mx, postToOffice]
  );

  const settleSaveOperation = useCallback((operation: SaveOperation): boolean => {
    const activeOperation = saveOperationRef.current;
    if (!activeOperation || activeOperation.id !== operation.id) return false;
    if (activeOperation.timeoutId !== undefined) {
      window.clearTimeout(activeOperation.timeoutId);
      activeOperation.timeoutId = undefined;
    }
    activeOperation.uploadPromise = undefined;
    lastSettledSaveIdRef.current = activeOperation.id;
    saveOperationRef.current = undefined;
    return true;
  }, []);

  const closeModal = useCallback(() => {
    const operation = saveOperationRef.current;
    const publishing = operation?.stage === 'publishing';
    if (publishing && operation) {
      operation.detached = true;
    } else {
      cancelSaveOperation();
    }
    sessionRef.current = undefined;
    sourceBufferRef.current = undefined;
    iframeReadyRef.current = false;
    bridgeSaveProtocolRef.current = 'unknown';
    legacyExportInvalidatedRef.current = false;
    setSession(undefined);
    dirtyRef.current = false;
    setDirty(false);
    setShowClosePrompt(false);
    setErrorMessage(undefined);
    setLegacyRetryBlocked(false);
    setBackgroundPublishing(publishing);
    setPhase('loading');
  }, [cancelSaveOperation]);

  const failSaveOperation = useCallback(
    (saveId: string, message: string) => {
      const operation = saveOperationRef.current;
      if (!operation || operation.id !== saveId || operation.stage === 'publishing') return;

      let failureMessage = message;
      if (operation.stage === 'exporting' && bridgeSaveProtocolRef.current !== 'save-id') {
        legacyExportInvalidatedRef.current = true;
        setLegacyRetryBlocked(true);
        failureMessage = '本次导出结果无法安全确认，已停止保存。请关闭 Office 窗口后重新打开再试。';
      }
      cancelSaveOperation();
      if (!mountedRef.current || operation.detached) return;
      dirtyRef.current = true;
      setDirty(true);
      setShowClosePrompt(false);
      setErrorMessage(failureMessage);
      setPhase('error');
    },
    [cancelSaveOperation]
  );

  const armSaveTimeout = useCallback(
    (operation: SaveOperation, timeoutMs: number, message: string) => {
      const activeOperation = operation;
      if (activeOperation.timeoutId !== undefined) {
        window.clearTimeout(activeOperation.timeoutId);
      }
      activeOperation.timeoutId = window.setTimeout(() => {
        failSaveOperation(activeOperation.id, message);
      }, timeoutMs);
    },
    [failSaveOperation]
  );

  const beginSaveOperation = useCallback(
    (
      closeAfterSave: boolean,
      notifyOffice: boolean,
      requestedSaveId?: string
    ): SaveOperation | undefined => {
      const activeSession = sessionRef.current;
      if (saveOperationRef.current) return saveOperationRef.current;
      if (!activeSession || activeSession.mode !== 'edit') return undefined;
      if (requestedSaveId && requestedSaveId === lastSettledSaveIdRef.current) return undefined;
      if (legacyExportInvalidatedRef.current) {
        setLegacyRetryBlocked(true);
        setErrorMessage('请关闭 Office 窗口后重新打开，再重新保存。');
        setPhase('error');
        return undefined;
      }

      const operation: SaveOperation = {
        id: requestedSaveId || makeRequestId(),
        requestId: activeSession.requestId,
        closeAfterSave,
        stage: 'exporting',
        detached: false,
      };
      saveOperationRef.current = operation;
      setShowClosePrompt(false);
      setErrorMessage(undefined);
      setLegacyRetryBlocked(false);
      setBackgroundPublishing(false);
      setPhase('saving');
      armSaveTimeout(
        operation,
        exportTimeoutMs,
        '保存超时：Office 未能生成最新文件。你可以重试或关闭窗口。'
      );
      if (notifyOffice) {
        postToOffice({ type: OFFICE_BRIDGE_SAVE, saveId: operation.id });
      }
      return operation;
    },
    [armSaveTimeout, exportTimeoutMs, postToOffice]
  );

  const requestSave = useCallback(
    (closeAfterSave = false) => {
      beginSaveOperation(closeAfterSave, true);
    },
    [beginSaveOperation]
  );

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
      if (saveOperationRef.current?.stage === 'publishing') return;

      const requestId = makeRequestId();
      const nextSession: EditorSession = {
        mode,
        requestId,
        src: getEditorUrl(officeEditorUrl, requestId, mode, body, mimeType),
      };
      cancelSaveOperation();
      sessionRef.current = nextSession;
      sourceBufferRef.current = undefined;
      iframeReadyRef.current = false;
      bridgeSaveProtocolRef.current = 'unknown';
      legacyExportInvalidatedRef.current = false;
      setSession(nextSession);
      setPhase('loading');
      dirtyRef.current = false;
      setDirty(false);
      setShowClosePrompt(false);
      setErrorMessage(undefined);
      setLegacyRetryBlocked(false);
      setBackgroundPublishing(false);

      loadSourceFile()
        .then((file) => file.arrayBuffer())
        .then((buffer) => {
          if (sessionRef.current?.requestId !== requestId) return;
          sourceBufferRef.current = buffer;
          transferSourceIfReady();
        })
        .catch(() => {
          if (sessionRef.current?.requestId === requestId) {
            setErrorMessage('文档加载失败，请检查网络后关闭窗口并重试。');
            setPhase('error');
          }
        });
    },
    [
      body,
      canEdit,
      cancelSaveOperation,
      loadSourceFile,
      mimeType,
      officeEditorUrl,
      officeKind,
      transferSourceIfReady,
    ]
  );

  const replaceOriginalFile = useCallback(
    async (buffer: ArrayBuffer, replacementMimeType: string | undefined, saveId: string) => {
      if (!room || !eventId) throw new Error('Missing Matrix event');
      if (saveOperationRef.current?.id !== saveId) throw new Error('Office save cancelled');

      const outputMimeType =
        replacementMimeType && replacementMimeType !== 'application/octet-stream'
          ? replacementMimeType
          : mimeType || 'application/octet-stream';
      const replacementFile = new File([buffer], body, { type: outputMimeType });
      const uploadItem = room.hasEncryptionStateEvent()
        ? await encryptFile(replacementFile)
        : { file: replacementFile, encInfo: undefined };
      const preparedOperation = saveOperationRef.current;
      if (!preparedOperation || preparedOperation.id !== saveId) {
        throw new Error('Office save cancelled');
      }
      if (preparedOperation.timeoutId !== undefined) {
        window.clearTimeout(preparedOperation.timeoutId);
        preparedOperation.timeoutId = undefined;
      }

      const uploadPromise = mx.uploadContent(uploadItem.file, {
        includeFilename: !uploadItem.encInfo,
        name: body,
        type: outputMimeType,
      });
      const activeOperation = saveOperationRef.current;
      if (!activeOperation || activeOperation.id !== saveId) {
        try {
          mx.cancelUpload(uploadPromise);
        } catch {
          // The upload can disappear from the SDK queue while cancellation is requested.
        }
        throw new Error('Office save cancelled');
      }
      activeOperation.uploadPromise = uploadPromise;
      armSaveTimeout(
        activeOperation,
        uploadTimeoutMs,
        '上传超时：聊天服务器未完成媒体上传。你可以重试或关闭窗口。'
      );
      const upload = await uploadPromise;
      const publishingOperation = saveOperationRef.current;
      if (!publishingOperation || publishingOperation.id !== saveId) {
        throw new Error('Office save cancelled');
      }
      if (publishingOperation.timeoutId !== undefined) {
        window.clearTimeout(publishingOperation.timeoutId);
        publishingOperation.timeoutId = undefined;
      }
      publishingOperation.uploadPromise = undefined;
      const replacementMxc = upload.content_uri;
      if (!replacementMxc) throw new Error('Missing MXC URI');

      const latestContent: OfficeFileMessageContent = {
        msgtype: MsgType.File,
        body,
        filename: body,
        info: {
          mimetype: outputMimeType,
          size: replacementFile.size,
        },
      };

      if (uploadItem.encInfo) {
        latestContent.file = { ...uploadItem.encInfo, url: replacementMxc };
      } else {
        latestContent.url = replacementMxc;
      }

      const { content } = buildOfficeFileUpdateMessage({
        sourceEventId: eventId,
        sourceSenderId: room.findEventById(eventId)?.getSender(),
        currentUserId: mx.getSafeUserId(),
        latestContent,
      });
      if (saveOperationRef.current?.id !== saveId) throw new Error('Office save cancelled');
      publishingOperation.stage = 'publishing';
      if (
        mountedRef.current &&
        !publishingOperation.detached &&
        sessionRef.current?.requestId === publishingOperation.requestId
      ) {
        setPhase('publishing');
      }
      await mx.sendMessage(room.roomId, content as never);
    },
    [armSaveTimeout, body, eventId, mimeType, mx, room, uploadTimeoutMs]
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
        if (!saveOperationRef.current) {
          setErrorMessage(undefined);
          setPhase('ready');
        }
        return;
      }
      if (event.data.type === OFFICE_BRIDGE_DIRTY && event.data.dirty === true) {
        dirtyRef.current = true;
        setDirty(true);
        if (!saveOperationRef.current) {
          setErrorMessage(undefined);
          setPhase('ready');
        }
        return;
      }
      if (event.data.type === OFFICE_BRIDGE_SAVING) {
        const operation = saveOperationRef.current;
        if (operation) {
          if (!acceptBridgeSaveMessage(operation, event.data.saveId)) return;
          if (operation.stage === 'exporting') setPhase('saving');
          return;
        }

        // The bridge can initiate this path for an Office-internal Ctrl/Cmd+S.
        if (!dirtyRef.current) return;
        if (event.data.saveId) {
          bridgeSaveProtocolRef.current = 'save-id';
        } else {
          if (bridgeSaveProtocolRef.current === 'save-id' || legacyExportInvalidatedRef.current) {
            return;
          }
          bridgeSaveProtocolRef.current = 'legacy';
        }
        beginSaveOperation(false, false, event.data.saveId);
        return;
      }
      if (event.data.type === OFFICE_BRIDGE_ERROR) {
        const operation = saveOperationRef.current;
        if (operation) {
          if (!acceptBridgeSaveMessage(operation, event.data.saveId)) return;
          failSaveOperation(
            operation.id,
            'Office 无法生成最新文件。请重试；如果问题持续，可以直接关闭窗口。'
          );
          return;
        }
        if (event.data.saveId) return;
        if (legacyExportInvalidatedRef.current) return;
        setErrorMessage('Office 无法打开文档。请检查网络后关闭窗口并重试。');
        setPhase('error');
        return;
      }
      if (event.data.type === OFFICE_BRIDGE_SAVED) {
        const operation = saveOperationRef.current;
        if (!operation || operation.stage !== 'exporting') return;
        if (!acceptBridgeSaveMessage(operation, event.data.saveId)) return;
        if (!(event.data.buffer instanceof ArrayBuffer) || event.data.buffer.byteLength === 0) {
          failSaveOperation(operation.id, 'Office 返回的文件为空或无效，请重试。');
          return;
        }

        if (operation.timeoutId !== undefined) {
          window.clearTimeout(operation.timeoutId);
          operation.timeoutId = undefined;
        }
        operation.stage = 'uploading';
        setPhase('uploading');
        armSaveTimeout(
          operation,
          prepareTimeoutMs,
          '文件准备超时：未能完成加密或文件处理。你可以重试或关闭窗口。'
        );
        replaceOriginalFile(event.data.buffer, event.data.mimeType, operation.id)
          .then(() => {
            const activeOperation = saveOperationRef.current;
            if (!activeOperation || activeOperation.id !== operation.id) return;

            const shouldClose = activeOperation.closeAfterSave;
            const { detached } = activeOperation;
            if (!settleSaveOperation(activeOperation)) return;
            if (mountedRef.current) setBackgroundPublishing(false);
            if (!mountedRef.current || detached) return;
            dirtyRef.current = false;
            setDirty(false);
            setErrorMessage(undefined);
            setPhase('saved');
            if (shouldClose) closeModal();
          })
          .catch(() => {
            const activeOperation = saveOperationRef.current;
            if (!activeOperation || activeOperation.id !== operation.id) return;
            if (activeOperation.stage === 'publishing') {
              const { detached } = activeOperation;
              settleSaveOperation(activeOperation);
              if (mountedRef.current) setBackgroundPublishing(false);
              if (!mountedRef.current || detached) return;
              dirtyRef.current = true;
              setDirty(true);
              setShowClosePrompt(false);
              setErrorMessage('文件已上传，但发布更新失败。请检查网络后重试。');
              setPhase('error');
              return;
            }
            failSaveOperation(
              operation.id,
              '保存失败：最新文件未能上传到聊天服务器。请检查网络后重试。'
            );
          });
      }
    };

    window.addEventListener('message', handleOfficeMessage);
    return () => window.removeEventListener('message', handleOfficeMessage);
  }, [
    acceptBridgeSaveMessage,
    armSaveTimeout,
    beginSaveOperation,
    closeModal,
    failSaveOperation,
    prepareTimeoutMs,
    replaceOriginalFile,
    settleSaveOperation,
    transferSourceIfReady,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const operation = saveOperationRef.current;
      if (operation?.stage === 'publishing') {
        operation.detached = true;
      } else {
        cancelSaveOperation();
      }
      sessionRef.current = undefined;
      sourceBufferRef.current = undefined;
      iframeReadyRef.current = false;
    };
  }, [cancelSaveOperation]);

  useEffect(() => {
    if (!backgroundPublishing && (!session || !dirty)) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      const unloadEvent = event;
      unloadEvent.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [backgroundPublishing, dirty, session]);

  useEffect(() => {
    if (!session || session.mode !== 'edit') return undefined;

    const handleSaveShortcut = (event: globalThis.KeyboardEvent) => {
      if (!isSaveShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (dirty) requestSave(false);
    };

    window.addEventListener('keydown', handleSaveShortcut, true);

    // This additionally covers a future same-origin Office deployment. The current cross-origin
    // bridge must intercept the shortcut in its own inner editor and emit BRIDGE_SAVING/SAVED.
    const iframe = iframeRef.current;
    let frameDocument: Document | undefined;
    const bindFrameShortcut = () => {
      if (frameDocument) frameDocument.removeEventListener('keydown', handleSaveShortcut, true);
      frameDocument = undefined;
      try {
        frameDocument = iframe?.contentDocument || undefined;
        frameDocument?.addEventListener('keydown', handleSaveShortcut, true);
      } catch {
        // Cross-origin frames are intentionally handled by the postMessage bridge.
      }
    };
    bindFrameShortcut();
    iframe?.addEventListener('load', bindFrameShortcut);

    return () => {
      window.removeEventListener('keydown', handleSaveShortcut, true);
      iframe?.removeEventListener('load', bindFrameShortcut);
      frameDocument?.removeEventListener('keydown', handleSaveShortcut, true);
    };
  }, [dirty, requestSave, session]);

  const requestClose = useCallback(() => {
    if (saveOperationRef.current || phase === 'saving' || phase === 'uploading') {
      closeModal();
      return;
    }
    if (legacyRetryBlocked) {
      closeModal();
      return;
    }
    if (session?.mode === 'edit' && dirty) {
      setShowClosePrompt(true);
      return;
    }
    closeModal();
  }, [closeModal, dirty, legacyRetryBlocked, phase, session]);

  const handleModalKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      requestClose();
    }
  };

  const handleDownload = useCallback(async () => {
    if (downloading || backgroundPublishing) return;
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
  }, [backgroundPublishing, body, downloading, loadSourceFile]);

  if (!officeKind) return null;

  const iconMeta = OFFICE_ICON_META[officeKind];
  const extLabel = (getFileNameExt(body) || mimeTypeToExt(mimeType)).toUpperCase();
  const sizeLabel = typeof infoSize === 'number' ? bytesToSize(infoSize) : undefined;
  const publishing = phase === 'publishing';
  const busy = phase === 'saving' || phase === 'uploading' || publishing;
  let editActionTitle = '在线编辑并保存到原消息';
  if (backgroundPublishing) editActionTitle = '最新版本正在发布，请稍候';
  else if (!canEdit) editActionTitle = '当前消息无法编辑';
  let downloadActionTitle = downloadError ? '下载失败，点击重试' : '下载文件';
  if (backgroundPublishing) downloadActionTitle = '最新版本正在发布，请稍候';
  let closeButtonLabel = '关闭 Office 文档';
  if (publishing) closeButtonLabel = '关闭 Office 文档，文件将在后台继续发布';
  else if (busy) closeButtonLabel = '取消保存并关闭 Office 文档';

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
          <button
            className={css.actionButton}
            type="button"
            onClick={() => openEditor('preview')}
            disabled={backgroundPublishing}
            title={backgroundPublishing ? '最新版本正在发布，请稍候' : '在线预览'}
          >
            <span className={css.actionLabel}>在线预览</span>
          </button>
          <button
            className={css.actionButton}
            type="button"
            onClick={() => openEditor('edit')}
            disabled={!canEdit || backgroundPublishing}
            title={editActionTitle}
          >
            <span className={css.actionLabel}>{backgroundPublishing ? '发布中…' : '在线编辑'}</span>
          </button>
          <button
            className={css.actionButton}
            type="button"
            onClick={() => {
              handleDownload();
            }}
            disabled={downloading || backgroundPublishing}
            title={downloadActionTitle}
          >
            <span className={css.actionLabel}>{downloading ? <Spinner size="100" /> : '下载'}</span>
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
                          disabled={!dirty || phase !== 'ready' || legacyRetryBlocked}
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
                        aria-label={closeButtonLabel}
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
                      <div className={css.errorLayer} role="alert">
                        <Icon src={Icons.Warning} size="300" />
                        <Text size="T300" align="Center">
                          {errorMessage || '文档打开或保存失败，请检查网络后重试。'}
                        </Text>
                        <Box gap="200" justifyContent="Center" wrap="Wrap">
                          {session.mode === 'edit' && dirty && !legacyRetryBlocked && (
                            <Button
                              variant="Primary"
                              fill="Solid"
                              size="300"
                              radii="300"
                              onClick={() => requestSave(false)}
                            >
                              <Text size="B300">重试保存</Text>
                            </Button>
                          )}
                          <Button
                            variant="Secondary"
                            fill="Soft"
                            size="300"
                            radii="300"
                            onClick={closeModal}
                          >
                            <Text size="B300">关闭</Text>
                          </Button>
                        </Box>
                      </div>
                    )}
                    {busy && (
                      <div className={css.saveStatus} role="status" aria-live="polite">
                        <Box alignItems="Center" gap="200" grow="Yes">
                          <Spinner size="100" />
                          <Text size="T300">{getPhaseLabel(phase, session.mode)}</Text>
                        </Box>
                        <Button
                          variant={publishing ? 'Secondary' : 'Critical'}
                          fill="Soft"
                          size="300"
                          radii="300"
                          onClick={closeModal}
                        >
                          <Text size="B300">
                            {publishing ? '关闭窗口（继续发布）' : '取消并关闭'}
                          </Text>
                        </Button>
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
