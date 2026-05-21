import { useAtom } from 'jotai';
import { useCallback, useMemo, useRef } from 'react';
import { APP_VERSION } from '../constants/branding';
import {
  DESKTOP_UPDATER_IDLE_MESSAGE,
  desktopUpdaterStateAtom,
} from '../state/desktopUpdater';
import {
  canInstallPendingDesktopUpdate,
  checkForDesktopUpdate,
  fetchLatestDesktopRelease,
  installPendingDesktopUpdate,
  isDesktopUpdaterSupported,
  normalizeDesktopUpdateVersion,
  openDesktopUpdateDownloadUrl,
  PendingDesktopUpdate,
  PendingDesktopUpdateHandle,
  pendingDesktopUpdatesMatch,
  relaunchDesktopApp,
  toPendingDesktopUpdate,
  UpdaterProgressEvent,
} from '../utils/desktopUpdater';

let ongoingCheckPromise: Promise<PendingDesktopUpdateHandle | undefined> | undefined;
let ongoingInstallPromise: Promise<void> | undefined;
let pendingUpdateHandle: PendingDesktopUpdateHandle | undefined;

type CheckForUpdatesOptions = {
  silentIfLatest?: boolean;
  showErrors?: boolean;
};

export const formatDesktopUpdateVersion = (version: string): string =>
  version.startsWith('v') ? version : `v${version}`;

export const formatDesktopUpdateProgress = (downloaded: number, contentLength: number): string => {
  if (contentLength <= 0) {
    return `\u5df2\u4e0b\u8f7d ${(downloaded / 1024 / 1024).toFixed(2)} MB`;
  }

  const percent = Math.min(100, Math.round((downloaded / contentLength) * 100));
  return `\u6b63\u5728\u4e0b\u8f7d ${percent}%`;
};

export const getDesktopUpdateErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);

  if (/No installable desktop update is available/i.test(message)) {
    return '\u5f53\u524d\u66f4\u65b0\u53e5\u67c4\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u68c0\u67e5\u66f4\u65b0\u540e\u518d\u8bd5\u3002';
  }
  if (/downloadAndInstall is not a function/i.test(message)) {
    return '\u5f53\u524d\u66f4\u65b0\u5bf9\u8c61\u5df2\u4e22\u5931\u4e0b\u8f7d\u65b9\u6cd5\uff0c\u8bf7\u91cd\u65b0\u68c0\u67e5\u66f4\u65b0\u540e\u518d\u8bd5\u3002';
  }
  if (/Updater download API is unavailable/i.test(message)) {
    return '\u5f53\u524d\u684c\u9762\u7aef\u6784\u5efa\u7f3a\u5c11\u53ef\u7528\u7684\u81ea\u52a8\u66f4\u65b0\u4e0b\u8f7d\u63a5\u53e3\u3002';
  }
  if (/pubkey/i.test(message) || /signature/i.test(message)) {
    return '\u81ea\u52a8\u66f4\u65b0\u5df2\u63a5\u5165\uff0c\u4f46\u5f53\u524d\u7f3a\u5c11\u6709\u6548\u7684\u66f4\u65b0\u516c\u94a5\u6216\u7b7e\u540d\u914d\u7f6e\u3002';
  }
  if (/invalid type:\s*sequence,\s*expected a string/i.test(message)) {
    return '\u53d1\u5e03\u7684 latest.json \u683c\u5f0f\u4e0d\u6b63\u786e\uff1anotes \u5b57\u6bb5\u88ab\u751f\u6210\u6210\u4e86\u5217\u8868\uff0c\u9700\u8981\u6539\u56de\u6587\u672c\u540e\u91cd\u65b0\u4e0a\u4f20\u3002';
  }
  if (/parsing major version number|unexpected character|semver/i.test(message)) {
    return '\u53d1\u5e03\u7684 latest.json \u7248\u672c\u53f7\u4e0d\u5408\u6cd5\uff1aversion \u5fc5\u987b\u662f 1.0.1 \u8fd9\u6837\u7684 semver\uff0c\u4e0d\u8981\u5199\u6210 v.1.0.1 \u6216 .1.0.1\u3002';
  }
  if (/endpoint/i.test(message) || /404|204|json/i.test(message)) {
    return '\u672a\u80fd\u83b7\u53d6\u66f4\u65b0\u4fe1\u606f\uff0c\u8bf7\u68c0\u67e5\u66f4\u65b0\u5730\u5740\u548c\u53d1\u5e03\u7684 latest.json \u6587\u4ef6\u3002';
  }
  if (/Desktop updater/i.test(message)) {
    return '\u5f53\u524d\u73af\u5883\u4e0d\u662f\u684c\u9762\u7aef\uff0c\u65e0\u6cd5\u4f7f\u7528\u81ea\u52a8\u66f4\u65b0\u3002';
  }

  return `\u68c0\u67e5\u66f4\u65b0\u5931\u8d25\uff1a${message}`;
};

