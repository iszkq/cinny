import { isDesktopUpdaterSupported } from './desktopUpdater';

export type NativeImagePreviewPayload = {
  previewId: string;
  src: string;
  alt: string;
  loading?: boolean;
  canPrev?: boolean;
  canNext?: boolean;
};

export type NativeImagePreviewAction = {
  previewId: string;
  type: 'close' | 'prev' | 'next';
};

export type NativeImagePreviewWindowHandle = {
  label: string;
  unlistenReady: () => void;
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
  if (!BLOB_URL_RE.test(src)) return src;

  const response = await fetch(src);
  const blob = await response.blob();
  return blobToDataUrl(blob);
};

export const createNativeImagePreviewId = (): string => {
  nativePreviewWindowSeq += 1;
  return `${Date.now().toString(36)}-${nativePreviewWindowSeq.toString(36)}`;
};

export const getNativeImagePreviewWindowLabel = (previewId: string): string =>
  `image-preview-${previewId}`;

export const openNativeImagePreviewWindow = async (
  payload: NativeImagePreviewPayload
): Promise<NativeImagePreviewWindowHandle | undefined> => {
  if (!isDesktopUpdaterSupported()) return undefined;

  const [{ WebviewWindow }, { emitTo, listen }] = await Promise.all([
    import('@tauri-apps/api/webviewWindow'),
    import('@tauri-apps/api/event'),
  ]);
  const label = getNativeImagePreviewWindowLabel(payload.previewId);

  const unlistenReady = await listen(
    NATIVE_IMAGE_PREVIEW_READY_EVENT,
    (event: EventPayload<{ previewId?: string }>) => {
      if (event.payload?.previewId !== payload.previewId) return;
      void emitTo(label, NATIVE_IMAGE_PREVIEW_UPDATE_EVENT, payload);
    }
  );

  try {
    const previewWindow = new WebviewWindow(label, {
      url: getNativePreviewWindowUrl(payload.previewId),
      title: payload.alt || 'Image Preview',
      width: 1120,
      height: 820,
      minWidth: 720,
      minHeight: 520,
      resizable: true,
      decorations: false,
      center: true,
      focus: true,
      visible: true,
      dragDropEnabled: false,
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const unlisteners: Array<() => void> = [];
      const cleanup = () => unlisteners.splice(0).forEach((unlisten) => unlisten());
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const trackUnlisten = (unlisten: () => void) => {
        if (settled) {
          unlisten();
          return;
        }
        unlisteners.push(unlisten);
      };

      previewWindow
        .once('tauri://created', () => settle(resolve))
        .then(trackUnlisten)
        .catch((error) => settle(() => reject(error)));
      previewWindow
        .once('tauri://error', (event: EventPayload<unknown>) =>
          settle(() => reject(event.payload ?? new Error('Failed to create image preview window.')))
        )
        .then(trackUnlisten)
        .catch((error) => settle(() => reject(error)));
    });

    return {
      label,
      unlistenReady,
    };
  } catch {
    unlistenReady();
    await closeNativeImagePreviewWindow(label).catch(() => undefined);
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

export const closeNativeImagePreviewWindow = async (label: string): Promise<void> => {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const previewWindow = await WebviewWindow.getByLabel(label);
  await previewWindow?.close();
};
