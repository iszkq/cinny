/* eslint-disable import/first */
import './polyfills';
import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { enableMapSet } from 'immer';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import { configClass, varsClass } from 'folds';

enableMapSet();

import './index.css';

import { trimTrailingSlash } from './app/utils/common';
// import i18n (needs to be bundled ;))
import './app/i18n';
import { pushSessionToSW } from './sw-session';
import { getFallbackSession } from './app/state/sessions';
import { isDesktopUpdaterSupported } from './app/utils/desktopUpdater';
import { applyDesktopStartupPinLock } from './app/utils/pinLock';
import { isNativeImagePreviewWindow } from './app/utils/nativeImagePreview';
import { isNativeBibleWindow } from './app/utils/nativeBibleWindow';
import { initializePWAInstall } from './app/utils/pwaInstall';
import { initializeAndroidAppShell, isAndroidApp } from './app/utils/nativePlatform';
import { DownloadPage } from './app/pages/download';

document.body.classList.add(configClass, varsClass);

const retryingStylesheets = new WeakSet<HTMLLinkElement>();

const retryFailedStylesheet = (link: HTMLLinkElement) => {
  if (retryingStylesheets.has(link)) return;

  retryingStylesheets.add(link);
  const retryLink = link.cloneNode(false) as HTMLLinkElement;
  const retryUrl = new URL(link.href, window.location.href);
  retryUrl.searchParams.set('cinny-style-retry', Date.now().toString());
  retryLink.href = retryUrl.href;

  retryLink.addEventListener(
    'load',
    () => {
      link.remove();
      document.documentElement.dataset.cinnyStylesRecovered = 'true';
    },
    { once: true }
  );
  retryLink.addEventListener(
    'error',
    () => {
      retryLink.remove();
      retryingStylesheets.delete(link);
    },
    { once: true }
  );

  link.after(retryLink);
};

const recoverFailedStylesheets = () => {
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]').forEach((link) => {
    if (link.sheet === null) retryFailedStylesheet(link);
  });
};

document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]').forEach((link) => {
  link.addEventListener('error', () => retryFailedStylesheet(link), { once: true });
});

if (document.readyState === 'complete') {
  window.setTimeout(recoverFailedStylesheets, 0);
} else {
  window.addEventListener('load', () => recoverFailedStylesheets(), { once: true });
}
window.addEventListener('pageshow', () => window.setTimeout(recoverFailedStylesheets, 250));
window.addEventListener('online', recoverFailedStylesheets);

const LazyNativeImagePreviewWindow = lazy(async () => ({
  default: (await import('./app/components/image-viewer/NativeImagePreviewWindow'))
    .NativeImagePreviewWindow,
}));
const LazyNativeBibleWindow = lazy(async () => ({
  default: (await import('./app/components/bible/NativeBibleWindow')).NativeBibleWindow,
}));
const LazyApp = lazy(() => import('./app/pages/App'));

function RootStartupFallback() {
  return (
    <div
      style={{
        width: '100%',
        height: 'var(--app-height, 100dvh)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      aria-busy="true"
    >
      Loading...
    </div>
  );
}

const nativeImagePreviewWindow = isDesktopUpdaterSupported() && isNativeImagePreviewWindow();
const nativeBibleWindow = isDesktopUpdaterSupported() && isNativeBibleWindow();
const desktopSubWindow = nativeImagePreviewWindow || nativeBibleWindow;
const fallbackSession = desktopSubWindow ? undefined : getFallbackSession();
const webDownloadPage = /(?:^|\/)download\/?$/i.test(window.location.pathname);

initializePWAInstall();
initializeAndroidAppShell().catch(() => undefined);

if (isDesktopUpdaterSupported() && !desktopSubWindow) {
  document.documentElement.dataset.cinnyDesktopApp = 'true';
  applyDesktopStartupPinLock(fallbackSession?.baseUrl, fallbackSession?.userId);
}

// Register Service Worker
if (!desktopSubWindow && !isAndroidApp() && 'serviceWorker' in navigator) {
  const swUrl =
    import.meta.env.MODE === 'production'
      ? `${trimTrailingSlash(import.meta.env.BASE_URL)}/sw.js`
      : `/dev-sw.js?dev-sw`;

  const sendSessionToSW = () => {
    const session = getFallbackSession();
    pushSessionToSW(session?.baseUrl, session?.accessToken, session?.userId);
  };

  navigator.serviceWorker.register(swUrl).then(sendSessionToSW);
  navigator.serviceWorker.ready.then(sendSessionToSW);
  navigator.serviceWorker.addEventListener('controllerchange', sendSessionToSW);
  window.addEventListener('focus', sendSessionToSW);
  window.addEventListener('online', sendSessionToSW);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      sendSessionToSW();
    }
  });

  navigator.serviceWorker.addEventListener('message', (ev) => {
    const { type } = ev.data ?? {};

    if (type === 'requestSession') {
      sendSessionToSW();
    }
  });
}

const renderRootApp = () => {
  if (webDownloadPage) return <DownloadPage />;

  if (nativeImagePreviewWindow) {
    return (
      <Suspense fallback={<RootStartupFallback />}>
        <LazyNativeImagePreviewWindow />
      </Suspense>
    );
  }

  if (nativeBibleWindow) {
    return (
      <Suspense fallback={<RootStartupFallback />}>
        <LazyNativeBibleWindow />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<RootStartupFallback />}>
      <LazyApp />
    </Suspense>
  );
};

const mountApp = () => {
  const rootContainer = document.getElementById('root');

  if (rootContainer === null) {
    console.error('Root container element not found!');
    return;
  }

  const root = createRoot(rootContainer);
  root.render(renderRootApp());
};

mountApp();
