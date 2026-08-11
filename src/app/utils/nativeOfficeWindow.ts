import { isDesktopUpdaterSupported } from './desktopUpdater';

export type OfficeEditorMode = 'preview' | 'edit';
export type OfficeEditorPhase =
  | 'loading'
  | 'ready'
  | 'saving'
  | 'uploading'
  | 'publishing'
  | 'saved'
  | 'error';

export type NativeOfficeBinaryDescriptor = {
  token: string;
  byteLength: number;
};

export type NativeOfficeWindowPayload = {
  sessionId: string;
  requestId: string;
  mode: OfficeEditorMode;
  src: string;
  body: string;
  mimeType: string;
  iconLabel: string;
  iconColor: string;
  phase: OfficeEditorPhase;
  dirty: boolean;
  showClosePrompt: boolean;
  legacyRetryBlocked: boolean;
  errorMessage?: string;
  password?: string;
  passwordRequired?: boolean;
  passwordError?: string;
  sourceBinary?: NativeOfficeBinaryDescriptor;
};

export type NativeOfficeBridgeMessage = {
  type?: string;
  requestId?: string;
  saveId?: string;
  dirty?: boolean;
  fileName?: string;
  mimeType?: string;
  message?: string;
  passwordRequired?: boolean;
  binary?: NativeOfficeBinaryDescriptor;
};

export type NativeOfficeWindowAction =
  | {
      type: 'bridge';
      sessionId: string;
      requestId: string;
      message: NativeOfficeBridgeMessage;
    }
  | {
      type:
        | 'save'
        | 'save-close'
        | 'close'
        | 'discard'
        | 'continue-editing'
        | 'source-consumed'
        | 'retry-open';
      sessionId: string;
      requestId: string;
    }
  | {
      type: 'submit-password';
      sessionId: string;
      requestId: string;
      password: string;
    }
  | {
      type: 'native-error';
      sessionId: string;
      requestId: string;
      message: string;
    };

export type NativeOfficeWindowCommand =
  | {
      type: 'bridge';
      sessionId: string;
      requestId: string;
      message: {
        type: string;
        saveId?: string;
      };
    }
  | {
      type: 'close';
      sessionId: string;
      requestId: string;
    };

export type NativeOfficeWindowHandle = {
  label: string;
  sessionId: string;
  unlistenReady: () => void;
  unlistenDestroyed: () => void;
};

type EventPayload<T> = {
  payload: T;
};

export const NATIVE_OFFICE_QUERY_PARAM = 'cinnyOfficeWindow';
export const NATIVE_OFFICE_REQUEST_QUERY_PARAM = 'cinnyOfficeRequest';
export const NATIVE_OFFICE_WINDOW_LABEL_PREFIX = 'office-window-';
export const NATIVE_OFFICE_READY_EVENT = 'cinny://office-window-ready';
export const NATIVE_OFFICE_UPDATE_EVENT = 'cinny://office-window-update';
export const NATIVE_OFFICE_ACTION_EVENT = 'cinny://office-window-action';
export const NATIVE_OFFICE_COMMAND_EVENT = 'cinny://office-window-command';

const NATIVE_OFFICE_READY_TIMEOUT_MS = 15_000;
const OFFICE_SESSION_HEADER = 'x-cinny-office-session';
const latestNativeOfficePayloads = new Map<string, NativeOfficeWindowPayload>();

const getNativeOfficeWindowUrl = (sessionId: string, requestId: string): string => {
  const url = new URL(window.location.href);
  const basePath = import.meta.env.BASE_URL || '/';

  url.pathname = basePath.endsWith('/') ? basePath : `${basePath}/`;
  url.search = '';
  url.hash = '';
  url.searchParams.set(NATIVE_OFFICE_QUERY_PARAM, sessionId);
  url.searchParams.set(NATIVE_OFFICE_REQUEST_QUERY_PARAM, requestId);
  return url.toString();
};

export const isNativeOfficeWindow = (): boolean =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has(NATIVE_OFFICE_QUERY_PARAM);

export const getNativeOfficeSessionId = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get(NATIVE_OFFICE_QUERY_PARAM) ?? undefined;
};

export const getNativeOfficeRequestId = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  return (
    new URLSearchParams(window.location.search).get(NATIVE_OFFICE_REQUEST_QUERY_PARAM) ?? undefined
  );
};

export const getNativeOfficeWindowLabel = (sessionId: string): string =>
  `${NATIVE_OFFICE_WINDOW_LABEL_PREFIX}${sessionId}`;

const closeNativeOfficeWindowByLabel = async (label: string): Promise<void> => {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const officeWindow = await WebviewWindow.getByLabel(label);
  if (!officeWindow) return;

  await officeWindow.destroy().catch(async () => {
    await officeWindow.close().catch(() => undefined);
  });
};

