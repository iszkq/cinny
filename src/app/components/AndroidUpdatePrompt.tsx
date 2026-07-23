import FocusTrap from 'focus-trap-react';
import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  Icon,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  ProgressBar,
  Spinner,
  Text,
  toRem,
} from 'folds';
import { APP_VERSION } from '../constants/branding';
import {
  cancelAndroidUpdateDownload,
  getAndroidUpdateDownloadStatus,
  installAndroidUpdate,
  listenAndroidUpdateDownload,
  type AndroidUpdateDownloadStatus,
  type PendingAndroidUpdate,
} from '../utils/androidUpdater';
import { normalizeDesktopUpdateVersion } from '../utils/desktopUpdater';
import { stopPropagation } from '../utils/keyboard';
import { ReleaseNotes } from './ReleaseNotes';

const STARFIRE_DOWNLOAD_PAGE_URL = 'https://chat.221819.best/download/';
const ACTIVE_DOWNLOAD_STATES = new Set(['pending', 'running', 'paused']);

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isDownloadActive = (status?: AndroidUpdateDownloadStatus): boolean =>
  Boolean(status?.active && ACTIVE_DOWNLOAD_STATES.has(status.state));

const getDownloadMessage = (status: AndroidUpdateDownloadStatus): string | undefined => {
  if (status.state === 'pending') return '下载任务已创建，正在等待系统开始下载。';
  if (status.state === 'paused') return '系统暂时暂停了下载，网络恢复后会自动继续。';
  if (status.state === 'running') {
    return status.percent >= 0
      ? `正在下载正式安装包：${status.percent}%`
      : '正在下载正式安装包，正在获取文件大小...';
  }
  if (status.state === 'successful') {
    return status.installerOpened
      ? '安装界面已打开，请按系统提示完成覆盖更新。'
      : '安装包下载完成，正在打开系统安装界面。';
  }
  if (status.state === 'failed') {
    return `安装包下载失败${
      status.reason ? `（错误码：${status.reason}）` : ''
    }，可以重试或前往下载页。`;
  }
  if (status.state === 'cancelled') return '下载已取消，可以重新开始。';
  return undefined;
};

type AndroidUpdatePromptProps = {
  update?: PendingAndroidUpdate;
  requestClose: () => void;
};

