import { isDesktopUpdaterSupported } from './desktopUpdater';

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'ftp:', 'mailto:', 'magnet:']);
const ORIGIN_BASED_PROTOCOLS = new Set(['http:', 'https:', 'ftp:']);
const externalUrlWindows = new Map<string, Window>();
const externalUrlWindowHrefs = new Map<string, string>();
const nativeExternalWindowOpenPromises = new Map<string, Promise<void>>();

const parseExternalUrl = (href: string): URL | undefined => {
  if (typeof window === 'undefined') return undefined;

  try {
    const url = new URL(href, window.location.href);
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol)) {
      return undefined;
    }
    if (ORIGIN_BASED_PROTOCOLS.has(url.protocol) && url.origin === window.location.origin) {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
};

export const shouldOpenHrefExternally = (href?: string | null): boolean => {
  if (!href) return false;
  return Boolean(parseExternalUrl(href));
};

export const openExternalUrl = async (href: string): Promise<void> => {
  const url = parseExternalUrl(href);
  if (!url) return;

  const resolvedUrl = url.toString();

  if (isDesktopUpdaterSupported()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_external_url', { url: resolvedUrl });
    return;
  }

  const popup = window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
  if (!popup) {
    window.location.assign(resolvedUrl);
  }
};

const getExternalWindowName = (windowKey: string): string => {
  let hash = 0;
  for (let i = 0; i < windowKey.length; i += 1) {
    hash = (hash * 31 + windowKey.charCodeAt(i)) >>> 0;
  }
  return `cinny_external_${hash.toString(36)}`;
};

const getNativeExternalWindowLabel = (windowKey: string): string =>
  getExternalWindowName(windowKey).replace(/_/g, '-');

const focusExternalWindow = (popup: Window): void => {
  popup.focus();
  window.setTimeout(() => popup.focus(), 0);
  window.setTimeout(() => popup.focus(), 120);
};

const focusNativeExternalWindow = async (windowKey: string, title: string): Promise<boolean> => {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const existingWindow = await WebviewWindow.getByLabel(getNativeExternalWindowLabel(windowKey));

  if (!existingWindow) return false;

  await existingWindow.setTitle(title).catch(() => undefined);
  await existingWindow.unminimize().catch(() => undefined);
  await existingWindow.show().catch(() => undefined);
  await existingWindow.setFocus().catch(() => undefined);
  return true;
};

const openExternalUrlInNativeWindow = async (
  href: string,
  windowKey: string,
  title: string
): Promise<void> => {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const label = getNativeExternalWindowLabel(windowKey);

  if (await focusNativeExternalWindow(windowKey, title)) return;

  const pendingOpen = nativeExternalWindowOpenPromises.get(label);
  if (pendingOpen) {
    await pendingOpen;
    await focusNativeExternalWindow(windowKey, title).catch(() => undefined);
    return;
  }

  const openPromise = new Promise<void>((resolve, reject) => {
    const externalWindow = new WebviewWindow(label, {
      url: href,
      title,
      width: 1180,
      height: 820,
      minWidth: 720,
      minHeight: 520,
      resizable: true,
      center: true,
      focus: true,
      visible: true,
      dragDropEnabled: false,
    });
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

    externalWindow
      .once('tauri://created', () => settle(resolve))
      .then(trackUnlisten)
      .catch((error) => settle(() => reject(error)));
    externalWindow
      .once('tauri://error', (event: { payload: unknown }) =>
        settle(() => reject(event.payload ?? new Error('Failed to create external window.')))
      )
      .then(trackUnlisten)
      .catch((error) => settle(() => reject(error)));
  }).finally(() => {
    nativeExternalWindowOpenPromises.delete(label);
  });

  nativeExternalWindowOpenPromises.set(label, openPromise);
  await openPromise;
};

export const openExternalUrlInNewWindow = async (
  href: string,
  windowKey = href,
  title = 'Meeting'
): Promise<void> => {
  const url = parseExternalUrl(href);
  if (!url) {
    return;
  }

  const resolvedUrl = url.toString();

  if (isDesktopUpdaterSupported()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await openExternalUrlInNativeWindow(resolvedUrl, windowKey, title).catch(async () => {
      await invoke('open_external_url', { url: resolvedUrl });
    });
    return;
  }

  const windowName = getExternalWindowName(windowKey);
  const existingWindow = externalUrlWindows.get(windowKey);
  if (existingWindow && !existingWindow.closed) {
    if (externalUrlWindowHrefs.get(windowKey) !== resolvedUrl) {
      existingWindow.location.href = resolvedUrl;
      externalUrlWindowHrefs.set(windowKey, resolvedUrl);
    }
    focusExternalWindow(existingWindow);
    return;
  }

  const popup = window.open(resolvedUrl, windowName);
  if (!popup) {
    window.location.assign(resolvedUrl);
    return;
  }

  focusExternalWindow(popup);
  externalUrlWindows.set(windowKey, popup);
  externalUrlWindowHrefs.set(windowKey, resolvedUrl);
};
