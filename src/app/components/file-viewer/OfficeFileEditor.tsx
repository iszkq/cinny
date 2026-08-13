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
import {
  buildOfficeFileUpdateMessage,
  OfficeFileMessageContent,
  rememberOfficeFileRevision,
} from '../../utils/officeFile';
import {
  decryptFile,
  downloadEncryptedMedia,
  downloadMedia,
  encryptFile,
  mxcUrlToHttp,
} from '../../utils/matrix';
import { saveDownloadedFile } from '../../utils/saveDownloadedFile';
import { decryptOfficeDocument, isOfficeDocumentEncrypted } from '../../plugins/officecrypto';
import { isDesktopUpdaterSupported } from '../../utils/desktopUpdater';
import {
  clearNativeOfficeBinaries,
  closeNativeOfficeWindow,
  consumeNativeOfficeBinary,
  emitNativeOfficeCommand,
  emitNativeOfficePayload,
  listenNativeOfficeAction,
  NativeOfficeBinaryDescriptor,
  NativeOfficeWindowHandle,
  NativeOfficeWindowAction,
  NativeOfficeWindowPayload,
  openNativeOfficeWindow,
  writeNativeOfficeBinary,
} from '../../utils/nativeOfficeWindow';
import * as css from './OfficeFileEditor.css';
import { PasswordInput } from '../password-input';
import { lockOfficeLandscape, unlockOfficeOrientation } from '../../utils/officeOrientation';
import { ANDROID_BACK_BUTTON_EVENT, isAndroidApp } from '../../utils/nativePlatform';
import { NativeClipboard } from '../../utils/nativeClipboard';
import { isIOS, mobileOrTablet } from '../../utils/user-agent';

const DEFAULT_OFFICE_EDITOR_URL = 'https://124.222.193.241:6258/editor';
const OFFICE_BRIDGE_READY = 'xinghuo-office-ready';
const OFFICE_BRIDGE_OPEN = 'xinghuo-office-open';
const OFFICE_BRIDGE_SOURCE_BEGIN = 'xinghuo-office-source-begin';
const OFFICE_BRIDGE_SOURCE_CHUNK = 'xinghuo-office-source-chunk';
const OFFICE_BRIDGE_SOURCE_CHUNK_RECEIVED = 'xinghuo-office-source-chunk-received';
const OFFICE_BRIDGE_SOURCE_END = 'xinghuo-office-source-end';
const OFFICE_BRIDGE_SOURCE_RECEIVED = 'xinghuo-office-source-received';
const OFFICE_BRIDGE_OPENED = 'xinghuo-office-opened';
const OFFICE_BRIDGE_PASSWORD_REQUIRED = 'xinghuo-office-password-required';
const OFFICE_BRIDGE_DIRTY = 'xinghuo-office-dirty';
const OFFICE_BRIDGE_SAVE = 'xinghuo-office-save';
const OFFICE_BRIDGE_SAVING = 'xinghuo-office-saving';
const OFFICE_BRIDGE_SAVED = 'xinghuo-office-saved';
const OFFICE_BRIDGE_ERROR = 'xinghuo-office-error';
const OFFICE_BRIDGE_DIAGNOSTIC = 'xinghuo-office-diagnostic';
const OFFICE_BRIDGE_CANCEL_SAVE = 'xinghuo-office-cancel-save';
const DEFAULT_EXPORT_TIMEOUT_SECONDS = 45;
const DEFAULT_PREPARE_TIMEOUT_SECONDS = 60;
const DEFAULT_UPLOAD_TIMEOUT_SECONDS = 120;
const SOURCE_LOAD_TIMEOUT_MS = 60_000;
const IFRAME_BRIDGE_READY_TIMEOUT_MS = 30_000;
const DOCUMENT_OPENED_TIMEOUT_MS = 45_000;
const MOBILE_IFRAME_BRIDGE_READY_TIMEOUT_MS = 60_000;
const MOBILE_DOCUMENT_OPENED_TIMEOUT_MS = 150_000;
const OFFICE_SHELL_WARMUP_DELAY_MS = 600;
const OFFICE_SHELL_WARMUP_LIFETIME_MS = 15_000;
// Keep each structured-clone payload comfortably below the limits of older
// Android System WebViews. Base64 expands this to roughly 86 KiB per message.
const ANDROID_SOURCE_CHUNK_BYTES = 64 * 1024;
const ANDROID_SOURCE_CHUNK_ACK_TIMEOUT_MS = 8_000;
const ANDROID_SOURCE_CHUNK_MAX_ATTEMPTS = 4;
const MAX_MEMORY_CACHED_SOURCE_BYTES = 64 * 1024 * 1024;
const COMPOUND_FILE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const isPasswordPromptError = (message?: string): boolean =>
  Boolean(message && /password|encrypted|decrypt|密钥|密码/i.test(message));

const isCompoundOfficeContainer = (buffer: ArrayBuffer): boolean => {
  if (buffer.byteLength < COMPOUND_FILE_SIGNATURE.length) return false;
  const bytes = new Uint8Array(buffer, 0, COMPOUND_FILE_SIGNATURE.length);
  return COMPOUND_FILE_SIGNATURE.every((value, index) => bytes[index] === value);
};

/**
 * PDF passwords are not represented by the Compound File signature used by
 * encrypted Office documents. On mobile, preflight the PDF with PDF.js only
 * to discover whether a password is required; the actual document is still
 * opened and rendered by the configured Office service.
 */
type PdfPasswordState =
  | 'not-encrypted'
  | 'password-required'
  | 'password-invalid'
  | 'validation-timeout'
  | 'ready';

const PDF_PASSWORD_VALIDATION_TIMEOUT_MS = 15_000;

const inspectPdfPassword = async (
  buffer: ArrayBuffer,
  password?: string
): Promise<PdfPasswordState> => {
  // Keep ordinary PDFs on the exact pre-existing Office path. The marker is
  // part of the PDF trailer and lets us avoid importing/running PDF.js for
  // the overwhelmingly common unencrypted case.
  const marker = new TextDecoder('latin1').decode(buffer).includes('/Encrypt');
  if (!marker) return 'not-encrypted';

  const candidate = password?.trim();
  if (!candidate) return 'password-required';

  // Validate only an entered password. Office remains the renderer, but its
  // bridge does not reliably report an incorrect PDF password on mobile.
  // Bound the PDF.js probe so a WebView worker issue can never leave the modal
  // spinning indefinitely.
  try {
    const pdf = await import('pdfjs-dist');
    pdf.GlobalWorkerOptions.workerSrc = `${String(import.meta.env.BASE_URL).replace(/\/$/, '')}/pdf.worker.min.js`;
    // PDF.js may transfer ArrayBuffer ownership to its worker. Keep the
    // original bytes intact because the Office bridge consumes them next.
    const validationBuffer = buffer.slice(0);
    const loadingTask = pdf.getDocument({ data: validationBuffer, password: candidate });
    const passwordResult = new Promise<PdfPasswordState>((resolve) => {
      loadingTask.onPassword = (_setPassword: (nextPassword: string) => void, reason: number) => {
        resolve(reason === pdf.PasswordResponses.INCORRECT_PASSWORD ? 'password-invalid' : 'password-required');
      };
    });
    let timeoutId: number | undefined;
    const timeoutResult = new Promise<'validation-timeout'>((resolve) => {
      timeoutId = window.setTimeout(() => resolve('validation-timeout'), PDF_PASSWORD_VALIDATION_TIMEOUT_MS);
    });
    let result: PdfPasswordState;
    try {
      result = await Promise.race([
        loadingTask.promise.then(async (document) => {
          await document.destroy();
          return 'ready' as const;
        }).catch((error: unknown) => {
          if (
            error &&
            typeof error === 'object' &&
            'name' in error &&
            error.name === 'PasswordException'
          ) {
            return 'password-invalid' as const;
          }
          throw error;
        }),
        passwordResult,
        timeoutResult,
      ]);
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }
    if (result === 'validation-timeout') {
      try {
        await loadingTask.destroy();
      } catch {
        // Ignore cleanup failures after the bounded probe.
      }
      return 'validation-timeout';
    }
    try {
      await loadingTask.destroy();
    } catch {
      // The task may already have been destroyed with its document.
    }
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') return 'password-invalid';
    // A malformed/unsupported PDF should continue through the Office error
    // path instead of being misreported as an incorrect password.
    return 'not-encrypted';
  }
};