export function AndroidUpdatePrompt({ update, requestClose }: AndroidUpdatePromptProps) {
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [installFailed, setInstallFailed] = useState(false);
  const [message, setMessage] = useState<string>();
  const [downloadStatus, setDownloadStatus] = useState<AndroidUpdateDownloadStatus>();

  useEffect(() => {
    if (!update) return undefined;

    let disposed = false;
    let removeListener: (() => Promise<void>) | undefined;

    const applyStatus = (status: AndroidUpdateDownloadStatus) => {
      if (disposed) return;
      setDownloadStatus(status);
      setInstallFailed(status.state === 'failed');
      const statusMessage = getDownloadMessage(status);
      if (statusMessage) setMessage(statusMessage);
    };

    listenAndroidUpdateDownload(applyStatus)
      .then((handle) => {
        if (disposed) {
          handle.remove().catch(() => undefined);
          return;
        }
        removeListener = () => handle.remove();
      })
      .catch(() => undefined);

    getAndroidUpdateDownloadStatus()
      .then(applyStatus)
      .catch(() => undefined);

    return () => {
      disposed = true;
      removeListener?.().catch(() => undefined);
    };
  }, [update]);

  if (!update) return null;

  const downloadActive = isDownloadActive(downloadStatus);
  const busy = starting || cancelling;

  const handleInstall = () => {
    if (busy || downloadActive) return;

    setStarting(true);
    setInstallFailed(false);
    setMessage('正在创建系统下载任务...');
    installAndroidUpdate(update)
      .then((result) => {
        setDownloadStatus(result);
        if (result.installerOpened) {
          setMessage('安装界面已打开，请按系统提示完成覆盖更新。');
          return;
        }
        if (result.state === 'successful') {
          setInstallFailed(true);
          setMessage('安装包已下载，但系统安装界面未能打开，请前往下载页手动安装。');
          return;
        }
        setMessage(
          result.alreadyDownloading
            ? '已有下载任务，已恢复显示当前进度。'
            : '已开始后台下载，完成后会自动打开系统安装界面。'
        );
      })
      .catch((error) => {
        setInstallFailed(true);
        setMessage(error instanceof Error ? error.message : '更新失败，请稍后重试。');
      })
      .finally(() => {
        setStarting(false);
      });
  };

  const handleCancelDownload = () => {
    if (!downloadActive || cancelling) return;

    setCancelling(true);
    cancelAndroidUpdateDownload()
      .then(() => {
        setDownloadStatus(undefined);
        setMessage('下载已取消，可以重新开始。');
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : '取消下载失败，请稍后重试。');
      })
      .finally(() => setCancelling(false));
  };

  let downloadButtonLabel = '下载并安装';
  if (starting) {
    downloadButtonLabel = '正在启动...';
  } else if (downloadActive) {
    downloadButtonLabel =
      downloadStatus && downloadStatus.percent >= 0
        ? `下载 ${downloadStatus.percent}%`
        : '下载中...';
  }

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <Box
          style={{ width: '100%', paddingInline: toRem(12), boxSizing: 'border-box' }}
          justifyContent="Center"
        >
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              clickOutsideDeactivates: !busy,
              onDeactivate: requestClose,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Dialog
              variant="Background"
              style={{
                width: '100%',
                maxWidth: '34rem',
                maxHeight: 'min(86vh, 42rem)',
                overflow: 'hidden',
              }}
            >
              <Box direction="Column" style={{ maxHeight: 'min(86vh, 42rem)', minHeight: 0 }}>
                <Box
                  direction="Column"
                  gap="400"
                  style={{
                    padding: toRem(20),
                    paddingBottom: toRem(12),
                    overflowY: 'auto',
                    minHeight: 0,
                  }}
                >
                  <Box direction="Column" gap="100">
                    <Text size="H4">发现 Android 新版本</Text>
                    <Text size="T300" priority="300">
                      {`v${APP_VERSION} → v${normalizeDesktopUpdateVersion(update.version)}`}
                    </Text>
                  </Box>
                  <ReleaseNotes body={update.body} emptyText="本次版本包含体验优化与问题修复。" />
                  <Text size="T200" priority="300">
                    安装包托管于 GitHub；部分网络可能下载较慢或失败，可开启代理后重试。
                  </Text>
                  {message && <Text size="T300">{message}</Text>}
                  {downloadActive && downloadStatus && (
                    <Box direction="Column" gap="100">
                      <ProgressBar
                        variant="Primary"
                        size="300"
                        min={0}
                        max={100}
                        value={Math.max(0, downloadStatus.percent)}
                      />
                      <Text size="T200" priority="300">
                        {downloadStatus.totalBytes > 0
                          ? `${formatBytes(downloadStatus.bytesDownloaded)} / ${formatBytes(
                              downloadStatus.totalBytes
                            )}`
                          : '正在连接下载服务器...'}
                      </Text>
                    </Box>
                  )}
                </Box>
                <Box
                  shrink="No"
                  gap="200"
                  wrap="Wrap"
                  justifyContent="End"
                  style={{ padding: `${toRem(12)} ${toRem(20)} ${toRem(20)}` }}
                >
                  <Button
                    variant="Secondary"
                    fill="Soft"
                    size="300"
                    radii="300"
                    onClick={requestClose}
                    disabled={busy}
                  >
                    <Text size="B300">{downloadActive ? '后台下载' : '稍后'}</Text>
                  </Button>
                  {downloadActive && (
                    <Button
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      radii="300"
                      onClick={handleCancelDownload}
                      disabled={busy}
                    >
                      <Text size="B300">{cancelling ? '取消中...' : '取消下载'}</Text>
                    </Button>
                  )}
                  {installFailed && (
                    <Button
                      as="a"
                      href={STARFIRE_DOWNLOAD_PAGE_URL}
                      target="_blank"
                      rel="noreferrer noopener"
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      radii="300"
                      before={<Icon src={Icons.Download} size="100" />}
                    >
                      <Text size="B300">前往下载页</Text>
                    </Button>
                  )}
                  <Button
                    variant="Primary"
                    size="300"
                    radii="300"
                    onClick={handleInstall}
                    disabled={busy || downloadActive}
                    before={
                      busy || downloadActive ? (
                        <Spinner size="100" fill="Solid" variant="Primary" />
                      ) : undefined
                    }
                  >
                    <Text size="B300">{downloadButtonLabel}</Text>
                  </Button>
                </Box>
              </Box>
            </Dialog>
          </FocusTrap>
        </Box>
      </OverlayCenter>
    </Overlay>
  );
}
