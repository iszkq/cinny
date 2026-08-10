import React, { MouseEventHandler, useCallback, useState } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';
import type { KeyBackupInfo } from 'matrix-js-sdk/lib/crypto-api/keybackup';
import {
  Badge,
  Box,
  Button,
  color,
  config,
  Icon,
  IconButton,
  Icons,
  Menu,
  percent,
  PopOut,
  ProgressBar,
  RectCords,
  Spinner,
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import {
  BackupProgressStatus,
  backupRestoreProgressAtom,
  setBackupRestoreProgressAtom,
} from '../state/backupRestore';
import { InfoCard } from './info-card';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import {
  useKeyBackupInfo,
  useKeyBackupStatus,
  useKeyBackupSync,
  useKeyBackupTrust,
} from '../hooks/useKeyBackup';
import { stopPropagation } from '../utils/keyboard';
import { getBackupRestoreErrorMessage, runKeyBackupRestore } from '../utils/restoreKeyBackup';

type BackupStatusProps = {
  enabled: boolean;
};
function BackupStatus({ enabled }: BackupStatusProps) {
  return (
    <Box as="span" gap="100" alignItems="Center">
      <Badge variant={enabled ? 'Success' : 'Critical'} fill="Solid" size="200" radii="Pill" />
      <Text
        as="span"
        size="L400"
        style={{ color: enabled ? color.Success.Main : color.Critical.Main }}
      >
        {enabled ? '已连接' : '未连接'}
      </Text>
    </Box>
  );
}

type BackupSyncingProps = {
  count: number;
};
function BackupSyncing({ count }: BackupSyncingProps) {
  return (
    <Box as="span" gap="100" alignItems="Center">
      <Spinner size="50" variant="Primary" fill="Soft" />
      <Text as="span" size="L400" style={{ color: color.Primary.Main }}>
        同步中 ({count})
      </Text>
    </Box>
  );
}

function BackupProgressFetching() {
  return (
    <Box grow="Yes" gap="200" alignItems="Center" justifyContent="End">
      <Badge variant="Secondary" fill="Solid" radii="300">
        <Text size="L400">正在准备恢复...</Text>
      </Badge>
      <Spinner size="50" variant="Secondary" fill="Soft" />
    </Box>
  );
}

type BackupProgressProps = {
  total: number;
  downloaded: number;
};
function BackupProgress({ total, downloaded }: BackupProgressProps) {
  return (
    <Box grow="Yes" gap="200" alignItems="Center">
      <Badge variant="Secondary" fill="Solid" radii="300">
        <Text size="L400">恢复中：{`${Math.round(percent(0, total, downloaded))}%`}</Text>
      </Badge>
      <Box grow="Yes" direction="Column">
        <ProgressBar variant="Secondary" size="300" min={0} max={total} value={downloaded} />
      </Box>
      <Badge variant="Secondary" fill="Soft" radii="Pill">
        <Text size="L400">
          {downloaded} / {total}
        </Text>
      </Badge>
    </Box>
  );
}

type BackupMessageProps = {
  message: string;
  tone: 'warning' | 'critical';
};
function BackupMessage({ message, tone }: BackupMessageProps) {
  return (
    <Text
      size="T200"
      style={{ color: tone === 'warning' ? color.Warning.Main : color.Critical.Main }}
    >
      <b>{message}</b>
    </Text>
  );
}

type BackupTrustInfoProps = {
  crypto: CryptoApi;
  backupInfo: KeyBackupInfo;
};
function BackupTrustInfo({ crypto, backupInfo }: BackupTrustInfoProps) {
  const trust = useKeyBackupTrust(crypto, backupInfo);

  if (!trust) return null;

  return (
    <Box direction="Column">
      {trust.matchesDecryptionKey ? (
        <Text size="T200" style={{ color: color.Success.Main }}>
          <b>备份包含可信的解密密钥。</b>
        </Text>
      ) : (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          <b>备份缺少可信的解密密钥。</b>
        </Text>
      )}
      {trust.trusted ? (
        <Text size="T200" style={{ color: color.Success.Main }}>
          <b>备份签名已受信任。</b>
        </Text>
      ) : (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          <b>备份签名未受信任。</b>
        </Text>
      )}
    </Box>
  );
}

type BackupRestoreTileProps = {
  crypto: CryptoApi;
};
export function BackupRestoreTile({ crypto }: BackupRestoreTileProps) {
  const [restoreProgress, setRestoreProgress] = useAtom(backupRestoreProgressAtom);
  const setBackupRestoreProgress = useSetAtom(setBackupRestoreProgressAtom);
  const restoring =
    restoreProgress.status === BackupProgressStatus.Fetching ||
    restoreProgress.status === BackupProgressStatus.Loading ||
    restoreProgress.status === BackupProgressStatus.Background;

  const backupEnabled = useKeyBackupStatus(crypto);
  const backupInfo = useKeyBackupInfo(crypto);
  const [remainingSession, syncFailure] = useKeyBackupSync();

  const [menuCords, setMenuCords] = useState<RectCords>();

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const [restoreState, restoreBackup] = useAsyncCallback<void, Error, []>(
    useCallback(async () => {
      try {
        await runKeyBackupRestore({
          crypto,
          setRestoreProgress,
          setBackupRestoreProgress,
        });
        return undefined;
      } catch (error) {
        setBackupRestoreProgress({ status: BackupProgressStatus.Idle });
        throw error;
      }
    }, [crypto, setBackupRestoreProgress, setRestoreProgress])
  );

  const handleRestore = () => {
    setMenuCords(undefined);
    restoreBackup();
  };

  return (
    <InfoCard
      variant="Surface"
      title="加密备份"
      after={
        <Box alignItems="Center" gap="200">
          {remainingSession === 0 ? (
            <BackupStatus enabled={backupEnabled} />
          ) : (
            <BackupSyncing count={remainingSession} />
          )}
          <IconButton
            aria-pressed={!!menuCords}
            size="300"
            variant="Surface"
            radii="300"
            onClick={handleMenu}
          >
            <Icon size="100" src={Icons.VerticalDots} />
          </IconButton>
          <PopOut
            anchor={menuCords}
            offset={5}
            position="Bottom"
            align="End"
            content={
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  onDeactivate: () => setMenuCords(undefined),
                  clickOutsideDeactivates: true,
                  isKeyForward: (evt: KeyboardEvent) =>
                    evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
                  isKeyBackward: (evt: KeyboardEvent) =>
                    evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Menu
                  style={{
                    padding: config.space.S100,
                  }}
                >
                  <Box direction="Column" gap="100">
                    <Box direction="Column" gap="200">
                      <InfoCard
                        variant="SurfaceVariant"
                        title="备份详情"
                        description={
                          <>
                            <span>版本：{backupInfo?.version ?? 'N/A'}</span>
                            <br />
                            <span>密钥：{backupInfo?.count ?? 'N/A'}</span>
                          </>
                        }
                      />
                    </Box>
                    <Button
                      size="300"
                      variant="Success"
                      radii="300"
                      aria-disabled={restoreState.status === AsyncStatus.Loading || restoring}
                      onClick={
                        restoreState.status === AsyncStatus.Loading || restoring
                          ? undefined
                          : handleRestore
                      }
                      before={<Icon size="100" src={Icons.Download} />}
                    >
                      <Text size="B300">恢复备份</Text>
                    </Button>
                  </Box>
                </Menu>
              </FocusTrap>
            }
          />
        </Box>
      }
    >
      {syncFailure && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          <b>{syncFailure}</b>
        </Text>
      )}
      {!backupEnabled && backupInfo === null && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          <b>服务器上没有可用备份。</b>
        </Text>
      )}
      {!syncFailure && !backupEnabled && backupInfo && (
        <Box direction="Column" gap="200">
          <Text size="T200">
            加密备份未连接不会改变本机的设备验证状态；需要重新连接时，可使用上方的恢复密钥入口。
          </Text>
          <BackupTrustInfo crypto={crypto} backupInfo={backupInfo} />
        </Box>
      )}
      {restoreState.status === AsyncStatus.Loading && !restoring && <BackupProgressFetching />}
      {restoreProgress.status === BackupProgressStatus.Fetching && <BackupProgressFetching />}
      {restoreProgress.status === BackupProgressStatus.Loading && (
        <BackupProgress
          total={restoreProgress.data.total}
          downloaded={restoreProgress.data.downloaded}
        />
      )}
      {restoreProgress.status === BackupProgressStatus.Background && (
        <BackupMessage message={restoreProgress.message} tone="warning" />
      )}
      {restoreProgress.status === BackupProgressStatus.Error && (
        <BackupMessage message={restoreProgress.message} tone="critical" />
      )}
      {restoreState.status === AsyncStatus.Error && (
        <BackupMessage message={getBackupRestoreErrorMessage(restoreState.error)} tone="critical" />
      )}
    </InfoCard>
  );
}