const officeShellWarmups = new Map<string, Promise<void>>();
const officePreconnectedOrigins = new Set<string>();

const isCompactOfficeViewport = (): boolean =>
  window.matchMedia('(max-width: 750px), (max-height: 520px) and (pointer: coarse)').matches;

const preconnectOfficeOrigin = (editorUrl: string): void => {
  if (typeof document === 'undefined') return;

  try {
    const { origin } = new URL(editorUrl, window.location.href);
    if (officePreconnectedOrigins.has(origin)) return;
    officePreconnectedOrigins.add(origin);

    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  } catch {
    // The normal open path will surface an invalid configured URL.
  }
};

const warmOfficeEditorShell = (editorUrl: string): Promise<void> => {
  if (typeof document === 'undefined') return Promise.resolve();
  // Mobile browsers have much tighter memory limits. A hidden second
  // OnlyOffice instance can evict the visible editor and surface a fatal
  // "error while working with document" dialog.
  if (isCompactOfficeViewport()) return Promise.resolve();

  let target: URL;
  try {
    target = new URL(editorUrl, window.location.href);
  } catch {
    return Promise.resolve();
  }

  const warmupKey = `${target.origin}${target.pathname}`;
  const existingWarmup = officeShellWarmups.get(warmupKey);
  if (existingWarmup) return existingWarmup;

  preconnectOfficeOrigin(target.toString());
  target.searchParams.set('embed', '1');
  target.searchParams.set('parentOrigin', window.location.origin);
  target.searchParams.set('requestId', `warmup-${Date.now()}`);
  target.searchParams.set('fileName', 'warmup.docx');
  target.searchParams.set('fileType', 'docx');
  target.searchParams.set(
    'mimeType',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  target.searchParams.set('editing', '0');
  target.searchParams.set('lang', 'zh-CN');
  target.searchParams.set('mobile', '0');
  target.searchParams.set('compactToolbar', '0');

  const warmup = new Promise<void>((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.src = target.toString();
    iframe.tabIndex = -1;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.left = '-10000px';
    iframe.style.top = '-10000px';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      iframe.remove();
      resolve();
    };
    const lifetimeTimeout = window.setTimeout(finish, OFFICE_SHELL_WARMUP_LIFETIME_MS);
    iframe.addEventListener(
      'error',
      () => {
        window.clearTimeout(lifetimeTimeout);
        finish();
      },
      { once: true }
    );
    document.body.appendChild(iframe);
  });

  officeShellWarmups.set(warmupKey, warmup);
  return warmup;
};

type EditorMode = 'preview' | 'edit';
type EditorPhase = 'loading' | 'ready' | 'saving' | 'uploading' | 'publishing' | 'saved' | 'error';
type BridgeSaveProtocol = 'unknown' | 'legacy' | 'save-id';
type NativeWindowState = 'inactive' | 'opening' | 'active' | 'fallback';

type EditorSession = {
  mode: EditorMode;
  requestId: string;
  nativeSessionId: string;
  src: string;
  password?: string;
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
  passwordRequired?: boolean;
  chunkIndex?: number;
  protocolVersion?: number;
  supportsChunkedSource?: boolean;
  stage?: string;
  level?: string;
};

type OfficeDiagnosticEntry = {
  at: number;
  event: string;
  details?: Record<string, string | number | boolean | null | undefined>;
};

const diagnosticText = (value: unknown): string => {
  if (value instanceof Error) return value.message.slice(0, 300);
  if (typeof value === 'string') return value.slice(0, 300);
  try {
    return JSON.stringify(value).slice(0, 300);
  } catch {
    return String(value).slice(0, 300);
  }
};

const diagnosticError = (value: unknown): string =>
  diagnosticText(value)
    .replace(
      /(access[_-]?token|authorization|cookie|password|secret|key)=([^&\s]+)/gi,
      '$1=[redacted]'
    )
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]');

type AndroidChunkAckWaiter = {
  requestId: string;
  chunkIndex: number;
  timeoutId: number;
  resolve: () => void;
  reject: (error: Error) => void;
};

type MatrixUploadPromise = ReturnType<ReturnType<typeof useMatrixClient>['uploadContent']>;

type SaveOperation = {
  id: string;
  requestId: string;
  dirtyRevision: number;
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
  sourceSenderId?: string;
  updatedBy?: string;
  updatedAt?: number;
};

const OFFICE_ICON_META = {
  word: { label: 'W', color: '#2563eb' },
  spreadsheet: { label: 'X', color: '#168454' },
  presentation: { label: 'P', color: '#e05236' },
  pdf: { label: 'PDF', color: '#e53935' },
} as const;

const makeRequestId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const getTimeoutMs = (seconds: number | undefined, fallbackSeconds: number): number => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return fallbackSeconds * 1000;
  return Math.min(Math.max(seconds, 5), 600) * 1000;
};

const encodeBase64Chunk = (bytes: Uint8Array): string => {
  let binary = '';
  const stringChunkSize = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += stringChunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + stringChunkSize));
  }
  return window.btoa(binary);
};

