import { Capacitor } from '@capacitor/core';

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

export const isAndroidApp = (): boolean =>
  isNativeApp() && Capacitor.getPlatform() === 'android';

let androidShellInitialized = false;

export const initializeAndroidAppShell = async (): Promise<void> => {
  if (androidShellInitialized || !isAndroidApp()) return;

  androidShellInitialized = true;
  document.documentElement.dataset.cinnyAndroidApp = 'true';

  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
      return;
    }

    App.minimizeApp().catch(() => undefined);
  });
};
