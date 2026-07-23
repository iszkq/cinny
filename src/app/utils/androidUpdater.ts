import { registerPlugin } from '@capacitor/core';
import { APP_VERSION } from '../constants/branding';
import {
  compareDesktopUpdateVersions,
  fetchLatestDesktopRelease,
  type DesktopUpdateReleaseInfo,
} from './desktopUpdater';
import { isAndroidApp } from './nativePlatform';

export type AndroidUpdateDownloadState =
  | 'idle'
  | 'pending'
  | 'running'
  | 'paused'
  | 'successful'
  | 'failed'
  | 'cancelled';

export type AndroidUpdateDownloadStatus = {
  downloadId?: number;
  active: boolean;
  state: AndroidUpdateDownloadState;
  percent: number;
  bytesDownloaded: number;
  totalBytes: number;
  reason: number;
  installerOpened?: boolean;
};

export type AndroidUpdateDownloadResult = AndroidUpdateDownloadStatus & {
  started: boolean;
  alreadyDownloading: boolean;
  installerOpened: boolean;
};

type AndroidUpdaterPlugin = {
  canInstallPackages: () => Promise<{ allowed: boolean }>;
  openInstallPermissionSettings: () => Promise<void>;
  getDownloadStatus: () => Promise<AndroidUpdateDownloadStatus>;
  cancelDownload: () => Promise<void>;
  downloadAndInstall: (options: {
    url: string;
    fileName: string;
  }) => Promise<AndroidUpdateDownloadResult>;
  addListener: (
    eventName: 'downloadProgress',
    listener: (status: AndroidUpdateDownloadStatus) => void
  ) => Promise<{ remove: () => Promise<void> }>;
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

export const getAndroidUpdateDownloadStatus = (): Promise<AndroidUpdateDownloadStatus> =>
  AndroidUpdater.getDownloadStatus();

export const listenAndroidUpdateDownload = (
  listener: (status: AndroidUpdateDownloadStatus) => void
): Promise<{ remove: () => Promise<void> }> =>
  AndroidUpdater.addListener('downloadProgress', listener);

export const cancelAndroidUpdateDownload = (): Promise<void> => AndroidUpdater.cancelDownload();

export const installAndroidUpdate = async (
  update: PendingAndroidUpdate
): Promise<AndroidUpdateDownloadResult> => {
  const { allowed } = await AndroidUpdater.canInstallPackages();
  if (!allowed) {
    await AndroidUpdater.openInstallPermissionSettings();
    throw new Error('请在系统设置中允许星火安装未知应用，返回后再次点击更新。');
  }

  return AndroidUpdater.downloadAndInstall({
    url: update.androidDownloadUrl,
    fileName: `Starfire-${update.version}.apk`,
  });
};