const canFallbackToManualDownload = (
  error: unknown,
  pendingUpdate?: PendingDesktopUpdate
): pendingUpdate is PendingDesktopUpdate & { downloadUrl: string } => {
  if (!pendingUpdate?.downloadUrl) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    /No installable desktop update is available/i.test(message) ||
    /downloadAndInstall is not a function/i.test(message) ||
    /Updater download API is unavailable/i.test(message) ||
    /pubkey/i.test(message) ||
    /signature/i.test(message)
  );
};

const mergePendingUpdateInfo = (
  update?: PendingDesktopUpdateHandle,
  latestRelease?: PendingDesktopUpdate
): PendingDesktopUpdate | undefined => {
  if (!update) {
    return undefined;
  }

  const pendingUpdate = toPendingDesktopUpdate(update);
  if (!pendingUpdate) {
    return undefined;
  }

  if (!latestRelease || !pendingDesktopUpdatesMatch(update, latestRelease)) {
    return pendingUpdate;
  }

  return {
    ...pendingUpdate,
    body: pendingUpdate.body ?? latestRelease.body,
    date: pendingUpdate.date ?? latestRelease.date,
    downloadUrl: pendingUpdate.downloadUrl ?? latestRelease.downloadUrl,
  };
};

const resolveInstallablePendingUpdate = async (
  expectedUpdate?: PendingDesktopUpdate
): Promise<PendingDesktopUpdateHandle> => {
  const normalizedExpectedVersion = expectedUpdate
    ? normalizeDesktopUpdateVersion(expectedUpdate.version)
    : undefined;

  if (
    pendingUpdateHandle &&
    canInstallPendingDesktopUpdate(pendingUpdateHandle) &&
    (!normalizedExpectedVersion ||
      normalizeDesktopUpdateVersion(pendingUpdateHandle.version) === normalizedExpectedVersion)
  ) {
    return pendingUpdateHandle;
  }

  const refreshedUpdate = await checkForDesktopUpdate();
  if (!refreshedUpdate || !canInstallPendingDesktopUpdate(refreshedUpdate)) {
    throw new Error('No installable desktop update is available.');
  }

  pendingUpdateHandle = refreshedUpdate;
  return refreshedUpdate;
};

