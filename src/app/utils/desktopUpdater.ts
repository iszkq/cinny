export type UpdaterProgressEvent =
  | {
      event: 'Started';
      data: {
        contentLength?: number;
      };
    }
  | {
      event: 'Progress';
      data: {
        chunkLength: number;
      };
    }
  | {
      event: 'Finished';
      data?: Record<string, never>;
    };

export type PendingDesktopUpdate = {
  version: string;
  date?: string;
  body?: string;
  downloadAndInstall: (callback?: (event: UpdaterProgressEvent) => void) => Promise<void>;
};

type TauriWindow = Window & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

export const isDesktopUpdaterSupported = (): boolean =>
  typeof window !== 'undefined' &&
  (Boolean((window as TauriWindow).__TAURI__) ||
    Boolean((window as TauriWindow).__TAURI_INTERNALS__) ||
    /tauri/i.test(window.navigator.userAgent));

export const checkForDesktopUpdate = async (): Promise<PendingDesktopUpdate | undefined> => {
  if (!isDesktopUpdaterSupported()) {
    throw new Error('Desktop updater is only available in the Tauri desktop app.');
  }

  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  return update as PendingDesktopUpdate | undefined;
};

export const relaunchDesktopApp = async (): Promise<void> => {
  if (!isDesktopUpdaterSupported()) return;

  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
};
