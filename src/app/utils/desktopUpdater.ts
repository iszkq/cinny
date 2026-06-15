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
  downloadUrl?: string;
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
  downloadUrl?: string;
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

const getDesktopUpdateVersionParts = (version: string): number[] | undefined => {
  const coreVersion = normalizeDesktopUpdateVersion(version).split(/[-+]/, 1)[0];
  const parts = coreVersion.split('.');

  if (parts.length < 3) {
    return undefined;
  }

  const numericParts = parts.slice(0, 3).map((part) => {
    if (!/^\d+$/.test(part)) {
      return Number.NaN;
    }

    return Number.parseInt(part, 10);
  });

  if (numericParts.some((part) => Number.isNaN(part))) {
    return undefined;
  }

  return numericParts;
};

export const compareDesktopUpdateVersions = (left: string, right: string): number => {
  const leftParts = getDesktopUpdateVersionParts(left);
  const rightParts = getDesktopUpdateVersionParts(right);

  if (!leftParts || !rightParts) {
    const normalizedLeft = normalizeDesktopUpdateVersion(left);
    const normalizedRight = normalizeDesktopUpdateVersion(right);
    return normalizedLeft.localeCompare(normalizedRight, undefined, { numeric: true });
  }

  for (let index = 0; index < 3; index += 1) {
    const diff = leftParts[index] - rightParts[index];
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
};

export const isDesktopUpdateNewerThan = (version: string, currentVersion: string): boolean =>
  compareDesktopUpdateVersions(version, currentVersion) > 0;

export const pendingDesktopUpdatesMatch = (
  left?: Pick<PendingDesktopUpdate, 'version'>,
  right?: Pick<PendingDesktopUpdate, 'version'>
): boolean => {
  if (!left || !right) return false;

  return (
    normalizeDesktopUpdateVersion(left.version) === normalizeDesktopUpdateVersion(right.version)
  );
};

export const toPendingDesktopUpdate = (
  update?: PendingDesktopUpdate | PendingDesktopUpdateHandle
): PendingDesktopUpdate | undefined => {
  if (!update) return undefined;

  return {
    version: update.version,
    date: update.date,
    body: update.body,
    downloadUrl: update.downloadUrl,
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
  platforms?: unknown;
}): DesktopUpdateReleaseInfo | undefined => {
  if (typeof payload.version !== 'string' || payload.version.trim() === '') {
    return undefined;
  }

  const platforms =
    typeof payload.platforms === 'object' && payload.platforms
      ? (payload.platforms as Record<string, { url?: unknown }>)
      : undefined;
  const windowsPlatform = platforms?.['windows-x86_64'];
  const downloadUrl =
    windowsPlatform && typeof windowsPlatform.url === 'string' ? windowsPlatform.url : undefined;

  return {
    version: payload.version,
    body: typeof payload.notes === 'string' ? payload.notes : undefined,
    date: typeof payload.pub_date === 'string' ? payload.pub_date : undefined,
    downloadUrl,
  };
};

const parseLatestDesktopRelease = (payload: {
  tag_name?: unknown;
  body?: unknown;
  published_at?: unknown;
  assets?: unknown;
}): DesktopUpdateReleaseInfo | undefined => {
  if (typeof payload.tag_name !== 'string' || payload.tag_name.trim() === '') {
    return undefined;
  }

  const assets = Array.isArray(payload.assets) ? payload.assets : [];
  const installerAsset = assets.find((asset) => {
    if (!asset || typeof asset !== 'object') return false;
    const name = 'name' in asset ? asset.name : undefined;
    return typeof name === 'string' && /-setup\.exe$/i.test(name);
  }) as { browser_download_url?: unknown } | undefined;
  const downloadUrl =
    installerAsset && typeof installerAsset.browser_download_url === 'string'
      ? installerAsset.browser_download_url
      : undefined;

  return {
    version: payload.tag_name.replace(/^v/i, ''),
    body: typeof payload.body === 'string' ? payload.body : undefined,
    date: typeof payload.published_at === 'string' ? payload.published_at : undefined,
    downloadUrl,
  };
};

const mergeLatestDesktopReleaseInfo = (
  manifestRelease?: DesktopUpdateReleaseInfo,
  githubRelease?: DesktopUpdateReleaseInfo
): DesktopUpdateReleaseInfo | undefined => {
  if (!manifestRelease) return githubRelease;
  if (!githubRelease) return manifestRelease;

  const sameVersion =
    normalizeDesktopUpdateVersion(manifestRelease.version) ===
    normalizeDesktopUpdateVersion(githubRelease.version);

  if (!sameVersion) {
    return {
      ...githubRelease,
      downloadUrl: githubRelease.downloadUrl ?? manifestRelease.downloadUrl,
    };
  }

  return {
    version: githubRelease.version,
    date: githubRelease.date ?? manifestRelease.date,
    body: githubRelease.body ?? manifestRelease.body,
    downloadUrl: manifestRelease.downloadUrl ?? githubRelease.downloadUrl,
  };
};

export const fetchLatestDesktopRelease = async (): Promise<
  DesktopUpdateReleaseInfo | undefined
> => {
  const [manifestRelease, githubRelease] = await Promise.all([
    (async () => {
      const response = await fetch(DESKTOP_UPDATER_MANIFEST_URL, {
        cache: 'no-store',
      });

      if (!response.ok) {
        return undefined;
      }

      const manifestPayload = (await response.json()) as {
        version?: unknown;
        notes?: unknown;
        pub_date?: unknown;
        platforms?: unknown;
      };

      return parseLatestDesktopManifest(manifestPayload);
    })().catch(() => undefined),
    (async () => {
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
        assets?: unknown;
      };

      return parseLatestDesktopRelease(releasePayload);
    })().catch(() => undefined),
  ]);

  return mergeLatestDesktopReleaseInfo(manifestRelease, githubRelease);
};

export const openDesktopUpdateDownloadUrl = async (url: string): Promise<void> => {
  if (!url.trim()) return;

  if (isDesktopUpdaterSupported()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_external_url', { url });
    return;
  }

  if (typeof window === 'undefined') return;

  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) {
    window.location.assign(url);
  }
};

export const relaunchDesktopApp = async (): Promise<void> => {
  if (!isDesktopUpdaterSupported()) return;

  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
};