export const useDesktopUpdater = () => {
  const [state, setState] = useAtom(desktopUpdaterStateAtom);
  const desktopSupported = isDesktopUpdaterSupported();
  const stateRef = useRef(state);
  stateRef.current = state;

  const progressText = useMemo(() => {
    if (state.status !== 'downloading') return undefined;
    return formatDesktopUpdateProgress(state.downloadedBytes, state.contentLength);
  }, [state.contentLength, state.downloadedBytes, state.status]);

  const checkForUpdates = useCallback(
    async (options: CheckForUpdatesOptions = {}): Promise<PendingDesktopUpdate | undefined> => {
      const { silentIfLatest = false, showErrors = true } = options;
      const previousState = stateRef.current;

      if (ongoingInstallPromise || previousState.status === 'downloading') {
        return previousState.pendingUpdate;
      }

      if (!desktopSupported) {
        if (showErrors) {
          setState((current) => ({
            ...current,
            status: 'error',
            message:
              '\u5f53\u524d\u4e0d\u662f\u684c\u9762\u7aef\u73af\u5883\uff0c\u7f51\u9875\u7aef\u4e0d\u4f1a\u663e\u793a\u81ea\u52a8\u66f4\u65b0\u3002',
            pendingUpdate: undefined,
            downloadedBytes: 0,
            contentLength: 0,
            lastCheckedAt: Date.now(),
          }));
        }
        return undefined;
      }

      if (ongoingCheckPromise) {
        return ongoingCheckPromise;
      }

      setState((current) => ({
        ...current,
        status: 'checking',
        message: '\u6b63\u5728\u68c0\u67e5\u65b0\u7248\u672c...',
        downloadedBytes: 0,
        contentLength: 0,
      }));

      ongoingCheckPromise = (async () => {
        try {
          const [update, latestRelease] = await Promise.all([
            checkForDesktopUpdate(),
            fetchLatestDesktopRelease().catch(() => undefined),
          ]);
          pendingUpdateHandle = update;
          const resolvedUpdate = mergePendingUpdateInfo(update, latestRelease);

          setState((current) => {
            if (!resolvedUpdate) {
              pendingUpdateHandle = undefined;
              return {
                ...current,
                status: 'latest',
                message: silentIfLatest
                  ? DESKTOP_UPDATER_IDLE_MESSAGE
                  : `\u5f53\u524d\u5df2\u7ecf\u662f\u6700\u65b0\u7248\u672c ${formatDesktopUpdateVersion(
                      APP_VERSION
                    )}\u3002`,
                pendingUpdate: undefined,
                latestRelease,
                downloadedBytes: 0,
                contentLength: 0,
                lastCheckedAt: Date.now(),
              };
            }

            return {
              ...current,
              status: 'available',
              message: `\u53d1\u73b0\u65b0\u7248\u672c ${formatDesktopUpdateVersion(
                resolvedUpdate.version
              )}\uff0c\u53ef\u4ee5\u76f4\u63a5\u4e0b\u8f7d\u5e76\u5b89\u88c5\u3002`,
              pendingUpdate: resolvedUpdate,
              latestRelease,
              downloadedBytes: 0,
              contentLength: 0,
              lastCheckedAt: Date.now(),
            };
          });

          return update;
        } catch (error) {
          if (showErrors) {
            setState((current) => ({
              ...current,
              status: 'error',
              message: getDesktopUpdateErrorMessage(error),
              downloadedBytes: 0,
              contentLength: 0,
              lastCheckedAt: Date.now(),
            }));
          } else {
            setState({
              ...previousState,
              lastCheckedAt: Date.now(),
            });
          }
          return undefined;
        } finally {
          ongoingCheckPromise = undefined;
        }
      })();

      return ongoingCheckPromise;
    },
    [desktopSupported, setState]
  );

  const downloadAndInstall = useCallback(async (): Promise<void> => {
    if (!desktopSupported || !state.pendingUpdate) return;
    if (ongoingInstallPromise) {
      return ongoingInstallPromise;
    }

    const expectedUpdate = state.pendingUpdate;
    setState((current) => ({
      ...current,
      status: 'downloading',
      message: `\u6b63\u5728\u51c6\u5907\u4e0b\u8f7d\u5e76\u5b89\u88c5 ${formatDesktopUpdateVersion(
        expectedUpdate.version
      )}...`,
      downloadedBytes: 0,
      contentLength: 0,
    }));

    ongoingInstallPromise = (async () => {
      try {
        let installableUpdate = await resolveInstallablePendingUpdate(expectedUpdate);
        let installVersionLabel = formatDesktopUpdateVersion(installableUpdate.version);

        if (!pendingDesktopUpdatesMatch(expectedUpdate, installableUpdate)) {
          const nextPendingUpdate = toPendingDesktopUpdate(installableUpdate) ?? expectedUpdate;
          setState((current) => ({
            ...current,
            pendingUpdate: nextPendingUpdate,
            message: `\u6b63\u5728\u51c6\u5907\u4e0b\u8f7d\u5e76\u5b89\u88c5 ${installVersionLabel}...`,
          }));
        } else {
          setState((current) => ({
            ...current,
            message: `\u6b63\u5728\u4e0b\u8f7d\u5e76\u5b89\u88c5 ${installVersionLabel}...`,
          }));
        }

        const runInstall = async (updateHandle: PendingDesktopUpdateHandle) => {
          await installPendingDesktopUpdate(updateHandle, (event: UpdaterProgressEvent) => {
            setState((current) => {
              if (event.event === 'Started') {
                return {
                  ...current,
                  contentLength: event.data.contentLength ?? 0,
                  downloadedBytes: 0,
                  message: `\u6b63\u5728\u4e0b\u8f7d\u5e76\u5b89\u88c5 ${formatDesktopUpdateVersion(
                    updateHandle.version
                  )}...`,
                };
              }

              if (event.event === 'Progress') {
                return {
                  ...current,
                  downloadedBytes: current.downloadedBytes + event.data.chunkLength,
                };
              }

              return current;
            });
          });
        };

        try {
          await runInstall(installableUpdate);
        } catch (error) {
          if (!canInstallPendingDesktopUpdate(installableUpdate)) {
            throw error;
          }

          if (
            /downloadAndInstall is not a function/i.test(
              error instanceof Error ? error.message : String(error)
            )
          ) {
            pendingUpdateHandle = undefined;
            installableUpdate = await resolveInstallablePendingUpdate(expectedUpdate);
            installVersionLabel = formatDesktopUpdateVersion(installableUpdate.version);
            setState((current) => ({
              ...current,
              pendingUpdate: toPendingDesktopUpdate(installableUpdate) ?? current.pendingUpdate,
              message: `\u6b63\u5728\u4e0b\u8f7d\u5e76\u5b89\u88c5 ${installVersionLabel}...`,
              downloadedBytes: 0,
              contentLength: 0,
            }));
            await runInstall(installableUpdate);
          } else {
            throw error;
          }
        }

        pendingUpdateHandle = undefined;

        setState((current) => ({
          ...current,
          status: 'installed',
          message:
            '\u66f4\u65b0\u5df2\u5b89\u88c5\uff0c\u5e94\u7528\u5c06\u5c1d\u8bd5\u91cd\u65b0\u542f\u52a8\u3002Windows \u4e0b\u5b89\u88c5\u524d\u5e94\u7528\u4f1a\u81ea\u52a8\u9000\u51fa\u3002',
          pendingUpdate: undefined,
          downloadedBytes: 0,
          contentLength: 0,
          lastCheckedAt: Date.now(),
        }));

        await relaunchDesktopApp().catch(() => undefined);
      } catch (error) {
        if (canFallbackToManualDownload(error, expectedUpdate)) {
          await openDesktopUpdateDownloadUrl(expectedUpdate.downloadUrl).catch(() => undefined);
          pendingUpdateHandle = undefined;
          setState((current) => ({
            ...current,
            status: 'error',
            message:
              '\u81ea\u52a8\u5b89\u88c5\u672a\u80fd\u7ee7\u7eed\uff0c\u5df2\u4e3a\u4f60\u6253\u5f00\u624b\u52a8\u4e0b\u8f7d\u94fe\u63a5\u3002\u4e0b\u8f7d\u5b8c\u6210\u540e\u53ef\u76f4\u63a5\u5b89\u88c5\u65b0\u7248\u672c\u3002',
            pendingUpdate: expectedUpdate,
            downloadedBytes: 0,
            contentLength: 0,
            lastCheckedAt: Date.now(),
          }));
          return;
        }

        pendingUpdateHandle = undefined;
        setState((current) => ({
          ...current,
          status: 'error',
          message: getDesktopUpdateErrorMessage(error),
          lastCheckedAt: Date.now(),
        }));
      } finally {
        ongoingInstallPromise = undefined;
      }
    })();

    return ongoingInstallPromise;
  }, [desktopSupported, setState, state.pendingUpdate]);

  return {
    ...state,
    desktopSupported,
    progressText,
    checkForUpdates,
    downloadAndInstall,
    formatVersionLabel: formatDesktopUpdateVersion,
  };
};
