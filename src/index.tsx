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

const RESOURCE_RECOVERY_KEY = 'cinny-resource-recovery-attempt';
const RESOURCE_RECOVERY_COOLDOWN = 60_000;
const STARTUP_RECOVERY_DELAY_MS = 15_000;
let resourceReloadScheduled = false;

const isResourceLoadError = (error: unknown): boolean => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /dynamically imported module|importing a module script failed|loading chunk|chunkloaderror|failed to fetch.*module|module script|module.*(?:load|fetch)|unable to preload css|preload.*css|css.*(?:load|fetch)|模块.*加载|网络错误/i.test(
    message
  );
};

const clearBrowserResourceCaches = async () => {
  const clearCacheStorage = async () => {
    if (!('caches' in window)) return;

    const cacheKeys = await window.caches.keys().catch(() => []);
    await Promise.all(cacheKeys.map((key) => window.caches.delete(key).catch(() => false)));
  };

  const unregisterServiceWorkers = async () => {
    if (!('serviceWorker' in navigator)) return;

    const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.all(registrations.map((registration) => registration.unregister()));
  };

  await Promise.all([clearCacheStorage(), unregisterServiceWorkers()]);
};

const navigateToFreshResources = () => {
  const recoveryUrl = new URL(window.location.href);
  recoveryUrl.searchParams.set('cinny-recovery', Date.now().toString());
  window.location.replace(recoveryUrl);
};

const recentlyAttemptedResourceRecovery = (): boolean => {
  try {
    const attemptedAt = Number(window.sessionStorage.getItem(RESOURCE_RECOVERY_KEY));
    return Number.isFinite(attemptedAt) && Date.now() - attemptedAt < RESOURCE_RECOVERY_COOLDOWN;
  } catch {
    return resourceReloadScheduled;
  }
};

const markResourceRecoveryAttempt = () => {
  resourceReloadScheduled = true;
  try {
    window.sessionStorage.setItem(RESOURCE_RECOVERY_KEY, Date.now().toString());
  } catch {
    // sessionStorage can be unavailable in privacy-restricted webviews.
  }
};

const resetResourceRecoveryAttempt = () => {
  resourceReloadScheduled = false;
  try {
    window.sessionStorage.removeItem(RESOURCE_RECOVERY_KEY);
  } catch {
    // sessionStorage can be unavailable in privacy-restricted webviews.
  }
};

const reloadWithFreshResources = async () => {
  resetResourceRecoveryAttempt();
  await clearBrowserResourceCaches();
  navigateToFreshResources();
};

const recoverResourceLoad = async <T,>(error: unknown): Promise<T> => {
  if (
    !isResourceLoadError(error) ||
    resourceReloadScheduled ||
    recentlyAttemptedResourceRecovery()
  ) {
    throw error;
  }

  markResourceRecoveryAttempt();
  await clearBrowserResourceCaches();
  navigateToFreshResources();
  return new Promise<T>(() => {
    // Keep React suspended while the browser begins navigating to the fresh page.
  });
};

const loadLazyModule = async <T,>(loader: () => Promise<T>): Promise<T> => {
  try {
    return await loader();
  } catch (error) {
    return recoverResourceLoad<T>(error);
  }
};

const recoverUnhandledResourceLoad = (error: unknown) => {
  if (!isResourceLoadError(error)) return;
  recoverResourceLoad(error).catch(() => undefined);
};

window.addEventListener('vite:preloadError', (event) => {
  const preloadEvent = event as Event & { payload?: unknown };
  const error = preloadEvent.payload ?? new Error('Unable to preload application module.');
  if (
    !isResourceLoadError(error) ||
    resourceReloadScheduled ||
    recentlyAttemptedResourceRecovery()
  ) {
    return;
  }

  // Vite emits this before a failed dynamic import rejects. Prevent its default throw while the
  // recovery path removes stale workers/caches and navigates to the latest deployment.
  event.preventDefault();
  recoverUnhandledResourceLoad(error);
});

window.addEventListener('unhandledrejection', (event) => {
  if (!isResourceLoadError(event.reason)) return;
  event.preventDefault();
  recoverUnhandledResourceLoad(event.reason);
});

window.addEventListener(
  'error',
  (event) => {
    const { target } = event;
    let resourceUrl: string | undefined;
    if (target instanceof HTMLScriptElement) resourceUrl = target.src;
    if (target instanceof HTMLLinkElement) resourceUrl = target.href;
    const resourceError =
      event.error ?? (resourceUrl ? `Module script failed: ${resourceUrl}` : '');
    recoverUnhandledResourceLoad(resourceError);
  },
  true
);

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

const LazyNativeImagePreviewWindow = lazy(() =>
  loadLazyModule(async () => ({
    default: (await import('./app/components/image-viewer/NativeImagePreviewWindow'))
      .NativeImagePreviewWindow,
  }))
);
const LazyNativeBibleWindow = lazy(() =>
  loadLazyModule(async () => ({
    default: (await import('./app/components/bible/NativeBibleWindow')).NativeBibleWindow,
  }))
);
const LazyApp = lazy(() => loadLazyModule(() => import('./app/pages/App')));

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

type RootErrorBoundaryProps = {
  children: React.ReactNode;
};

type RootErrorBoundaryState = {
  error?: unknown;
};

class RootErrorBoundary extends React.Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  constructor(props: RootErrorBoundaryProps) {
    super(props);
    this.state = {};
  }

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    return { error };
  }

  render() {
    const { error } = this.state;
    const { children } = this.props;
    if (!error) return children;

    return (
      <div
        style={{
          width: '100%',
          minHeight: 'var(--app-height, 100dvh)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <strong>页面资源加载失败</strong>
        <span>浏览器可能缓存了旧版本文件，请重新加载最新资源。</span>
        <button type="button" onClick={reloadWithFreshResources}>
          清理缓存并重新加载
        </button>
      </div>
    );
  }
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
  const hadServiceWorkerController = navigator.serviceWorker.controller !== null;
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
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    sendSessionToSW();
    if (hadServiceWorkerController && !resourceReloadScheduled) {
      resourceReloadScheduled = true;
      window.location.reload();
    }
  });
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
  root.render(<RootErrorBoundary>{renderRootApp()}</RootErrorBoundary>);
};

mountApp();

window.setTimeout(() => {
  const rootText = document.getElementById('root')?.textContent ?? '';
  if (!/正在启动|Loading\.\.\./i.test(rootText)) return;

  recoverResourceLoad(new Error('Module startup timed out')).catch(() => undefined);
}, STARTUP_RECOVERY_DELAY_MS);
