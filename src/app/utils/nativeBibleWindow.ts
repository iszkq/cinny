import { isDesktopUpdaterSupported } from './desktopUpdater';

type EventPayload<T> = {
  payload: T;
};

export const NATIVE_BIBLE_QUERY_PARAM = 'cinnyBibleWindow';
export const NATIVE_BIBLE_WINDOW_LABEL = 'bible-window';
export const NATIVE_BIBLE_CLOSE_EVENT = 'cinny://bible-window-close';

let openNativeBibleWindowPromise: Promise<void> | undefined;

const getNativeBibleWindowUrl = (): string => {
  const url = new URL(window.location.href);
  const basePath = import.meta.env.BASE_URL || '/';

  url.pathname = basePath.endsWith('/') ? basePath : `${basePath}/`;
  url.search = '';
  url.hash = '';
  url.searchParams.set(NATIVE_BIBLE_QUERY_PARAM, '1');

  return url.toString();
};

export const isNativeBibleWindow = (): boolean =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has(NATIVE_BIBLE_QUERY_PARAM);

export const openNativeBibleWindow = async (): Promise<void> => {
  if (!isDesktopUpdaterSupported()) return;
  if (openNativeBibleWindowPromise) return openNativeBibleWindowPromise;

  openNativeBibleWindowPromise = (async () => {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const existingWindow = await WebviewWindow.getByLabel(NATIVE_BIBLE_WINDOW_LABEL);

    if (existingWindow) {
      await existingWindow.unminimize().catch(() => undefined);
      await existingWindow.show().catch(() => undefined);
      await existingWindow.setFocus().catch(() => undefined);
      return;
    }

    const bibleWindow = new WebviewWindow(NATIVE_BIBLE_WINDOW_LABEL, {
      url: getNativeBibleWindowUrl(),
      title: '圣经',
      width: 1120,
      height: 820,
      minWidth: 860,
      minHeight: 620,
      resizable: true,
      decorations: true,
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

      bibleWindow
        .once('tauri://created', () => settle(resolve))
        .then(trackUnlisten)
        .catch((error) => settle(() => reject(error)));
      bibleWindow
        .once('tauri://error', (event: EventPayload<unknown>) =>
          settle(() => reject(event.payload ?? new Error('Failed to create Bible window.')))
        )
        .then(trackUnlisten)
        .catch((error) => settle(() => reject(error)));
    });
  })().finally(() => {
    openNativeBibleWindowPromise = undefined;
  });

  return openNativeBibleWindowPromise;
};

export const listenNativeBibleWindowClose = async (onClose: () => void): Promise<() => void> => {
  const { listen } = await import('@tauri-apps/api/event');
  return listen(NATIVE_BIBLE_CLOSE_EVENT, () => onClose());
};

export const emitNativeBibleWindowClose = async (): Promise<void> => {
  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo('main', NATIVE_BIBLE_CLOSE_EVENT, {});
};

export const closeNativeBibleWindow = async (): Promise<void> => {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const bibleWindow = await WebviewWindow.getByLabel(NATIVE_BIBLE_WINDOW_LABEL);
  await bibleWindow?.close();
};
