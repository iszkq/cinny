import { isDesktopUpdaterSupported } from './desktopUpdater';
import type { AihubmixImageOcrConfig } from './ai';
import { fetchMediaWithAuth, shouldUseObjectUrlForMediaDisplay } from './matrix';

export type NativeImagePreviewPayload = {
  previewId: string;
  src: string;
  alt: string;
  loading?: boolean;
  canPrev?: boolean;
  canNext?: boolean;
  imageOcrConfig?: AihubmixImageOcrConfig;
};

export type NativeImagePreviewAction = {
  previewId: string;
  type: 'close' | 'prev' | 'next';
};

export type NativeImagePreviewWindowHandle = {
  label: string;
  unlistenReady: () => void;
  unlistenDestroyed: () => void;
};

type EventPayload<T> = {
  payload: T;
};

export const NATIVE_IMAGE_PREVIEW_QUERY_PARAM = 'cinnyImagePreview';
export const NATIVE_IMAGE_PREVIEW_READY_EVENT = 'cinny://image-preview-ready';
export const NATIVE_IMAGE_PREVIEW_UPDATE_EVENT = 'cinny://image-preview-update';
export const NATIVE_IMAGE_PREVIEW_ACTION_EVENT = 'cinny://image-preview-action';

const DATA_URL_RE = /^data:/i;
const BLOB_URL_RE = /^blob:/i;
const NATIVE_IMAGE_PREVIEW_READY_TIMEOUT_MS = 15_000;
let nativePreviewWindowSeq = 0;

const getNativePreviewWindowUrl = (previewId: string): string => {
  const url = new URL(window.location.href);
  const basePath = import.meta.env.BASE_URL || '/';

  url.pathname = basePath.endsWith('/') ? basePath : `${basePath}/`;
  url.search = '';
  url.hash = '';
  url.searchParams.set(NATIVE_IMAGE_PREVIEW_QUERY_PARAM, previewId);
  return url.toString();
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to serialize image blob.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image blob.'));
    reader.readAsDataURL(blob);
  });

export const isNativeImagePreviewWindow = (): boolean =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has(NATIVE_IMAGE_PREVIEW_QUERY_PARAM);

export const getNativeImagePreviewId = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  return (
    new URLSearchParams(window.location.search).get(NATIVE_IMAGE_PREVIEW_QUERY_PARAM) ?? undefined
  );
};

export const getTransferableImagePreviewSrc = async (src: string): Promise<string> => {
  if (DATA_URL_RE.test(src)) return src;
  if (!BLOB_URL_RE.test(src) && !shouldUseObjectUrlForMediaDisplay(src)) return src;

  const response = BLOB_URL_RE.test(src) ? await fetch(src) : await fetchMediaWithAuth(src);
  if (!response.ok) {
    throw new Error(`Failed to load image preview media: ${response.status}`);
  }
  const blob = await response.blob();
  return blobToDataUrl(blob);
};

export const createNativeImagePreviewId = (): string => {
  nativePreviewWindowSeq += 1;
  return `${Date.now().toString(36)}-${nativePreviewWindowSeq.toString(36)}`;
};

export const getNativeImagePreviewWindowLabel = (previewId: string): string =>
  `image-preview-${previewId}`;

const closeNativeImagePreviewWindowByLabel = async (label: string): Promise<void> => {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const previewWindow = await WebviewWindow.getByLabel(label);
  if (!previewWindow) return;

  await previewWindow.destroy().catch(async () => {
    await previewWindow.close().catch(() => undefined);
  });
};

