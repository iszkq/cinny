import { Capacitor } from '@capacitor/core';

export const ANDROID_BACK_BUTTON_EVENT = 'cinny-android-back-button';

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

// The Android bundle is built with VITE_ANDROID_APP=true. Capacitor's runtime
// platform probe can briefly report `web` while the bridge is reconnecting
// after the renderer process is killed; using the build flag keeps Android
// persistence and crypto recovery enabled during that window as well.
const isAndroidBuild = import.meta.env.VITE_ANDROID_APP === 'true';
export const isAndroidApp = (): boolean =>
  isAndroidBuild || (isNativeApp() && Capacitor.getPlatform() === 'android');

let androidShellInitialized = false;

const disablePwaServiceWorkerInAndroidApp = async (): Promise<void> => {
  if (!('serviceWorker' in navigator)) return;

  const cleanupReloadKey = 'cinny-android-service-worker-cleanup-reload';
  const wasControlled = Boolean(navigator.serviceWorker.controller);
  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  await Promise.all(
    registrations.map((registration) => registration.unregister().catch(() => false))
  );

  if (!('caches' in window)) return;
  const cacheNames = await window.caches.keys().catch(() => []);
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith('workbox-precache'))
      .map((cacheName) => window.caches.delete(cacheName))
  );

  // An old PWA worker can continue controlling the current WebView until the
  // next navigation. Without one guarded reload, it may serve stale chunks,
  // produce a white screen, or boot the app without the persisted session.
  try {
    if (wasControlled && sessionStorage.getItem(cleanupReloadKey) !== '1') {
      sessionStorage.setItem(cleanupReloadKey, '1');
      window.location.reload();
      return;
    }
    if (!navigator.serviceWorker.controller) {
      sessionStorage.removeItem(cleanupReloadKey);
    }
  } catch {
    // Some WebViews can temporarily deny sessionStorage during startup.
  }
};

export const initializeAndroidAppShell = async (): Promise<void> => {
  if (androidShellInitialized || !isAndroidApp()) return;

  androidShellInitialized = true;
  document.documentElement.dataset.cinnyAndroidApp = 'true';
  disablePwaServiceWorkerInAndroidApp().catch(() => undefined);

  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', ({ canGoBack }) => {
    const backButtonEvent = new Event(ANDROID_BACK_BUTTON_EVENT, { cancelable: true });
    if (!window.dispatchEvent(backButtonEvent)) return;

    if (canGoBack) {
      window.history.back();
      return;
    }

    App.minimizeApp().catch(() => undefined);
  });
};
