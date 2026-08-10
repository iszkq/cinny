import { isDesktopUpdaterSupported } from './desktopUpdater';

type EventPayload<T> = {
  payload: T;
};

type NativeBibleClosePayload = {
  windowId?: string;
};

type NativeBibleWindowRef = {
  id: string;
  label: string;
};

export const NATIVE_BIBLE_QUERY_PARAM = 'cinnyBibleWindow';
export const NATIVE_BIBLE_WINDOW_LABEL = 'bible-window';
export const NATIVE_BIBLE_CLOSE_EVENT = 'cinny://bible-window-close';

// Keep the native Bible window above the desktop-layout breakpoint so the
// reader and tool panel stay in the side-by-side arrangement.
const NATIVE_BIBLE_DESKTOP_MIN_WIDTH = 1180;
const NATIVE_BIBLE_WINDOW_OPEN_TIMEOUT_MS = 15_000;

let openNativeBibleWindowPromise: Promise<void> | undefined;
let activeNativeBibleWindow: NativeBibleWindowRef | undefined;
let latestNativeBibleWindowId: string | undefined;
let nativeBibleWindowSequence = 0;
let nativeBibleWindowOperation = 0;

const getNativeBibleWindowUrl = (windowId: string): string => {
  const url = new URL(window.location.href);
  const basePath = import.meta.env.BASE_URL || '/';

  url.pathname = basePath.endsWith('/') ? basePath : `${basePath}/`;
  url.search = '';
  url.hash = '';
  url.searchParams.set(NATIVE_BIBLE_QUERY_PARAM, windowId);

  return url.toString();
};

export const isNativeBibleWindow = (): boolean =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has(NATIVE_BIBLE_QUERY_PARAM);

export const getNativeBibleWindowId = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get(NATIVE_BIBLE_QUERY_PARAM) ?? undefined;
};

const createNativeBibleWindowRef = (): NativeBibleWindowRef => {
  nativeBibleWindowSequence += 1;
  const id = `${Date.now().toString(36)}-${nativeBibleWindowSequence.toString(36)}`;
  return {
    id,
    label: `${NATIVE_BIBLE_WINDOW_LABEL}-${id}`,
  };
};

const destroyNativeBibleWindowByLabel = async (label: string): Promise<void> => {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const bibleWindow = await WebviewWindow.getByLabel(label);
  if (!bibleWindow) return;

  await bibleWindow.destroy().catch(async () => {
    await bibleWindow.close().catch(() => undefined);
  });
};

export const openNativeBibleWindow = async (): Promise<void> => {
  if (!isDesktopUpdaterSupported()) return;
  if (openNativeBibleWindowPromise) {
    await openNativeBibleWindowPromise;
    return;
  }

  const operation = ++nativeBibleWindowOperation;
  let openingWindow: NativeBibleWindowRef | undefined;

  openNativeBibleWindowPromise = (async () => {
    const [{ WebviewWindow }, { emitTo }] = await Promise.all([
      import('@tauri-apps/api/webviewWindow'),
      import('@tauri-apps/api/event'),
    ]);
    const existingRef = activeNativeBibleWindow;
    const existingWindow = existingRef
      ? await WebviewWindow.getByLabel(existingRef.label)
      : undefined;

    if (existingRef && existingWindow) {
      try {
        await existingWindow.unminimize();
        await existingWindow.show();
        await existingWindow.setFocus();
        if (operation !== nativeBibleWindowOperation) {
          await existingWindow.destroy().catch(() => undefined);
          throw new Error('Bible window opening was cancelled.');
        }
        return;
      } catch {
        // Windows may briefly retain a destroyed WebView in Tauri's label registry. A failed
        // reveal must create a replacement instead of being reported as a successful open.
        await existingWindow.destroy().catch(() => undefined);
      }
    }
    if (activeNativeBibleWindow?.id === existingRef?.id) {
      activeNativeBibleWindow = undefined;
    }

    if (operation !== nativeBibleWindowOperation) {
      throw new Error('Bible window opening was cancelled.');
    }

    const nextWindow = createNativeBibleWindowRef();
    openingWindow = nextWindow;
    activeNativeBibleWindow = nextWindow;
    latestNativeBibleWindowId = nextWindow.id;

    const bibleWindow = new WebviewWindow(nextWindow.label, {
      url: getNativeBibleWindowUrl(nextWindow.id),
      title: '\u5723\u7ecf',
      width: 1320,
      height: 900,
      minWidth: NATIVE_BIBLE_DESKTOP_MIN_WIDTH,
      minHeight: 720,
      resizable: true,
      decorations: false,
      transparent: true,
      shadow: true,
      center: true,
      focus: false,
      visible: false,
      dragDropEnabled: false,
    });

    void bibleWindow
      .once('tauri://destroyed', () => {
        if (activeNativeBibleWindow?.id === nextWindow.id) {
          activeNativeBibleWindow = undefined;
        }
        emitTo('main', NATIVE_BIBLE_CLOSE_EVENT, { windowId: nextWindow.id }).catch(
          () => undefined
        );
      })
      .catch(() => undefined);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const unlisteners: Array<() => void> = [];
      let timeoutId: number | undefined;

      const cleanup = () => {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        unlisteners.splice(0).forEach((unlisten) => unlisten());
      };
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

      timeoutId = window.setTimeout(
        () => settle(() => reject(new Error('Bible window did not open in time.'))),
        NATIVE_BIBLE_WINDOW_OPEN_TIMEOUT_MS
      );
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

    if (operation !== nativeBibleWindowOperation || activeNativeBibleWindow?.id !== nextWindow.id) {
      await destroyNativeBibleWindowByLabel(nextWindow.label);
      throw new Error('Bible window opening was cancelled.');
    }

    await bibleWindow.show();
    await bibleWindow.setFocus();
  })()
    .catch(async (error) => {
      if (openingWindow && activeNativeBibleWindow?.id === openingWindow.id) {
        activeNativeBibleWindow = undefined;
      }
      if (openingWindow) {
        await destroyNativeBibleWindowByLabel(openingWindow.label).catch(() => undefined);
      }
      throw error;
    })
    .finally(() => {
      openNativeBibleWindowPromise = undefined;
    });

  await openNativeBibleWindowPromise;
};

export const listenNativeBibleWindowClose = async (onClose: () => void): Promise<() => void> => {
  const { listen } = await import('@tauri-apps/api/event');
  return listen(NATIVE_BIBLE_CLOSE_EVENT, (event: EventPayload<NativeBibleClosePayload>) => {
    const { windowId } = event.payload ?? {};
    // Closing WebViews can finish page-lifecycle work after a replacement has opened. Only the
    // newest Bible session may update the main-window state.
    if (!windowId || windowId !== latestNativeBibleWindowId) return;
    if (activeNativeBibleWindow?.id === windowId) {
      activeNativeBibleWindow = undefined;
      nativeBibleWindowOperation += 1;
    }
    onClose();
  });
};

export const emitNativeBibleWindowClose = async (): Promise<void> => {
  const windowId = getNativeBibleWindowId();
  if (!windowId) return;

  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo('main', NATIVE_BIBLE_CLOSE_EVENT, { windowId });
};

export const closeNativeBibleWindow = async (): Promise<void> => {
  nativeBibleWindowOperation += 1;
  const bibleWindow = activeNativeBibleWindow;
  activeNativeBibleWindow = undefined;
  if (!bibleWindow) return;

  await destroyNativeBibleWindowByLabel(bibleWindow.label);
};
