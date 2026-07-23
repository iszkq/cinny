import { registerPlugin } from '@capacitor/core';
import { APP_VERSION } from '../constants/branding';
import {
  compareDesktopUpdateVersions,
  fetchLatestDesktopRelease,
  type DesktopUpdateReleaseInfo,
} from './desktopUpdater';
import { isAndroidApp } from './nativePlatform';

type AndroidUpdaterPlugin = {
  canInstallPackages: () => Promise<{ allowed: boolean }>;
  openInstallPermissionSettings: () => Promise<void>;
  downloadAndInstall: (options: {
    url: string;
    fileName: string;
  }) => Promise<{ installerOpened: boolean }>;
};

export type PendingAndroidUpdate = DesktopUpdateReleaseInfo & {
  androidDownloadUrl: string;
};

const AndroidUpdater = registerPlugin<AndroidUpdaterPlugin>('AndroidUpdater');

export const checkForAndroidUpdate = async (): Promise<PendingAndroidUpdate | undefined> => {
  if (!isAndroidApp()) return undefined;

  const release = await fetchLatestDesktopRelease();
  if (
    !release?.androidDownloadUrl ||
    compareDesktopUpdateVersions(release.version, APP_VERSION) <= 0
  ) {
    return undefined;
  }

  return {
    ...release,
    androidDownloadUrl: release.androidDownloadUrl,
  };
};

export const installAndroidUpdate = async (update: PendingAndroidUpdate): Promise<void> => {
  const { allowed } = await AndroidUpdater.canInstallPackages();
  if (!allowed) {
    await AndroidUpdater.openInstallPermissionSettings();
    throw new Error('请在系统设置中允许星火安装未知应用，返回后再次点击更新。');
  }

  await AndroidUpdater.downloadAndInstall({
    url: update.androidDownloadUrl,
    fileName: `Starfire-${update.version}.apk`,
  });
};
