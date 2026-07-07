import { isDesktopUpdaterSupported } from './desktopUpdater';

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'ftp:', 'mailto:', 'magnet:']);
const ORIGIN_BASED_PROTOCOLS = new Set(['http:', 'https:', 'ftp:']);
const externalUrlWindows = new Map<string, Window>();

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

export const openExternalUrlInNewWindow = async (
  href: string,
  windowKey = href
): Promise<void> => {
  const url = parseExternalUrl(href);
  if (!url) {
    return;
  }

  const resolvedUrl = url.toString();

  if (isDesktopUpdaterSupported()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_external_url', { url: resolvedUrl });
    return;
  }

  const existingWindow = externalUrlWindows.get(windowKey);
  if (existingWindow && !existingWindow.closed) {
    existingWindow.focus();
    return;
  }

  const popup = window.open(resolvedUrl, getExternalWindowName(windowKey));
  if (popup) {
    popup.opener = null;
    popup.focus();
    externalUrlWindows.set(windowKey, popup);
  }
};
