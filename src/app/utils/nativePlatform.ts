import { Capacitor } from '@capacitor/core';

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

export const isAndroidApp = (): boolean => isNativeApp() && Capacitor.getPlatform() === 'android';

let androidShellInitialized = false;

const disablePwaServiceWorkerInAndroidApp = async (): Promise<void> => {
  if (!('serviceWorker' in navigator)) return;

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
};

export const initializeAndroidAppShell = async (): Promise<void> => {
  if (androidShellInitialized || !isAndroidApp()) return;

  androidShellInitialized = true;
  document.documentElement.dataset.cinnyAndroidApp = 'true';
  disablePwaServiceWorkerInAndroidApp().catch(() => undefined);

  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
      return;
    }

    App.minimizeApp().catch(() => undefined);
  });
};
