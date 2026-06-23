/* eslint-disable import/first */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { enableMapSet } from 'immer';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import { configClass, varsClass } from 'folds';

enableMapSet();

import './index.css';

import { trimTrailingSlash } from './app/utils/common';
import App from './app/pages/App';
import { NativeImagePreviewWindow } from './app/components/image-viewer/NativeImagePreviewWindow';

// import i18n (needs to be bundled ;))
import './app/i18n';
import { pushSessionToSW } from './sw-session';
import { getFallbackSession } from './app/state/sessions';
import { isDesktopUpdaterSupported } from './app/utils/desktopUpdater';
import { applyDesktopStartupPinLock } from './app/utils/pinLock';
import { isNativeImagePreviewWindow } from './app/utils/nativeImagePreview';
import { isNativeBibleWindow } from './app/utils/nativeBibleWindow';
import { NativeBibleWindow } from './app/components/bible/NativeBibleWindow';

document.body.classList.add(configClass, varsClass);

const nativeImagePreviewWindow = isDesktopUpdaterSupported() && isNativeImagePreviewWindow();
const nativeBibleWindow = isDesktopUpdaterSupported() && isNativeBibleWindow();
const desktopSubWindow = nativeImagePreviewWindow || nativeBibleWindow;
const fallbackSession = desktopSubWindow ? undefined : getFallbackSession();

if (isDesktopUpdaterSupported() && !desktopSubWindow) {
  document.documentElement.dataset.cinnyDesktopApp = 'true';
  applyDesktopStartupPinLock(fallbackSession?.baseUrl, fallbackSession?.userId);
}

// Register Service Worker
if (!desktopSubWindow && 'serviceWorker' in navigator) {
  const swUrl =
    import.meta.env.MODE === 'production'
      ? `${trimTrailingSlash(import.meta.env.BASE_URL)}/sw.js`
      : `/dev-sw.js?dev-sw`;

  const sendSessionToSW = () => {
    const session = getFallbackSession();
    pushSessionToSW(session?.baseUrl, session?.accessToken);
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

const mountApp = () => {
  const rootContainer = document.getElementById('root');

  if (rootContainer === null) {
    console.error('Root container element not found!');
    return;
  }

  const root = createRoot(rootContainer);
  root.render(
    nativeImagePreviewWindow ? (
      <NativeImagePreviewWindow />
    ) : nativeBibleWindow ? (
      <NativeBibleWindow />
    ) : (
      <App />
    )
  );
};

mountApp();
