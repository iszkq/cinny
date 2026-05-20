import { useAtom } from 'jotai';
import { useCallback, useMemo, useRef } from 'react';
import { APP_VERSION } from '../constants/branding';
import {
  DESKTOP_UPDATER_IDLE_MESSAGE,
  desktopUpdaterStateAtom,
} from '../state/desktopUpdater';
import {
  checkForDesktopUpdate,
  fetchLatestDesktopRelease,
  isDesktopUpdaterSupported,
  PendingDesktopUpdate,
  relaunchDesktopApp,
  UpdaterProgressEvent,
} from '../utils/desktopUpdater';

let ongoingCheckPromise: Promise<PendingDesktopUpdate | undefined> | undefined;
let ongoingInstallPromise: Promise<void> | undefined;

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

  if (/pubkey/i.test(message) || /signature/i.test(message)) {
    return '\u81ea\u52a8\u66f4\u65b0\u5df2\u63a5\u5165\uff0c\u4f46\u5f53\u524d\u7f3a\u5c11\u6709\u6548\u7684\u66f4\u65b0\u516c\u94a5\u6216\u7b7e\u540d\u914d\u7f6e\u3002';
  }
  if (/endpoint/i.test(message) || /404|204|json/i.test(message)) {
    return '\u672a\u80fd\u83b7\u53d6\u66f4\u65b0\u4fe1\u606f\uff0c\u8bf7\u68c0\u67e5\u66f4\u65b0\u5730\u5740\u548c\u53d1\u5e03\u7684 latest.json \u6587\u4ef6\u3002';
  }
  if (/Desktop updater/i.test(message)) {
    return '\u5f53\u524d\u73af\u5883\u4e0d\u662f\u684c\u9762\u7aef\uff0c\u65e0\u6cd5\u4f7f\u7528\u81ea\u52a8\u66f4\u65b0\u3002';
  }

  return `\u68c0\u67e5\u66f4\u65b0\u5931\u8d25\uff1a${message}`;
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
          const resolvedUpdate =
            update && latestRelease?.version === update.version && latestRelease.body
              ? {
                  ...update,
                  body: update.body ?? latestRelease.body,
                  date: update.date ?? latestRelease.date,
                }
              : update;

          setState((current) => {
            if (!resolvedUpdate) {
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

          return resolvedUpdate;
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

    const pendingUpdate = state.pendingUpdate;
    setState((current) => ({
      ...current,
      status: 'downloading',
      message: `\u6b63\u5728\u4e0b\u8f7d\u5e76\u5b89\u88c5 ${formatDesktopUpdateVersion(
        pendingUpdate.version
      )}...`,
      downloadedBytes: 0,
      contentLength: 0,
    }));

    ongoingInstallPromise = (async () => {
      try {
        await pendingUpdate.downloadAndInstall((event: UpdaterProgressEvent) => {
          setState((current) => {
            if (event.event === 'Started') {
              return {
                ...current,
                contentLength: event.data.contentLength ?? 0,
                downloadedBytes: 0,
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
