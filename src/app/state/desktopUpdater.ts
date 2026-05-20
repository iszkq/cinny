import { atom } from 'jotai';
import type { DesktopUpdateReleaseInfo, PendingDesktopUpdate } from '../utils/desktopUpdater';

export type DesktopUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'latest'
  | 'downloading'
  | 'installed'
  | 'error';

export type DesktopUpdaterState = {
  status: DesktopUpdateStatus;
  message: string;
  pendingUpdate?: PendingDesktopUpdate;
  latestRelease?: DesktopUpdateReleaseInfo;
  downloadedBytes: number;
  contentLength: number;
  lastCheckedAt?: number;
};

export const DESKTOP_UPDATER_IDLE_MESSAGE =
  '\u684c\u9762\u7aef\u542f\u52a8\u540e\u4f1a\u81ea\u52a8\u68c0\u67e5\u66f4\u65b0\uff0c\u4e5f\u53ef\u4ee5\u5728\u8fd9\u91cc\u624b\u52a8\u68c0\u67e5\u5e76\u5b89\u88c5\u65b0\u7248\u672c\u3002';

export const desktopUpdaterStateAtom = atom<DesktopUpdaterState>({
  status: 'idle',
  message: DESKTOP_UPDATER_IDLE_MESSAGE,
  downloadedBytes: 0,
  contentLength: 0,
});