export const openNativeOfficeWindow = async (
  payload: NativeOfficeWindowPayload,
  signal?: AbortSignal,
  onDestroyed?: () => void
): Promise<NativeOfficeWindowHandle | undefined> => {
  if (!isDesktopUpdaterSupported()) return undefined;

  latestNativeOfficePayloads.set(payload.sessionId, payload);
  const [{ WebviewWindow }, { emitTo, listen }] = await Promise.all([
    import('@tauri-apps/api/webviewWindow'),
    import('@tauri-apps/api/event'),
  ]);
  const label = getNativeOfficeWindowLabel(payload.sessionId);
  let officeWindow: InstanceType<typeof WebviewWindow> | undefined;
  let unlistenDestroyed: (() => void) | undefined;
  let disposeCreatedListeners: () => void = () => undefined;
  let disposeDestroyedListener: () => void = () => undefined;

  let initialPayloadSettled = false;
  let resolveInitialPayload: () => void = () => undefined;
  let rejectInitialPayload: (reason?: unknown) => void = () => undefined;
  const initialPayloadDelivered = new Promise<void>((resolve, reject) => {
    resolveInitialPayload = resolve;
    rejectInitialPayload = reject;
  });
  const settleInitialPayload = (callback: () => void) => {
    if (initialPayloadSettled) return;
    initialPayloadSettled = true;
    callback();
  };

  const unlistenReady = await listen(
    NATIVE_OFFICE_READY_EVENT,
    (event: EventPayload<{ sessionId?: string; requestId?: string }>) => {
      if (
        event.payload?.sessionId !== payload.sessionId ||
        event.payload?.requestId !== payload.requestId
      ) {
        return;
      }

      emitTo(
        label,
        NATIVE_OFFICE_UPDATE_EVENT,
        latestNativeOfficePayloads.get(payload.sessionId) ?? payload
      )
        .then(() => settleInitialPayload(resolveInitialPayload))
        .catch((error) => settleInitialPayload(() => rejectInitialPayload(error)));
    }
  );

  try {
    if (signal?.aborted) throw new Error('Office window opening was cancelled.');

    officeWindow = new WebviewWindow(label, {
      url: getNativeOfficeWindowUrl(payload.sessionId, payload.requestId),
      title: payload.body || 'Office',
      width: 1260,
      height: 860,
      minWidth: 760,
      minHeight: 520,
      resizable: true,
      decorations: false,
      center: true,
      focus: false,
      visible: false,
      dragDropEnabled: false,
    });
    const openingWindow = officeWindow;

    const windowCreated = new Promise<void>((resolve, reject) => {
      let settled = false;
      let disposed = false;
      const unlisteners: Array<() => void> = [];
      const cleanup = () => {
        disposed = true;
        unlisteners.splice(0).forEach((unlisten) => unlisten());
      };
      disposeCreatedListeners = cleanup;
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const track = (unlisten: () => void) => {
        if (settled || disposed) {
          unlisten();
          return;
        }
        unlisteners.push(unlisten);
      };

      openingWindow
        .once('tauri://created', () => settle(resolve))
        .then(track)
        .catch(reject);
      openingWindow
        .once('tauri://error', (event: EventPayload<unknown>) =>
          settle(() => reject(event.payload ?? new Error('Failed to create Office window.')))
        )
        .then(track)
        .catch(reject);
    });

    let destroyedListenerDisposed = false;
    disposeDestroyedListener = () => {
      destroyedListenerDisposed = true;
      unlistenDestroyed?.();
      unlistenDestroyed = undefined;
    };
    const windowDestroyed = new Promise<never>((_resolve, reject) => {
      openingWindow
        .once('tauri://destroyed', () => {
          latestNativeOfficePayloads.delete(payload.sessionId);
          onDestroyed?.();
          reject(new Error('Office window closed before it was ready.'));
        })
        .then((nextUnlisten) => {
          if (destroyedListenerDisposed) {
            nextUnlisten();
            return;
          }
          unlistenDestroyed = nextUnlisten;
        })
        .catch(reject);
    });

    let removeAbortListener: () => void = () => undefined;
    const openingAborted = new Promise<never>((_resolve, reject) => {
      if (!signal) return;
      const handleAbort = () => reject(new Error('Office window opening was cancelled.'));
      if (signal.aborted) {
        handleAbort();
        return;
      }
      signal.addEventListener('abort', handleAbort, { once: true });
      removeAbortListener = () => signal.removeEventListener('abort', handleAbort);
    });

    let readyTimeout: number | undefined;
    try {
      await Promise.race([windowCreated, windowDestroyed, openingAborted]);
      const readyTimedOut = new Promise<never>((_resolve, reject) => {
        readyTimeout = window.setTimeout(
          () => reject(new Error('Office window did not become ready in time.')),
          NATIVE_OFFICE_READY_TIMEOUT_MS
        );
      });
      await Promise.race([initialPayloadDelivered, windowDestroyed, openingAborted, readyTimedOut]);
      if (signal?.aborted) throw new Error('Office window opening was cancelled.');

      await openingWindow.show();
      await openingWindow.setFocus().catch(() => undefined);
    } finally {
      if (readyTimeout !== undefined) window.clearTimeout(readyTimeout);
      removeAbortListener();
    }

    return {
      label,
      sessionId: payload.sessionId,
      unlistenReady,
      unlistenDestroyed: disposeDestroyedListener,
    };
  } catch {
    unlistenReady();
    disposeDestroyedListener();
    disposeCreatedListeners();
    latestNativeOfficePayloads.delete(payload.sessionId);
    await closeNativeOfficeWindowByLabel(label).catch(() => undefined);
    return undefined;
  }
};