export const openNativeImagePreviewWindow = async (
  payload: NativeImagePreviewPayload,
  signal?: AbortSignal,
  onDestroyed?: () => void
): Promise<NativeImagePreviewWindowHandle | undefined> => {
  if (!isDesktopUpdaterSupported()) return undefined;

  const [{ WebviewWindow }, { emitTo, listen }] = await Promise.all([
    import('@tauri-apps/api/webviewWindow'),
    import('@tauri-apps/api/event'),
  ]);
  const label = getNativeImagePreviewWindowLabel(payload.previewId);
  let previewWindow: InstanceType<typeof WebviewWindow> | undefined;
  let windowCreated: Promise<void> | undefined;
  let disposeWindowCreationListeners: () => void = () => undefined;
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
    NATIVE_IMAGE_PREVIEW_READY_EVENT,
    (event: EventPayload<{ previewId?: string }>) => {
      if (event.payload?.previewId !== payload.previewId) return;
      emitTo(label, NATIVE_IMAGE_PREVIEW_UPDATE_EVENT, payload)
        .then(() => settleInitialPayload(resolveInitialPayload))
        .catch((error) => settleInitialPayload(() => rejectInitialPayload(error)));
    }
  );

  try {
    if (signal?.aborted) {
      throw new Error('Image preview window opening was cancelled.');
    }

    previewWindow = new WebviewWindow(label, {
      url: getNativePreviewWindowUrl(payload.previewId),
      title: payload.alt || 'Image Preview',
      width: 1120,
      height: 820,
      minWidth: 720,
      minHeight: 520,
      resizable: true,
      decorations: false,
      center: true,
      focus: false,
      visible: false,
      dragDropEnabled: false,
    });
    const openingWindow = previewWindow;

    windowCreated = new Promise<void>((resolve, reject) => {
      let settled = false;
      let listenersDisposed = false;
      const unlisteners: Array<() => void> = [];
      const cleanup = () => {
        listenersDisposed = true;
        unlisteners.splice(0).forEach((unlisten) => unlisten());
      };
      disposeWindowCreationListeners = cleanup;
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const trackUnlisten = (unlisten: () => void) => {
        if (settled || listenersDisposed) {
          unlisten();
          return;
        }
        unlisteners.push(unlisten);
      };

      openingWindow
        .once('tauri://created', () => settle(resolve))
        .then(trackUnlisten)
        .catch((error) => settle(() => reject(error)));
      openingWindow
        .once('tauri://error', (event: EventPayload<unknown>) =>
          settle(() => reject(event.payload ?? new Error('Failed to create image preview window.')))
        )
        .then(trackUnlisten)
        .catch((error) => settle(() => reject(error)));
    });

    let unlistenDestroyed: (() => void) | undefined;
    let destroyedListenerDisposed = false;
    disposeDestroyedListener = () => {
      destroyedListenerDisposed = true;
      unlistenDestroyed?.();
      unlistenDestroyed = undefined;
    };
    const windowDestroyed = new Promise<never>((_resolve, reject) => {
      openingWindow
        .once('tauri://destroyed', () => {
          onDestroyed?.();
          reject(new Error('Image preview window closed before it was ready.'));
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

      const handleAbort = () => reject(new Error('Image preview window opening was cancelled.'));
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
          () => reject(new Error('Image preview window did not become ready in time.')),
          NATIVE_IMAGE_PREVIEW_READY_TIMEOUT_MS
        );
      });

      await Promise.race([initialPayloadDelivered, windowDestroyed, openingAborted, readyTimedOut]);

      if (signal?.aborted) {
        throw new Error('Image preview window opening was cancelled.');
      }

      await openingWindow.show();
      await openingWindow.setFocus().catch(() => undefined);
    } finally {
      if (readyTimeout !== undefined) {
        window.clearTimeout(readyTimeout);
      }
      removeAbortListener();
    }

    return {
      label,
      unlistenReady,
      unlistenDestroyed: disposeDestroyedListener,
    };
  } catch {
    unlistenReady();
    disposeDestroyedListener();

    const disposePreviewWindow = async () => {
      const currentPreviewWindow = previewWindow;
      if (currentPreviewWindow) {
        await currentPreviewWindow.close().catch(async () => {
          await currentPreviewWindow.destroy().catch(() => undefined);
        });
      }
      await closeNativeImagePreviewWindowByLabel(label).catch(() => undefined);
    };

    await disposePreviewWindow();
    if (windowCreated) {
      windowCreated
        .then(
          () => disposePreviewWindow(),
          () => disposePreviewWindow()
        )
        .catch(() => undefined);
    } else {
      disposeWindowCreationListeners();
    }
    return undefined;
  }
};

export const emitNativeImagePreviewPayload = async (
  label: string,
  payload: NativeImagePreviewPayload
): Promise<void> => {
  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo(label, NATIVE_IMAGE_PREVIEW_UPDATE_EVENT, payload);
};

export const listenNativeImagePreviewAction = async (
  previewId: string,
  onAction: (action: NativeImagePreviewAction) => void
): Promise<() => void> => {
  const { listen } = await import('@tauri-apps/api/event');
  return listen(
    NATIVE_IMAGE_PREVIEW_ACTION_EVENT,
    (event: EventPayload<NativeImagePreviewAction>) => {
      const action = event.payload;
      if (action?.previewId !== previewId) return;
      onAction(action);
    }
  );
};

export const emitNativeImagePreviewReady = async (previewId: string): Promise<void> => {
  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo('main', NATIVE_IMAGE_PREVIEW_READY_EVENT, { previewId });
};

export const emitNativeImagePreviewAction = async (
  action: NativeImagePreviewAction
): Promise<void> => {
  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo('main', NATIVE_IMAGE_PREVIEW_ACTION_EVENT, action);
};

export const closeNativeImagePreviewWindow = closeNativeImagePreviewWindowByLabel;
