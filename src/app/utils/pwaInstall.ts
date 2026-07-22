import { isDesktopUpdaterSupported } from './desktopUpdater';

type BeforeInstallPromptChoice = {
  outcome: 'accepted' | 'dismissed';
  platform: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptChoice>;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

export type PWAInstallPlatform = 'ios' | 'android' | 'desktop';

export type PWAInstallSnapshot = {
  canPrompt: boolean;
  inAppBrowser: boolean;
  installed: boolean;
  platform: PWAInstallPlatform;
  supported: boolean;
};

export type PWAInstallResult = 'accepted' | 'dismissed' | 'unavailable';

const listeners = new Set<() => void>();

let initialized = false;
let installedByEvent = false;
let deferredPrompt: BeforeInstallPromptEvent | undefined;
let standaloneMedia: MediaQueryList | undefined;

const notify = () => listeners.forEach((listener) => listener());

const getPlatform = (): PWAInstallPlatform => {
  const { maxTouchPoints, platform, userAgent } = window.navigator;
  const iPadOS = platform === 'MacIntel' && maxTouchPoints > 1;

  if (/iPad|iPhone|iPod/i.test(userAgent) || iPadOS) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
};

const isInAppBrowser = (): boolean =>
  /MicroMessenger|QQ\/|QQBrowser|Weibo|DingTalk|AlipayClient/i.test(window.navigator.userAgent);

const isStandalone = (): boolean => {
  const navigatorWithStandalone = window.navigator as NavigatorWithStandalone;

  return (
    installedByEvent ||
    navigatorWithStandalone.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
  );
};

export const initializePWAInstall = (): void => {
  if (initialized || typeof window === 'undefined') return;

  initialized = true;
  standaloneMedia = window.matchMedia('(display-mode: standalone)');

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    installedByEvent = true;
    deferredPrompt = undefined;
    notify();
  });

  standaloneMedia.addEventListener?.('change', notify);
};

export const getPWAInstallSnapshot = (): PWAInstallSnapshot => {
  if (typeof window === 'undefined') {
    return {
      canPrompt: false,
      inAppBrowser: false,
      installed: false,
      platform: 'desktop',
      supported: false,
    };
  }

  initializePWAInstall();

  return {
    canPrompt: deferredPrompt !== undefined,
    inAppBrowser: isInAppBrowser(),
    installed: isStandalone(),
    platform: getPlatform(),
    supported: !isDesktopUpdaterSupported(),
  };
};

export const subscribePWAInstall = (listener: () => void): (() => void) => {
  initializePWAInstall();
  listeners.add(listener);

  return () => listeners.delete(listener);
};

export const requestPWAInstall = async (): Promise<PWAInstallResult> => {
  const prompt = deferredPrompt;
  if (!prompt) return 'unavailable';

  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    deferredPrompt = undefined;
    notify();
    return choice.outcome;
  } catch {
    deferredPrompt = undefined;
    notify();
    return 'unavailable';
  }
};