const isSaveShortcut = (event: globalThis.KeyboardEvent): boolean =>
  (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's';

const getEditorUrl = (
  editorUrl: string,
  requestId: string,
  mode: EditorMode,
  fileName: string,
  mimeType: string,
  protectedPdf = false
): string => {
  const target = new URL(editorUrl);
  target.searchParams.set('embed', '1');
  target.searchParams.set('parentOrigin', window.location.origin);
  target.searchParams.set('requestId', requestId);
  target.searchParams.set('fileName', fileName);
  target.searchParams.set('fileType', getFileNameExt(fileName));
  target.searchParams.set('mimeType', mimeType);
  if (protectedPdf) target.searchParams.set('protectedPdf', '1');
  target.searchParams.set('editing', mode === 'edit' ? '1' : '0');
  target.searchParams.set('lang', 'zh-CN');
  const compactViewport = isCompactOfficeViewport();
  // Keep the responsive mobile reader for previews. Community Edition edit
  // sessions must use the desktop engine or ONLYOFFICE blocks editing.
  target.searchParams.set('mobile', compactViewport && mode === 'preview' ? '1' : '0');
  target.searchParams.set('compactToolbar', compactViewport ? '1' : '0');
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
  sourceSenderId,
  updatedBy,
  updatedAt,
}: OfficeFileEditorProps) {
  const mx = useMatrixClient();
  const clientConfig = useClientConfig();
  const useAuthentication = useMediaAuthentication();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sessionRef = useRef<EditorSession>();
  const sourceBufferRef = useRef<ArrayBuffer>();
  const cachedSourceRef = useRef<Blob>();
  const pendingSourceRef = useRef<Promise<Blob>>();
  const iframeReadyRef = useRef(false);
  const saveOperationRef = useRef<SaveOperation>();
  const lastSettledSaveIdRef = useRef<string>();
  const dirtyRef = useRef(false);
  const dirtyRevisionRef = useRef(0);
  const bridgeSaveProtocolRef = useRef<BridgeSaveProtocol>('unknown');
  const legacyExportInvalidatedRef = useRef(false);
  const mountedRef = useRef(true);
  const bridgeMessageHandlerRef = useRef<(message: OfficeBridgeMessage) => void>();
  const bridgeReadyTimeoutRef = useRef<number>();
  const documentOpenedTimeoutRef = useRef<number>();
  const nativeWindowRef = useRef<NativeOfficeWindowHandle>();
  const nativeWindowStateRef = useRef<NativeWindowState>('inactive');
  const nativePayloadRef = useRef<NativeOfficeWindowPayload>();
  const nativeActionHandlerRef = useRef<(action: NativeOfficeWindowAction) => void>();
  const androidSourceRequestRef = useRef<string>();
  const androidChunkAckRef = useRef<AndroidChunkAckWaiter>();
  const androidChunkProgressRef = useRef<{ sent: number; total: number }>();
  const diagnosticStartedAtRef = useRef<number>(Date.now());
  const diagnosticsRef = useRef<OfficeDiagnosticEntry[]>([]);

  const [session, setSession] = useState<EditorSession>();
  const [phase, setPhase] = useState<EditorPhase>('loading');
  const [dirty, setDirty] = useState(false);
  const [showClosePrompt, setShowClosePrompt] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [legacyRetryBlocked, setLegacyRetryBlocked] = useState(false);
  const [backgroundPublishing, setBackgroundPublishing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const [nativeWindowState, setNativeWindowState] = useState<NativeWindowState>('inactive');
  const [nativeSourceBinary, setNativeSourceBinary] = useState<NativeOfficeBinaryDescriptor>();
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string>();
  const [, setDiagnosticRevision] = useState(0);
  const [diagnosticCopied, setDiagnosticCopied] = useState(false);
  const [diagnosticCopyFailed, setDiagnosticCopyFailed] = useState(false);
  const [diagnosticSent, setDiagnosticSent] = useState(false);
  const [diagnosticSendFailed, setDiagnosticSendFailed] = useState(false);

  const officeKind = getOfficeDocumentKind(body, mimeType);
  const iconMeta = officeKind ? OFFICE_ICON_META[officeKind] : OFFICE_ICON_META.word;
  const desktopNativeOffice = isDesktopUpdaterSupported();
  const androidApp = isAndroidApp();
  const iosOfficeLayout = !desktopNativeOffice && isIOS();
  const compactOfficeViewport = isCompactOfficeViewport();
  const mobileOfficeShell = androidApp || mobileOrTablet() || compactOfficeViewport;
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
  const canEdit = officeKind !== 'pdf' && Boolean(room && eventId?.startsWith('$'));

  const recordDiagnostic = useCallback(
    (event: string, details?: Record<string, string | number | boolean | null | undefined>) => {
      // Keep this bounded: it is intended for a single failed open, not long-term telemetry.
      const entry: OfficeDiagnosticEntry = {
        at: Math.max(0, Date.now() - diagnosticStartedAtRef.current),
        event,
        details,
      };
      diagnosticsRef.current = [...diagnosticsRef.current.slice(-399), entry];
      setDiagnosticRevision((revision) => revision + 1);
    },
    []
  );

  const getDiagnosticReport = useCallback(() => {
    const activeSession = sessionRef.current;
    const origin = (() => {
      try {
        return activeSession ? new URL(activeSession.src).origin : 'unknown';
      } catch {
        return 'invalid';
      }
    })();
    const report = {
      version: 1,
      generatedAt: new Date().toISOString(),
      app: 'cinny-android-office',
      userAgent: navigator.userAgent,
      language: navigator.language,
      online: navigator.onLine,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      officeOrigin: origin,
      fileType: getFileNameExt(body),
      fileSize: infoSize ?? null,
      phase,
      error: errorMessage ? diagnosticError(errorMessage) : null,
      events: diagnosticsRef.current,
    };
    // The report deliberately contains metadata and bridge timing only; never include file bytes,
    // Matrix access tokens, or the full media URL.
    return JSON.stringify(report, null, 2);
  }, [body, errorMessage, infoSize, phase]);

  const copyDiagnosticReport = useCallback(async () => {
    const report = getDiagnosticReport();
    let copied = false;

    if (androidApp) {
      try {
        const result = await NativeClipboard.writeText({ text: report });
        copied = result?.verified === true;
      } catch {
        copied = false;
      }
    }

    try {
      if (!copied && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(report);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      const textarea = document.createElement('textarea');
      textarea.value = report;
      textarea.readOnly = true;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, report.length);
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
      textarea.remove();
    }

    setDiagnosticCopied(copied);
    setDiagnosticCopyFailed(!copied);
    window.setTimeout(() => {
      setDiagnosticCopied(false);
      setDiagnosticCopyFailed(false);
    }, 2500);
  }, [androidApp, getDiagnosticReport]);

  const sendDiagnosticReport = useCallback(async () => {
    const report = getDiagnosticReport();
    if (room) {
      const maxMessageLength = 60_000;
      const messageReport =
        report.length > maxMessageLength
          ? `${report.slice(0, 10_000)}\n...[中间日志已截断]...\n${report.slice(-50_000)}`
          : report;
      try {
        await mx.sendMessage(room.roomId, {
          msgtype: MsgType.Text,
          body: `Starfire Office 诊断信息\n${messageReport}`,
        } as never);
        setDiagnosticSent(true);
        setDiagnosticSendFailed(false);
        window.setTimeout(() => setDiagnosticSent(false), 2500);
        return;
      } catch {
        setDiagnosticSendFailed(true);
      }
    }
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Starfire Office 诊断信息',
          text: report,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    await copyDiagnosticReport();
  }, [copyDiagnosticReport, getDiagnosticReport, mx, room]);

  const loadSourceFile = useCallback(async (): Promise<Blob> => {
    if (cachedSourceRef.current) return cachedSourceRef.current;
    if (pendingSourceRef.current) return pendingSourceRef.current;

    const pendingSource = (async () => {
      const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');

      const source = encInfo
        ? await downloadEncryptedMedia(mediaUrl, (buffer) => decryptFile(buffer, mimeType, encInfo))
        : await downloadMedia(mediaUrl);
      if (source.size <= MAX_MEMORY_CACHED_SOURCE_BYTES) {
        cachedSourceRef.current = source;
      }
      return source;
    })();
    pendingSourceRef.current = pendingSource;

    try {
      return await pendingSource;
    } finally {
      if (pendingSourceRef.current === pendingSource) {
        pendingSourceRef.current = undefined;
      }
    }
  }, [encInfo, mimeType, mx, url, useAuthentication]);

  useEffect(() => {
    cachedSourceRef.current = undefined;
    pendingSourceRef.current = undefined;
  }, [url]);

  useEffect(() => {
    if (!session || desktopNativeOffice) return undefined;

    let stableViewportHeight = Math.round(window.innerHeight);
    const updateOfficeViewportHeight = () => {
      const height = iosOfficeLayout
        ? stableViewportHeight
        : Math.round(window.visualViewport?.height ?? window.innerHeight);
      document.documentElement.style.setProperty(
        '--office-viewport-height',
        `${height}px`
      );
    };

    updateOfficeViewportHeight();
    const handleOrientationChange = () => {
      stableViewportHeight = Math.round(window.innerHeight);
      updateOfficeViewportHeight();
    };
    if (!iosOfficeLayout) {
      window.addEventListener('resize', updateOfficeViewportHeight, { passive: true });
      window.visualViewport?.addEventListener('resize', updateOfficeViewportHeight, {
        passive: true,
      });
      window.visualViewport?.addEventListener('scroll', updateOfficeViewportHeight, {
        passive: true,
      });
    }
    window.addEventListener('orientationchange', handleOrientationChange, { passive: true });

    return () => {
      window.removeEventListener('resize', updateOfficeViewportHeight);
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.visualViewport?.removeEventListener('resize', updateOfficeViewportHeight);
      window.visualViewport?.removeEventListener('scroll', updateOfficeViewportHeight);
      document.documentElement.style.removeProperty('--office-viewport-height');
    };
  }, [desktopNativeOffice, iosOfficeLayout, session]);

  useEffect(() => {
    if (!session || !mobileOfficeShell) return undefined;

    const handleWindowError = (event: ErrorEvent | Event) => {
      if (event instanceof ErrorEvent) {
        recordDiagnostic('window_error', {
          message: diagnosticError(event.message),
          source: event.filename ? new URL(event.filename, window.location.href).origin : null,
          line: event.lineno || null,
          column: event.colno || null,
        });
      } else {
        recordDiagnostic('resource_error', {
          target: (event.target as HTMLElement)?.tagName || null,
        });
      }
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      recordDiagnostic('unhandled_rejection', { reason: diagnosticError(event.reason) });
    };
    const handleNetworkChange = () => recordDiagnostic(navigator.onLine ? 'online' : 'offline');

    window.addEventListener('error', handleWindowError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);
    return () => {
      window.removeEventListener('error', handleWindowError, true);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('offline', handleNetworkChange);
    };
  }, [mobileOfficeShell, recordDiagnostic, session]);

  useEffect(() => {
    if (!session || session.mode !== 'edit' || desktopNativeOffice) return undefined;

    lockOfficeLandscape().catch(() => undefined);
    return () => {
      unlockOfficeOrientation().catch(() => undefined);
    };
  }, [desktopNativeOffice, session]);

  useEffect(() => {
    preconnectOfficeOrigin(officeEditorUrl);
    const warmupTimeout = window.setTimeout(() => {
      warmOfficeEditorShell(officeEditorUrl).catch(() => undefined);
    }, OFFICE_SHELL_WARMUP_DELAY_MS);
    return () => window.clearTimeout(warmupTimeout);
  }, [officeEditorUrl]);

  const warmOfficeOpen = useCallback(() => {
    warmOfficeEditorShell(officeEditorUrl).catch(() => undefined);
    loadSourceFile().catch(() => undefined);
  }, [loadSourceFile, officeEditorUrl]);

  const clearOpenTimeouts = useCallback(() => {
    if (bridgeReadyTimeoutRef.current !== undefined) {
      window.clearTimeout(bridgeReadyTimeoutRef.current);
      bridgeReadyTimeoutRef.current = undefined;
    }
    if (documentOpenedTimeoutRef.current !== undefined) {
      window.clearTimeout(documentOpenedTimeoutRef.current);
      documentOpenedTimeoutRef.current = undefined;
    }
  }, []);

  const cancelAndroidChunkAck = useCallback(() => {
    const waiter = androidChunkAckRef.current;
    if (!waiter) return;
    androidChunkAckRef.current = undefined;
    window.clearTimeout(waiter.timeoutId);
    waiter.reject(new Error('Android Office source transfer cancelled.'));
  }, []);

  const sendAndroidChunkWithAck = useCallback(
    async (
      targetWindow: Window,
      targetOrigin: string,
      requestId: string,
      chunkIndex: number,
      chunkData: string
    ): Promise<void> => {
      const sendAttempt = async (attempt: number): Promise<void> => {
        if (
          sessionRef.current?.requestId !== requestId ||
          androidSourceRequestRef.current !== requestId
        ) {
          throw new Error('Android Office source transfer superseded.');
        }

        try {
          recordDiagnostic('chunk_send', { chunkIndex, attempt: attempt + 1 });
          await new Promise<void>((resolve, reject) => {
            const waiter: AndroidChunkAckWaiter = {
              requestId,
              chunkIndex,
              timeoutId: 0,
              resolve,
              reject,
            };
            waiter.timeoutId = window.setTimeout(() => {
              if (androidChunkAckRef.current === waiter) {
                androidChunkAckRef.current = undefined;
              }
              reject(new Error('Android Office document chunk was not acknowledged.'));
            }, ANDROID_SOURCE_CHUNK_ACK_TIMEOUT_MS);
            androidChunkAckRef.current = waiter;
            targetWindow.postMessage(
              {
                type: OFFICE_BRIDGE_SOURCE_CHUNK,
                requestId,
                chunkIndex,
                chunkData,
              },
              targetOrigin
            );
          });
          recordDiagnostic('chunk_ack', { chunkIndex, attempt: attempt + 1 });
        } catch (error) {
          recordDiagnostic('chunk_retry', {
            chunkIndex,
            attempt: attempt + 1,
            error: diagnosticError(error),
          });
          if (
            sessionRef.current?.requestId !== requestId ||
            androidSourceRequestRef.current !== requestId
          ) {
            throw error;
          }
          if (attempt + 1 >= ANDROID_SOURCE_CHUNK_MAX_ATTEMPTS) throw error;
          await sendAttempt(attempt + 1);
        }
      };
      await sendAttempt(0);
    },
    [recordDiagnostic]
  );

  const armBridgeReadyTimeout = useCallback(
    (requestId: string) => {
      if (bridgeReadyTimeoutRef.current !== undefined) {
        window.clearTimeout(bridgeReadyTimeoutRef.current);
      }
      const timeoutMs = isCompactOfficeViewport()
        ? MOBILE_IFRAME_BRIDGE_READY_TIMEOUT_MS
        : IFRAME_BRIDGE_READY_TIMEOUT_MS;
      bridgeReadyTimeoutRef.current = window.setTimeout(() => {
        if (sessionRef.current?.requestId !== requestId) return;
        recordDiagnostic('timeout_bridge_ready', { timeoutMs });
        setErrorMessage('Office 页面连接超时。请重新打开文档，或关闭窗口后再试。');
        setPhase('error');
      }, timeoutMs);
    },
    [recordDiagnostic]
  );

  const armDocumentOpenedTimeout = useCallback(
    (requestId: string) => {
      if (documentOpenedTimeoutRef.current !== undefined) {
        window.clearTimeout(documentOpenedTimeoutRef.current);
      }
      const timeoutMs = isCompactOfficeViewport()
        ? MOBILE_DOCUMENT_OPENED_TIMEOUT_MS
        : DOCUMENT_OPENED_TIMEOUT_MS;
      documentOpenedTimeoutRef.current = window.setTimeout(() => {
        if (sessionRef.current?.requestId !== requestId) return;
        recordDiagnostic('timeout_document_opened', {
          timeoutMs,
          iframeReady: iframeReadyRef.current,
          chunks: androidChunkProgressRef.current?.sent ?? null,
          totalChunks: androidChunkProgressRef.current?.total ?? null,
        });
        setErrorMessage('Office 打开文档超时。你可以重新打开，或直接关闭窗口。');
        setPhase('error');
      }, timeoutMs);
    },
    [recordDiagnostic]
  );

  const postToOffice = useCallback(
    (message: Record<string, unknown>) => {
      const activeSession = sessionRef.current;
      const nativeWindow = nativeWindowRef.current;
      if (
        activeSession &&
        nativeWindow?.sessionId === activeSession.nativeSessionId &&
        typeof message.type === 'string'
      ) {
        emitNativeOfficeCommand(nativeWindow.label, {
          type: 'bridge',
          sessionId: activeSession.nativeSessionId,
          requestId: activeSession.requestId,
          message: {
            type: message.type,
            saveId: typeof message.saveId === 'string' ? message.saveId : undefined,
          },
        }).catch(() => undefined);
        return;
      }
      const targetWindow = iframeRef.current?.contentWindow;
      if (!activeSession || !targetWindow) return;

      recordDiagnostic('bridge_send', {
        type: typeof message.type === 'string' ? message.type : null,
        native: false,
      });

      targetWindow.postMessage(
        { ...message, requestId: activeSession.requestId },
        new URL(activeSession.src).origin
      );
    },
    [recordDiagnostic]
  );

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
    cancelAndroidChunkAck();
    sessionRef.current = undefined;
    sourceBufferRef.current = undefined;
    androidSourceRequestRef.current = undefined;
    androidChunkProgressRef.current = undefined;
    iframeReadyRef.current = false;
    bridgeSaveProtocolRef.current = 'unknown';
    legacyExportInvalidatedRef.current = false;
    clearOpenTimeouts();
    setSession(undefined);
    dirtyRef.current = false;
    setDirty(false);
    setShowClosePrompt(false);
    setErrorMessage(undefined);
    setLegacyRetryBlocked(false);
    setBackgroundPublishing(publishing);
    setPhase('loading');
    nativeWindowStateRef.current = 'inactive';
    setNativeWindowState('inactive');
    setNativeSourceBinary(undefined);
    setPasswordRequired(false);
    setPasswordInput('');
    setPasswordError(undefined);
  }, [cancelAndroidChunkAck, cancelSaveOperation, clearOpenTimeouts]);

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
        dirtyRevision: dirtyRevisionRef.current,
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
      const { activeElement } = document;
      if (activeElement instanceof HTMLElement) activeElement.blur();
      iframeRef.current?.blur();
      beginSaveOperation(closeAfterSave, true);
    },
    [beginSaveOperation]
  );

  const transferSourceIfReady = useCallback(() => {
    const activeSession = sessionRef.current;
    const targetWindow = iframeRef.current?.contentWindow;
    const buffer = sourceBufferRef.current;
    if (!activeSession || !targetWindow || !iframeReadyRef.current || !buffer) return;

    const message = {
      type: OFFICE_BRIDGE_OPEN,
      requestId: activeSession.requestId,
      fileName: body,
      fileType: getFileNameExt(body),
      mimeType,
      ...(activeSession.password ? { password: activeSession.password } : {}),
      buffer,
    };
    const targetOrigin = new URL(activeSession.src).origin;
    if (androidApp) {
      if (androidSourceRequestRef.current === activeSession.requestId) return;
      androidSourceRequestRef.current = activeSession.requestId;
      const sourceBytes = new Uint8Array(buffer);
      const chunkCount = Math.ceil(sourceBytes.byteLength / ANDROID_SOURCE_CHUNK_BYTES);
      androidChunkProgressRef.current = { sent: 0, total: chunkCount };
      recordDiagnostic('source_begin', {
        byteLength: sourceBytes.byteLength,
        chunkCount,
        chunkBytes: ANDROID_SOURCE_CHUNK_BYTES,
      });
      targetWindow.postMessage(
        {
          type: OFFICE_BRIDGE_SOURCE_BEGIN,
          requestId: activeSession.requestId,
          fileName: body,
          fileType: getFileNameExt(body),
          mimeType,
          byteLength: sourceBytes.byteLength,
          chunkCount,
          chunkSize: ANDROID_SOURCE_CHUNK_BYTES,
          ...(activeSession.password ? { password: activeSession.password } : {}),
        },
        targetOrigin
      );

      (async () => {
        for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
          const offset = chunkIndex * ANDROID_SOURCE_CHUNK_BYTES;
          const chunk = sourceBytes.subarray(offset, offset + ANDROID_SOURCE_CHUNK_BYTES);
          await sendAndroidChunkWithAck(
            targetWindow,
            targetOrigin,
            activeSession.requestId,
            chunkIndex,
            encodeBase64Chunk(chunk)
          );
          androidChunkProgressRef.current = { sent: chunkIndex + 1, total: chunkCount };
        }
        if (sessionRef.current?.requestId !== activeSession.requestId) return;
        targetWindow.postMessage(
          {
            type: OFFICE_BRIDGE_SOURCE_END,
            requestId: activeSession.requestId,
          },
          targetOrigin
        );
        recordDiagnostic('source_end_sent', { chunkCount });
        armDocumentOpenedTimeout(activeSession.requestId);
      })().catch((error) => {
        if (sessionRef.current?.requestId !== activeSession.requestId) return;
        const progress = androidChunkProgressRef.current;
        recordDiagnostic('source_transfer_error', {
          sent: progress?.sent ?? null,
          total: progress?.total ?? null,
          error: diagnosticError(error),
        });
        androidSourceRequestRef.current = undefined;
        androidChunkProgressRef.current = undefined;
        cancelAndroidChunkAck();
        clearOpenTimeouts();
        setErrorMessage(
          progress
            ? `Android 文档传输失败（已发送 ${progress.sent}/${progress.total} 块）。请确认 Office 服务已更新后重新打开。`
            : 'Android 文档传输失败。请确认 Office 服务已更新后重新打开。'
        );
        setPhase('error');
      });
      return;
    }
    targetWindow.postMessage(message, targetOrigin, [buffer]);
    sourceBufferRef.current = undefined;
    armDocumentOpenedTimeout(activeSession.requestId);
  }, [
    androidApp,
    armDocumentOpenedTimeout,
    body,
    cancelAndroidChunkAck,
    clearOpenTimeouts,
    mimeType,
    recordDiagnostic,
    sendAndroidChunkWithAck,
  ]);

  const openEditor = useCallback(
    (mode: EditorMode, password?: string, forceInline = false) => {
      if (!officeKind || (mode === 'edit' && (!canEdit || mobileOfficeShell))) return;
      if (saveOperationRef.current?.stage === 'publishing') return;

      warmOfficeEditorShell(officeEditorUrl).catch(() => undefined);

      const requestId = makeRequestId();
      const nativeSessionId = makeRequestId();
      const nextSession: EditorSession = {
        mode,
        requestId,
        nativeSessionId,
        src: getEditorUrl(
          officeEditorUrl,
          requestId,
          mode,
          body,
          mimeType,
          officeKind === 'pdf' && Boolean(password?.trim())
        ),
        password: password?.trim() || undefined,
      };
      diagnosticStartedAtRef.current = Date.now();
      diagnosticsRef.current = [];
      recordDiagnostic('open_start', {
        platform: androidApp ? 'android' : mobileOfficeShell ? 'mobile-web' : 'desktop-web',
        mode,
        fileType: getFileNameExt(body),
        fileSize: infoSize ?? null,
        online: navigator.onLine,
        userAgent: navigator.userAgent.slice(0, 220),
        officeOrigin: new URL(nextSession.src).origin,
      });
      cancelSaveOperation();
      cancelAndroidChunkAck();
      clearOpenTimeouts();
      sessionRef.current = nextSession;
      sourceBufferRef.current = undefined;
      androidSourceRequestRef.current = undefined;
      androidChunkProgressRef.current = undefined;
      iframeReadyRef.current = false;
      bridgeSaveProtocolRef.current = 'unknown';
      legacyExportInvalidatedRef.current = false;
      setSession(nextSession);
      setPhase('loading');
      dirtyRef.current = false;
      dirtyRevisionRef.current = 0;
      setDirty(false);
      setShowClosePrompt(false);
      setErrorMessage(undefined);
      setLegacyRetryBlocked(false);
      setBackgroundPublishing(false);
      setNativeSourceBinary(undefined);
      setPasswordRequired(false);
      setPasswordInput('');
      setPasswordError(undefined);
      const shouldUseNativeWindow = desktopNativeOffice && !forceInline;
      let nextNativeWindowState: NativeWindowState = 'inactive';
      if (shouldUseNativeWindow) nextNativeWindowState = 'opening';
      else if (desktopNativeOffice) nextNativeWindowState = 'fallback';
      nativeWindowStateRef.current = nextNativeWindowState;
      setNativeWindowState(nextNativeWindowState);
      armBridgeReadyTimeout(requestId);

      let sourceLoadTimeout: number | undefined;
      const sourceLoadTimedOut = new Promise<never>((_resolve, reject) => {
        sourceLoadTimeout = window.setTimeout(
          () => reject(new Error('Office source load timed out.')),
          SOURCE_LOAD_TIMEOUT_MS
        );
      });

      Promise.race([loadSourceFile(), sourceLoadTimedOut])
        .then((file) => {
          recordDiagnostic('source_downloaded', { byteLength: file.size });
          return file.arrayBuffer();
        })
        .then(async (source) => {
          if (sessionRef.current?.requestId !== requestId) return;
          recordDiagnostic('source_buffer_ready', { byteLength: source.byteLength });
          let buffer = source;
          const encryptedOfficeFile =
            isCompoundOfficeContainer(source) && (await isOfficeDocumentEncrypted(source));

          // PDF encryption does not use the Compound File signature. Mobile
          // WebViews otherwise hand the protected PDF to Office without a
          // password and wait forever for the opened callback. Probe only for
          // the password requirement; Office remains the renderer.
          // Let Office own the protected-PDF prompt on mobile. Preflighting with PDF.js
          // would display a duplicate host password dialog.
          const pdfPasswordState: PdfPasswordState = 'ready';

          if (encryptedOfficeFile) {
            if (!password?.trim()) {
              clearOpenTimeouts();
              setPasswordRequired(true);
              setPasswordInput('');
              setPasswordError(undefined);
              return;
            }

            try {
              buffer = await decryptOfficeDocument(source, password);
            } catch (error) {
              if (sessionRef.current?.requestId !== requestId) return;
              clearOpenTimeouts();
              setPasswordRequired(true);
              setPasswordInput('');
              setPasswordError(error instanceof Error ? error.message : undefined);
              return;
            }
          }

          sourceBufferRef.current = buffer;

          if (shouldUseNativeWindow) {
            if (nativeWindowStateRef.current === 'fallback') {
              transferSourceIfReady();
              return;
            }
            try {
              const descriptor = await writeNativeOfficeBinary(nativeSessionId, buffer);
              if (sessionRef.current?.requestId !== requestId) {
                clearNativeOfficeBinaries(nativeSessionId).catch(() => undefined);
                return;
              }
              if ((nativeWindowStateRef.current as NativeWindowState) === 'fallback') {
                clearNativeOfficeBinaries(nativeSessionId).catch(() => undefined);
                transferSourceIfReady();
                return;
              }
              setNativeSourceBinary(descriptor);
              return;
            } catch {
              if (sessionRef.current?.requestId !== requestId) return;
              nativeWindowStateRef.current = 'fallback';
              setNativeWindowState('fallback');
              setErrorMessage(undefined);
              setPhase('loading');
              closeNativeOfficeWindow(nativeSessionId).catch(() => undefined);
              armBridgeReadyTimeout(requestId);
            }
          }

          transferSourceIfReady();
        })
        .catch((error) => {
          if (sessionRef.current?.requestId === requestId) {
            recordDiagnostic('source_load_error', { error: diagnosticError(error) });
            clearOpenTimeouts();
            setErrorMessage('文档下载或解密超时。请检查网络后重新打开，或直接关闭窗口。');
            setPhase('error');
          }
        })
        .finally(() => {
          if (sourceLoadTimeout !== undefined) window.clearTimeout(sourceLoadTimeout);
        });
    },
    [
      armBridgeReadyTimeout,
      androidApp,
      body,
      canEdit,
      cancelSaveOperation,
      cancelAndroidChunkAck,
      clearOpenTimeouts,
      desktopNativeOffice,
      infoSize,
      loadSourceFile,
      mimeType,
      mobileOfficeShell,
      officeEditorUrl,
      officeKind,
      recordDiagnostic,
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

      const { content, eventType } = buildOfficeFileUpdateMessage({
        sourceEventId: eventId,
        sourceSenderId: sourceSenderId ?? room.findEventById(eventId)?.getSender(),
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
      const sendResult = await mx.sendMessage(room.roomId, content as never);
      rememberOfficeFileRevision({
        sourceEventId: eventId,
        revisionEventId: sendResult?.event_id,
        senderId: mx.getSafeUserId(),
        eventType,
        content,
      });
    },
    [armSaveTimeout, body, eventId, mimeType, mx, room, sourceSenderId, uploadTimeoutMs]
  );

  useEffect(() => {
    const handleOfficeData = (data: OfficeBridgeMessage) => {
      const activeSession = sessionRef.current;
      if (!activeSession || data?.requestId !== activeSession.requestId) return;

      recordDiagnostic('bridge_receive', {
        type: data.type ?? null,
        chunkIndex: data.chunkIndex ?? null,
        protocolVersion: data.protocolVersion ?? null,
        supportsChunkedSource: data.supportsChunkedSource ?? null,
        stage: data.stage ?? null,
        level: data.level ?? null,
        message: data.message ? diagnosticError(data.message) : null,
      });

      if (data.type === OFFICE_BRIDGE_DIAGNOSTIC) return;

      if (data.type === OFFICE_BRIDGE_READY) {
        if (bridgeReadyTimeoutRef.current !== undefined) {
          window.clearTimeout(bridgeReadyTimeoutRef.current);
          bridgeReadyTimeoutRef.current = undefined;
        }
        if (androidApp && data.supportsChunkedSource !== true) {
          setErrorMessage(
            'Office 服务版本过旧，无法在 Android 中安全传输文档。请更新 Office 服务后重试。'
          );
          setPhase('error');
          return;
        }
        iframeReadyRef.current = true;
        transferSourceIfReady();
        return;
      }
      if (data.type === OFFICE_BRIDGE_SOURCE_CHUNK_RECEIVED) {
        const waiter = androidChunkAckRef.current;
        if (
          waiter &&
          waiter.requestId === activeSession.requestId &&
          waiter.chunkIndex === data.chunkIndex
        ) {
          androidChunkAckRef.current = undefined;
          window.clearTimeout(waiter.timeoutId);
          waiter.resolve();
        }
        return;
      }
      if (data.type === OFFICE_BRIDGE_SOURCE_RECEIVED) {
        cancelAndroidChunkAck();
        androidSourceRequestRef.current = undefined;
        sourceBufferRef.current = undefined;
        armDocumentOpenedTimeout(activeSession.requestId);
        return;
      }
      if (data.type === OFFICE_BRIDGE_OPENED) {
        if (documentOpenedTimeoutRef.current !== undefined) {
          window.clearTimeout(documentOpenedTimeoutRef.current);
          documentOpenedTimeoutRef.current = undefined;
        }
        if (!saveOperationRef.current) {
          sourceBufferRef.current = undefined;
          setErrorMessage(undefined);
          setPhase('ready');
        }
        return;
      }
      if (data.type === OFFICE_BRIDGE_PASSWORD_REQUIRED) {
        if (documentOpenedTimeoutRef.current !== undefined) {
          window.clearTimeout(documentOpenedTimeoutRef.current);
          documentOpenedTimeoutRef.current = undefined;
        }
        if (!saveOperationRef.current) {
          setErrorMessage(undefined);
          setPhase('ready');
        }
        return;
      }
      if (data.type === OFFICE_BRIDGE_DIRTY && data.dirty === true) {
        dirtyRevisionRef.current += 1;
        dirtyRef.current = true;
        setDirty(true);
        if (!saveOperationRef.current) {
          setErrorMessage(undefined);
          setPhase('ready');
        }
        return;
      }
      if (data.type === OFFICE_BRIDGE_SAVING) {
        const operation = saveOperationRef.current;
        if (operation) {
          if (!acceptBridgeSaveMessage(operation, data.saveId)) return;
          if (operation.stage === 'exporting') setPhase('saving');
          return;
        }

        // The bridge can initiate this path for an Office-internal Ctrl/Cmd+S.
        if (!dirtyRef.current) return;
        if (data.saveId) {
          bridgeSaveProtocolRef.current = 'save-id';
        } else {
          if (bridgeSaveProtocolRef.current === 'save-id' || legacyExportInvalidatedRef.current) {
            return;
          }
          bridgeSaveProtocolRef.current = 'legacy';
        }
        beginSaveOperation(false, false, data.saveId);
        return;
      }
      if (data.type === OFFICE_BRIDGE_ERROR) {
        cancelAndroidChunkAck();
        androidSourceRequestRef.current = undefined;
        const operation = saveOperationRef.current;
        if (operation) {
          if (!acceptBridgeSaveMessage(operation, data.saveId)) return;
          failSaveOperation(
            operation.id,
            'Office 无法生成最新文件。请重试；如果问题持续，可以直接关闭窗口。'
          );
          return;
        }
        if (data.saveId) return;
        if (legacyExportInvalidatedRef.current) return;
        if (data.passwordRequired || isPasswordPromptError(data.message)) {
          clearOpenTimeouts();
          setPasswordRequired(true);
          setPasswordInput('');
          setPasswordError(data.message);
          setPhase('loading');
          return;
        }
        clearOpenTimeouts();
        setErrorMessage('Office 无法打开文档。请检查网络后关闭窗口并重试。');
        setPhase('error');
        return;
      }
      if (data.type === OFFICE_BRIDGE_SAVED) {
        const operation = saveOperationRef.current;
        if (!operation || operation.stage !== 'exporting') return;
        if (!acceptBridgeSaveMessage(operation, data.saveId)) return;
        if (!(data.buffer instanceof ArrayBuffer) || data.buffer.byteLength === 0) {
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
        replaceOriginalFile(data.buffer, data.mimeType, operation.id)
          .then(() => {
            const activeOperation = saveOperationRef.current;
            if (!activeOperation || activeOperation.id !== operation.id) return;

            const shouldClose = activeOperation.closeAfterSave;
            const { detached } = activeOperation;
            const hasNewerChanges = dirtyRevisionRef.current > activeOperation.dirtyRevision;
            if (!settleSaveOperation(activeOperation)) return;
            if (mountedRef.current) setBackgroundPublishing(false);
            if (!mountedRef.current || detached) return;
            dirtyRef.current = hasNewerChanges;
            setDirty(hasNewerChanges);
            setErrorMessage(undefined);
            setPhase(hasNewerChanges ? 'ready' : 'saved');
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

    bridgeMessageHandlerRef.current = handleOfficeData;
    const handleOfficeMessage = (event: MessageEvent<OfficeBridgeMessage>) => {
      const activeSession = sessionRef.current;
      const targetWindow = iframeRef.current?.contentWindow;
      if (!activeSession || event.source !== targetWindow) return;
      if (event.origin !== new URL(activeSession.src).origin) return;
      handleOfficeData(event.data);
    };

    window.addEventListener('message', handleOfficeMessage);
    return () => {
      window.removeEventListener('message', handleOfficeMessage);
      if (bridgeMessageHandlerRef.current === handleOfficeData) {
        bridgeMessageHandlerRef.current = undefined;
      }
    };
  }, [
    acceptBridgeSaveMessage,
    androidApp,
    armDocumentOpenedTimeout,
    armSaveTimeout,
    beginSaveOperation,
    cancelAndroidChunkAck,
    clearOpenTimeouts,
    closeModal,
    failSaveOperation,
    prepareTimeoutMs,
    replaceOriginalFile,
    recordDiagnostic,
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
      androidSourceRequestRef.current = undefined;
      androidChunkProgressRef.current = undefined;
      cancelAndroidChunkAck();
      iframeReadyRef.current = false;
      clearOpenTimeouts();
    };
  }, [cancelAndroidChunkAck, cancelSaveOperation, clearOpenTimeouts]);

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

  const handleMobileClosePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      requestClose();
    },
    [requestClose]
  );

  useEffect(() => {
    if (!androidApp || !session) return undefined;

    const handleAndroidBackButton = (event: Event) => {
      event.preventDefault();
      requestClose();
    };
    window.addEventListener(ANDROID_BACK_BUTTON_EVENT, handleAndroidBackButton);
    return () => window.removeEventListener(ANDROID_BACK_BUTTON_EVENT, handleAndroidBackButton);
  }, [androidApp, requestClose, session]);

  const nativePayload: NativeOfficeWindowPayload | undefined = session
    ? {
        sessionId: session.nativeSessionId,
        requestId: session.requestId,
        mode: session.mode,
        src: session.src,
        body,
        mimeType,
        iconLabel: iconMeta.label,
        iconColor: iconMeta.color,
        phase,
        dirty,
        showClosePrompt,
        legacyRetryBlocked,
        errorMessage,
        password: session.password,
        passwordRequired,
        passwordError,
        sourceBinary: nativeSourceBinary,
      }
    : undefined;
  nativePayloadRef.current = nativePayload;

  nativeActionHandlerRef.current = (action: NativeOfficeWindowAction) => {
    const activeSession = sessionRef.current;
    if (
      !activeSession ||
      action.sessionId !== activeSession.nativeSessionId ||
      action.requestId !== activeSession.requestId
    ) {
      return;
    }

    if (action.type === 'bridge') {
      const { binary, ...message } = action.message;
      if (!binary) {
        bridgeMessageHandlerRef.current?.(message as OfficeBridgeMessage);
        return;
      }

      consumeNativeOfficeBinary(activeSession.nativeSessionId, binary.token)
        .then((buffer) => {
          if (
            sessionRef.current?.requestId !== activeSession.requestId ||
            buffer.byteLength !== binary.byteLength
          ) {
            throw new Error('Invalid native Office save result.');
          }
          bridgeMessageHandlerRef.current?.({ ...message, buffer } as OfficeBridgeMessage);
        })
        .catch(() => {
          if (sessionRef.current?.requestId !== activeSession.requestId) return;
          bridgeMessageHandlerRef.current?.({
            type: OFFICE_BRIDGE_ERROR,
            requestId: activeSession.requestId,
            saveId: message.saveId,
            message: '保存结果无法从独立窗口读取。',
          });
        });
      return;
    }
    if (action.type === 'save') {
      requestSave(false);
      return;
    }
    if (action.type === 'save-close') {
      requestSave(true);
      return;
    }
    if (action.type === 'close') {
      requestClose();
      return;
    }
    if (action.type === 'discard') {
      closeModal();
      return;
    }
    if (action.type === 'continue-editing') {
      setShowClosePrompt(false);
      return;
    }
    if (action.type === 'retry-open') {
      openEditor(activeSession.mode);
      return;
    }
    if (action.type === 'submit-password') {
      openEditor(activeSession.mode, action.password);
      return;
    }
    if (action.type === 'source-consumed') {
      sourceBufferRef.current = undefined;
      armDocumentOpenedTimeout(activeSession.requestId);
      return;
    }
    if (action.type === 'native-error') {
      const canFallback = Boolean(sourceBufferRef.current?.byteLength);
      if (canFallback) {
        nativeWindowStateRef.current = 'fallback';
        setNativeWindowState('fallback');
        nativeWindowRef.current = undefined;
        iframeReadyRef.current = false;
        setErrorMessage(undefined);
        setPhase('loading');
        closeNativeOfficeWindow(activeSession.nativeSessionId).catch(() => undefined);
        armBridgeReadyTimeout(activeSession.requestId);
      } else {
        closeNativeOfficeWindow(activeSession.nativeSessionId).catch(() => undefined);
        openEditor(activeSession.mode, undefined, true);
      }
    }
  };

  useEffect(() => {
    if (!desktopNativeOffice || !session || nativeWindowStateRef.current === 'fallback') {
      return undefined;
    }

    const { nativeSessionId, requestId } = session;
    const initialPayload = nativePayloadRef.current;
    if (!initialPayload || initialPayload.requestId !== requestId) return undefined;

    let disposed = false;
    let unlistenAction: (() => void) | undefined;
    let openedHandle: NativeOfficeWindowHandle | undefined;
    const openingController = new AbortController();

    const fallbackToInlineWindow = () => {
      if (disposed || sessionRef.current?.requestId !== requestId) return;
      if (nativeWindowRef.current?.sessionId === nativeSessionId) {
        nativeWindowRef.current = undefined;
      }
      openedHandle?.unlistenReady();
      openedHandle?.unlistenDestroyed();
      closeNativeOfficeWindow(nativeSessionId).catch(() => undefined);
      clearNativeOfficeBinaries(nativeSessionId).catch(() => undefined);
      nativeWindowStateRef.current = 'fallback';
      setNativeWindowState('fallback');
      iframeReadyRef.current = false;
      armBridgeReadyTimeout(requestId);
    };

    const openWindow = async () => {
      unlistenAction = await listenNativeOfficeAction(nativeSessionId, requestId, (action) => {
        nativeActionHandlerRef.current?.(action);
      });
      if (disposed) {
        unlistenAction();
        return;
      }

      openedHandle = await openNativeOfficeWindow(initialPayload, openingController.signal, () => {
        if (
          !disposed &&
          nativeWindowStateRef.current === 'active' &&
          sessionRef.current?.requestId === requestId
        ) {
          nativeActionHandlerRef.current?.({
            type: 'discard',
            sessionId: nativeSessionId,
            requestId,
          });
        }
      });
      if (disposed) {
        if (openedHandle) closeNativeOfficeWindow(nativeSessionId).catch(() => undefined);
        return;
      }
      if (!openedHandle) {
        fallbackToInlineWindow();
        return;
      }

      nativeWindowRef.current = openedHandle;
      nativeWindowStateRef.current = 'active';
      setNativeWindowState('active');
      const latestPayload = nativePayloadRef.current;
      if (latestPayload?.requestId === requestId) {
        emitNativeOfficePayload(openedHandle.label, latestPayload).catch(() => {
          fallbackToInlineWindow();
        });
      }
    };

    openWindow().catch(fallbackToInlineWindow);

    return () => {
      disposed = true;
      openingController.abort();
      unlistenAction?.();
      if (nativeWindowRef.current?.sessionId === nativeSessionId) {
        nativeWindowRef.current = undefined;
      }
      openedHandle?.unlistenReady();
      openedHandle?.unlistenDestroyed();
      closeNativeOfficeWindow(nativeSessionId).catch(() => undefined);
      clearNativeOfficeBinaries(nativeSessionId).catch(() => undefined);
    };
  }, [armBridgeReadyTimeout, desktopNativeOffice, session]);

  useEffect(() => {
    const handle = nativeWindowRef.current;
    const latestPayload = nativePayloadRef.current;
    if (
      nativeWindowState !== 'active' ||
      !handle ||
      !latestPayload ||
      handle.sessionId !== latestPayload.sessionId
    ) {
      return;
    }

    emitNativeOfficePayload(handle.label, latestPayload).catch(() => {
      nativeActionHandlerRef.current?.({
        type: 'native-error',
        sessionId: latestPayload.sessionId,
        requestId: latestPayload.requestId,
        message: 'Office 独立窗口通信中断。',
      });
    });
  }, [
    dirty,
    errorMessage,
    legacyRetryBlocked,
    nativeSourceBinary,
    passwordError,
    passwordRequired,
    nativeWindowState,
    phase,
    session,
    showClosePrompt,
  ]);

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

  const submitPassword = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const password = passwordInput.trim();
      if (!password || !session) return;
      openEditor(session.mode, password);
    },
    [openEditor, passwordInput, session]
  );

  if (!officeKind) return null;

  const extLabel = (getFileNameExt(body) || mimeTypeToExt(mimeType)).toUpperCase();
  const sizeLabel = typeof infoSize === 'number' ? bytesToSize(infoSize) : undefined;
  const updatedAtLabel =
    typeof updatedAt === 'number'
      ? new Intl.DateTimeFormat('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).format(updatedAt)
      : undefined;
  let updateLabel: string | undefined;
  if (updatedBy && updatedAtLabel) updateLabel = `由 ${updatedBy} 于 ${updatedAtLabel} 更新`;
  else if (updatedBy) updateLabel = `由 ${updatedBy} 更新`;
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
      <div className={css.card} onPointerEnter={warmOfficeOpen}>
        <div className={css.fileSummary}>
          <div
            className={css.fileIcon}
            style={{
              backgroundColor: iconMeta.color,
              fontSize: officeKind === 'pdf' ? '12px' : undefined,
            }}
            aria-hidden
          >
            {iconMeta.label}
          </div>
          <div className={css.fileMeta}>
            <Text size="T300" truncate className={css.fileName} title={body}>
              {body}
            </Text>
            <Text
              size="O400"
              priority="300"
              truncate
              title={[sizeLabel, extLabel, updateLabel].filter(Boolean).join(' · ')}
            >
              {[sizeLabel, extLabel, updateLabel].filter(Boolean).join(' · ')}
            </Text>
          </div>
        </div>
        <div
          className={css.actions}
          style={{
            gridTemplateColumns:
              mobileOfficeShell || officeKind === 'pdf' ? 'repeat(2, minmax(0, 1fr))' : undefined,
          }}
        >
          <button
            className={css.actionButton}
            type="button"
            onClick={() => openEditor('preview')}
            onFocus={warmOfficeOpen}
            onPointerDown={warmOfficeOpen}
            disabled={backgroundPublishing}
            title={backgroundPublishing ? '最新版本正在发布，请稍候' : '在线预览'}
          >
            <span className={css.actionLabel}>在线预览</span>
          </button>
          {officeKind !== 'pdf' && !mobileOfficeShell && (
            <button
              className={css.actionButton}
              type="button"
              onClick={() => openEditor('edit')}
              onFocus={warmOfficeOpen}
              onPointerDown={warmOfficeOpen}
              disabled={!canEdit || backgroundPublishing}
              title={editActionTitle}
            >
              <span className={css.actionLabel}>
                {backgroundPublishing ? '发布中…' : '在线编辑'}
              </span>
            </button>
          )}
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
        (!desktopNativeOffice || nativeWindowState === 'fallback') &&
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
                  className={`${css.editorModal} ${iosOfficeLayout ? css.iosEditorModal : ''}`}
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
                        onPointerDown={mobileOfficeShell ? handleMobileClosePointerDown : undefined}
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
                      onLoad={() => recordDiagnostic('iframe_load')}
                      onError={() => recordDiagnostic('iframe_error')}
                      title={`${session.mode === 'edit' ? '在线编辑' : '在线预览'} ${body}`}
                      allow="clipboard-read; clipboard-write"
                      sandbox={
                        mobileOfficeShell && session.mode === 'preview'
                          ? 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups'
                          : undefined
                      }
                    />
                    {passwordRequired && (
                      <div
                        className={`${css.promptBackdrop} ${
                          iosOfficeLayout ? css.iosPromptBackdrop : ''
                        }`}
                      >
                        <Box
                          as="form"
                          className={css.promptCard}
                          onSubmit={submitPassword}
                          role="dialog"
                          aria-modal="true"
                          aria-label="输入 Office 文档密码"
                        >
                          <Text size="T300">此 Office 文档已加密</Text>
                          <Text size="T200" priority="300">
                            请输入文档密码后再打开。密码仅用于本次解密，不会保存到设备或上传到聊天服务器。
                          </Text>
                          {passwordError && (
                            <Text size="T200" priority="300">
                              {isPasswordPromptError(passwordError)
                                ? '密码不正确，文档未发送到 Office 服务，请确认后重试。'
                                : passwordError}
                            </Text>
                          )}
                          <PasswordInput
                            size="400"
                            variant="Secondary"
                            autoFocus
                            name="officeDocumentPassword"
                            placeholder="请输入文档密码"
                            value={passwordInput}
                            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                              setPasswordInput(event.target.value)
                            }
                            required
                          />
                          <Box gap="200" justifyContent="End">
                            <Button
                              type="button"
                              variant="Secondary"
                              fill="Soft"
                              size="300"
                              radii="300"
                              onClick={closeModal}
                            >
                              <Text size="B300">取消</Text>
                            </Button>
                            <Button
                              type="submit"
                              variant="Primary"
                              fill="Solid"
                              size="300"
                              radii="300"
                            >
                              <Text size="B300">解密并打开</Text>
                            </Button>
                          </Box>
                        </Box>
                      </div>
                    )}
                    {phase === 'loading' && !passwordRequired && (
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
                          {mobileOfficeShell && (
                            <>
                              <Button
                                variant="Primary"
                                fill="Solid"
                                size="300"
                                radii="300"
                                onClick={sendDiagnosticReport}
                              >
                                <Text size="B300">
                                  {diagnosticSent
                                    ? '诊断信息已发送'
                                    : diagnosticSendFailed
                                    ? '发送失败，点此重试'
                                    : '发送诊断信息'}
                                </Text>
                              </Button>
                              <Button
                                variant="Secondary"
                                fill="Soft"
                                size="300"
                                radii="300"
                                onClick={copyDiagnosticReport}
                              >
                                <Text size="B300">
                                  {diagnosticCopied
                                    ? '诊断信息已复制'
                                    : diagnosticCopyFailed
                                    ? '复制失败，请长按复制'
                                    : '复制诊断信息'}
                                </Text>
                              </Button>
                            </>
                          )}
                          {!dirty && (
                            <Button
                              variant="Primary"
                              fill="Solid"
                              size="300"
                              radii="300"
                              onClick={() => openEditor(session.mode)}
                            >
                              <Text size="B300">重新打开</Text>
                            </Button>
                          )}
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
                      <div
                        className={`${css.promptBackdrop} ${
                          iosOfficeLayout ? css.iosPromptBackdrop : ''
                        }`}
                      >
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
