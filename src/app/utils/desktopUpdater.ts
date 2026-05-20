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
};

export type PendingDesktopUpdateHandle = PendingDesktopUpdate & {
  downloadAndInstall?: (callback?: (event: UpdaterProgressEvent) => void) => Promise<void>;
  download?: (callback?: (event: UpdaterProgressEvent) => void) => Promise<void>;
  install?: () => Promise<void>;
};

export type DesktopUpdateReleaseInfo = {
  version: string;
  date?: string;
  body?: string;
};

export const DESKTOP_UPDATER_MANIFEST_URL =
  'https://github.com/iszkq/cinny/releases/latest/download/latest.json';
export const DESKTOP_UPDATER_RELEASE_API_URL =
  'https://api.github.com/repos/iszkq/cinny/releases/latest';

type TauriWindow = Window & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

export const isDesktopUpdaterSupported = (): boolean =>
  typeof window !== 'undefined' &&
  (Boolean((window as TauriWindow).__TAURI__) ||
    Boolean((window as TauriWindow).__TAURI_INTERNALS__) ||
    /tauri/i.test(window.navigator.userAgent));

export const checkForDesktopUpdate = async (): Promise<PendingDesktopUpdateHandle | undefined> => {
  if (!isDesktopUpdaterSupported()) {
    throw new Error('Desktop updater is only available in the Tauri desktop app.');
  }

  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  return update as PendingDesktopUpdateHandle | undefined;
};

export const normalizeDesktopUpdateVersion = (version: string): string =>
  version.replace(/^v/i, '').trim();

export const pendingDesktopUpdatesMatch = (
  left?: Pick<PendingDesktopUpdate, 'version'>,
  right?: Pick<PendingDesktopUpdate, 'version'>
): boolean => {
  if (!left || !right) return false;

  return normalizeDesktopUpdateVersion(left.version) === normalizeDesktopUpdateVersion(right.version);
};

export const toPendingDesktopUpdate = (
  update?: PendingDesktopUpdate | PendingDesktopUpdateHandle
): PendingDesktopUpdate | undefined => {
  if (!update) return undefined;

  return {
    version: update.version,
    date: update.date,
    body: update.body,
  };
};

export const canInstallPendingDesktopUpdate = (
  update?: Partial<PendingDesktopUpdateHandle>
): update is PendingDesktopUpdateHandle =>
  Boolean(
    update &&
      (typeof update.downloadAndInstall === 'function' ||
        (typeof update.download === 'function' && typeof update.install === 'function'))
  );

export const installPendingDesktopUpdate = async (
  update: PendingDesktopUpdateHandle,
  callback?: (event: UpdaterProgressEvent) => void
): Promise<void> => {
  if (typeof update.downloadAndInstall === 'function') {
    await update.downloadAndInstall(callback);
    return;
  }

  if (typeof update.download === 'function' && typeof update.install === 'function') {
    await update.download(callback);
    await update.install();
    return;
  }

  throw new Error('Updater download API is unavailable in the current desktop build.');
};

const parseLatestDesktopManifest = (payload: {
  version?: unknown;
  notes?: unknown;
  pub_date?: unknown;
}): DesktopUpdateReleaseInfo | undefined => {
  if (typeof payload.version !== 'string' || payload.version.trim() === '') {
    return undefined;
  }

  return {
    version: payload.version,
    body: typeof payload.notes === 'string' ? payload.notes : undefined,
    date: typeof payload.pub_date === 'string' ? payload.pub_date : undefined,
  };
};

const parseLatestDesktopRelease = (payload: {
  tag_name?: unknown;
  body?: unknown;
  published_at?: unknown;
}): DesktopUpdateReleaseInfo | undefined => {
  if (typeof payload.tag_name !== 'string' || payload.tag_name.trim() === '') {
    return undefined;
  }

  return {
    version: payload.tag_name.replace(/^v/i, ''),
    body: typeof payload.body === 'string' ? payload.body : undefined,
    date: typeof payload.published_at === 'string' ? payload.published_at : undefined,
  };
};

export const fetchLatestDesktopRelease = async (): Promise<DesktopUpdateReleaseInfo | undefined> => {
  if (!isDesktopUpdaterSupported()) {
    throw new Error('Desktop updater is only available in the Tauri desktop app.');
  }

  try {
    const response = await fetch(DESKTOP_UPDATER_MANIFEST_URL, {
      cache: 'no-store',
    });

    if (response.ok) {
      const manifestPayload = (await response.json()) as {
        version?: unknown;
        notes?: unknown;
        pub_date?: unknown;
      };
      const manifestRelease = parseLatestDesktopManifest(manifestPayload);
      if (manifestRelease) {
        return manifestRelease;
      }
    }
  } catch {
    // Fall through to GitHub Release API so About page and update prompt can still show notes.
  }

  const response = await fetch(DESKTOP_UPDATER_RELEASE_API_URL, {
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch latest GitHub release: ${response.status}`);
  }

  const releasePayload = (await response.json()) as {
    tag_name?: unknown;
    body?: unknown;
    published_at?: unknown;
  };

  return parseLatestDesktopRelease(releasePayload);
};

export const relaunchDesktopApp = async (): Promise<void> => {
  if (!isDesktopUpdaterSupported()) return;

  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
};
