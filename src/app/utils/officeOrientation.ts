import { registerPlugin } from '@capacitor/core';
import { isAndroidApp } from './nativePlatform';

type OfficeOrientationPlugin = {
  lockLandscape: () => Promise<void>;
  unlock: () => Promise<void>;
};

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
  unlock?: () => void;
};

const NativeOfficeOrientation = registerPlugin<OfficeOrientationPlugin>('OfficeOrientation');

const getScreenOrientation = (): LockableScreenOrientation | undefined =>
  typeof screen === 'undefined'
    ? undefined
    : (screen.orientation as LockableScreenOrientation | undefined);

export const lockOfficeLandscape = async (): Promise<void> => {
  if (isAndroidApp()) {
    await NativeOfficeOrientation.lockLandscape();
    return;
  }

  await getScreenOrientation()?.lock?.('landscape');
};

export const unlockOfficeOrientation = async (): Promise<void> => {
  if (isAndroidApp()) {
    await NativeOfficeOrientation.unlock();
    return;
  }

  getScreenOrientation()?.unlock?.();
};
