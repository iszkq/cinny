import React, { useMemo, useState } from 'react';
import { Box, Button, Text, toRem } from 'folds';
import {
  checkForDesktopUpdate,
  isDesktopUpdaterSupported,
  PendingDesktopUpdate,
  relaunchDesktopApp,
  UpdaterProgressEvent,
} from '../../../utils/desktopUpdater';
import { APP_VERSION } from '../../../constants/branding';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { SequenceCardStyle } from '../styles.css';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'latest' | 'downloading' | 'installed' | 'error';

const formatProgress = (downloaded: number, contentLength: number): string => {
  if (contentLength <= 0) {
    return `已下载 ${(downloaded / 1024 / 1024).toFixed(2)} MB`;
  }

  const percent = Math.min(100, Math.round((downloaded / contentLength) * 100));
  return `正在下载 ${percent}%`;
};

const getUpdateErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);

  if (/pubkey/i.test(message) || /signature/i.test(message)) {
    return '自动更新已接入，但当前缺少有效的更新公钥或签名配置。';
  }
  if (/endpoint/i.test(message) || /404|204|json/i.test(message)) {
    return '未能获取更新信息，请检查更新地址和发布的 latest.json 文件。';
  }
  if (/Desktop updater/i.test(message)) {
    return '当前环境不是桌面端，无法使用自动更新。';
  }

  return `检查更新失败：${message}`;
};

export function DesktopUpdater() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [message, setMessage] = useState(
    '桌面端支持一键检测并安装新版本；正式上线前还需要配置更新公钥和发布地址。'
  );
  const [pendingUpdate, setPendingUpdate] = useState<PendingDesktopUpdate>();
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [contentLength, setContentLength] = useState(0);

  const desktopSupported = isDesktopUpdaterSupported();

  const progressText = useMemo(() => {
    if (status !== 'downloading') return undefined;
    return formatProgress(downloadedBytes, contentLength);
  }, [contentLength, downloadedBytes, status]);

  const handleCheckUpdate = async () => {
    if (!desktopSupported) {
      setStatus('error');
      setPendingUpdate(undefined);
      setMessage('当前不是桌面端环境，网页端不会显示自动更新。');
      return;
    }

    setStatus('checking');
    setPendingUpdate(undefined);
    setDownloadedBytes(0);
    setContentLength(0);
    setMessage('正在检查新版本...');

    try {
      const update = await checkForDesktopUpdate();
      if (!update) {
        setStatus('latest');
        setMessage(`当前已经是最新版本 v${APP_VERSION}。`);
        return;
      }

      setPendingUpdate(update);
      setStatus('available');
      setMessage(`发现新版本 v${update.version}，可以直接下载并安装。`);
    } catch (error) {
      setStatus('error');
      setMessage(getUpdateErrorMessage(error));
    }
  };

  const handleDownloadAndInstall = async () => {
    if (!pendingUpdate) return;

    setStatus('downloading');
    setDownloadedBytes(0);
    setContentLength(0);
    setMessage(`正在下载并安装 v${pendingUpdate.version}...`);

    try {
      await pendingUpdate.downloadAndInstall((event: UpdaterProgressEvent) => {
        if (event.event === 'Started') {
          setContentLength(event.data.contentLength ?? 0);
          setDownloadedBytes(0);
          return;
        }
        if (event.event === 'Progress') {
          setDownloadedBytes((current) => current + event.data.chunkLength);
        }
      });

      setStatus('installed');
      setMessage('更新已安装，应用将尝试重新启动。Windows 下安装前应用会自动退出。');
      await relaunchDesktopApp().catch(() => undefined);
    } catch (error) {
      setStatus('error');
      setMessage(getUpdateErrorMessage(error));
    }
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">桌面更新</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="当前版本"
          description={`v${APP_VERSION}${pendingUpdate ? ` -> 可更新到 v${pendingUpdate.version}` : ''}`}
        />
        <SettingTile
          title="自动检查更新"
          description={progressText ?? message}
          after={
            <Box wrap="Wrap" gap="200" justifyContent="End">
              <Button
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="300"
                onClick={handleCheckUpdate}
                disabled={status === 'checking' || status === 'downloading'}
              >
                <Text size="B300">{status === 'checking' ? '检查中...' : '检查更新'}</Text>
              </Button>
              {pendingUpdate && (
                <Button
                  variant="Primary"
                  size="300"
                  radii="300"
                  onClick={handleDownloadAndInstall}
                  disabled={status === 'downloading'}
                >
                  <Text size="B300">{status === 'downloading' ? '安装中...' : '下载并安装'}</Text>
                </Button>
              )}
            </Box>
          }
        />
        {pendingUpdate?.body && (
          <SettingTile
            title="更新说明"
            description={
              <span
                style={{
                  whiteSpace: 'pre-wrap',
                  display: 'inline-block',
                  maxWidth: toRem(560),
                }}
              >
                {pendingUpdate.body}
              </span>
            }
          />
        )}
      </SequenceCard>
    </Box>
  );
}