export const emitNativeOfficePayload = async (
  label: string,
  payload: NativeOfficeWindowPayload
): Promise<void> => {
  latestNativeOfficePayloads.set(payload.sessionId, payload);
  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo(label, NATIVE_OFFICE_UPDATE_EVENT, payload);
};

export const emitNativeOfficeCommand = async (
  label: string,
  command: NativeOfficeWindowCommand
): Promise<void> => {
  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo(label, NATIVE_OFFICE_COMMAND_EVENT, command);
};

export const listenNativeOfficeAction = async (
  sessionId: string,
  requestId: string,
  onAction: (action: NativeOfficeWindowAction) => void
): Promise<() => void> => {
  const { listen } = await import('@tauri-apps/api/event');
  return listen(NATIVE_OFFICE_ACTION_EVENT, (event: EventPayload<NativeOfficeWindowAction>) => {
    const action = event.payload;
    if (action?.sessionId !== sessionId || action?.requestId !== requestId) return;
    onAction(action);
  });
};

export const listenNativeOfficePayload = async (
  sessionId: string,
  requestId: string,
  onPayload: (payload: NativeOfficeWindowPayload) => void
): Promise<() => void> => {
  const { listen } = await import('@tauri-apps/api/event');
  return listen(NATIVE_OFFICE_UPDATE_EVENT, (event: EventPayload<NativeOfficeWindowPayload>) => {
    const { payload } = event;
    if (payload?.sessionId !== sessionId || payload.requestId !== requestId) return;
    onPayload(payload);
  });
};

export const listenNativeOfficeCommand = async (
  sessionId: string,
  requestId: string,
  onCommand: (command: NativeOfficeWindowCommand) => void
): Promise<() => void> => {
  const { listen } = await import('@tauri-apps/api/event');
  return listen(NATIVE_OFFICE_COMMAND_EVENT, (event: EventPayload<NativeOfficeWindowCommand>) => {
    const command = event.payload;
    if (command?.sessionId !== sessionId || command?.requestId !== requestId) return;
    onCommand(command);
  });
};

export const emitNativeOfficeReady = async (
  sessionId: string,
  requestId: string
): Promise<void> => {
  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo('main', NATIVE_OFFICE_READY_EVENT, { sessionId, requestId });
};

export const emitNativeOfficeAction = async (action: NativeOfficeWindowAction): Promise<void> => {
  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo('main', NATIVE_OFFICE_ACTION_EVENT, action);
};

export const writeNativeOfficeBinary = async (
  sessionId: string,
  buffer: ArrayBuffer
): Promise<NativeOfficeBinaryDescriptor> => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<NativeOfficeBinaryDescriptor>('write_office_session_binary', buffer, {
    headers: { [OFFICE_SESSION_HEADER]: sessionId },
  });
};

export const consumeNativeOfficeBinary = async (
  sessionId: string,
  token: string
): Promise<ArrayBuffer> => {
  const { invoke } = await import('@tauri-apps/api/core');
  const result = await invoke<ArrayBuffer | Uint8Array | number[]>(
    'consume_office_session_binary',
    { request: { sessionId, token } }
  );
  if (result instanceof ArrayBuffer) return result;
  if (result instanceof Uint8Array) {
    return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
  }
  if (Array.isArray(result)) return Uint8Array.from(result).buffer;
  throw new Error('Office session binary response is invalid.');
};

export const clearNativeOfficeBinaries = async (sessionId: string): Promise<void> => {
  latestNativeOfficePayloads.delete(sessionId);
  if (!isDesktopUpdaterSupported()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('clear_office_session_binaries', { request: { sessionId } }).catch(() => undefined);
};

export const closeNativeOfficeWindow = async (sessionId: string): Promise<void> => {
  latestNativeOfficePayloads.delete(sessionId);
  await closeNativeOfficeWindowByLabel(getNativeOfficeWindowLabel(sessionId));
};
