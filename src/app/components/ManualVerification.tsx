import React, { MouseEventHandler, ReactNode, useCallback, useEffect, useState } from 'react';
import { CryptoEvent, type CryptoApi } from 'matrix-js-sdk/lib/crypto-api';
import {
  Box,
  Text,
  Chip,
  Icon,
  Icons,
  RectCords,
  PopOut,
  Menu,
  config,
  MenuItem,
  color,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '../utils/keyboard';
import { SettingTile } from './setting-tile';
import { SecretStorageKeyContent } from '../../types/matrix/accountData';
import { SecretStorageRecoveryKey, SecretStorageRecoveryPassphrase } from './SecretStorage';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { storePrivateKey } from '../../client/secretStorageKeys';
import { decryptAllTimelineEvent } from '../utils/room';

export enum ManualVerificationMethod {
  RecoveryPassphrase = 'passphrase',
  RecoveryKey = 'key',
}

const CROSS_SIGNING_SYNC_RETRY_DELAYS_MS = [0, 600, 1500, 3000] as const;
const BACKUP_INFO_RETRY_DELAYS_MS = [0, 500, 1200, 2400] as const;
const BACKUP_RESTORE_FOREGROUND_TIMEOUT_MS = 15000;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const isTransientVerificationError = (error: Error): boolean =>
  error.message.includes('importCrossSigningKeys failed to import the keys') ||
  error.message.includes('downloadKeys is not a function');

const waitForCrossSigningKeysReady = async (crypto: CryptoApi, userId: string) => {
  let latestStatus = await crypto.getCrossSigningStatus();
  if (latestStatus.publicKeysOnDevice) {
    return latestStatus;
  }

  for (const delayMs of CROSS_SIGNING_SYNC_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    await crypto.userHasCrossSigningKeys(userId, true);
    latestStatus = await crypto.getCrossSigningStatus();

    if (latestStatus.publicKeysOnDevice) {
      return latestStatus;
    }
  }

  return latestStatus;
};

const waitForBackupVersionReady = async (crypto: CryptoApi) => {
  for (const delayMs of BACKUP_INFO_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    const backupInfo = await crypto.getKeyBackupInfo();
    if (backupInfo?.version) {
      return backupInfo;
    }
  }

  return undefined;
};

const getBackupRestoreNotice = (error: Error): string | undefined => {
  if (
    error.message.includes(
      'loadSessionBackupPrivateKeyFromSecretStorage: missing decryption key in secret storage'
    )
  ) {
    return '设备验证已完成，但当前账号没有可恢复的消息备份。旧的加密消息可能暂时仍无法解密。';
  }

  if (
    error.message.includes(
      'loadSessionBackupPrivateKeyFromSecretStorage: unable to get backup version'
    ) ||
    error.message.includes('No backup info available')
  ) {
    return '设备验证已完成，但当前暂时还没读取到消息备份信息。请稍等片刻，旧消息会在备份信息同步后继续恢复；若长时间没有变化，再重试一次。';
  }

  if (
    error.message.includes(
      'loadSessionBackupPrivateKeyFromSecretStorage: decryption key does not match backup info'
    ) ||
    error.message.includes(
      'getBackupDecryptor: key backup on server does not match the decryption key'
    )
  ) {
    return '设备验证已完成，但当前服务器上的消息备份与这把恢复密钥不匹配。请在已验证设备上重新开启消息备份后再试。';
  }

  return undefined;
};

const getManualVerificationErrorMessage = (error: Error): string => {
  if (error.message.includes('downloadKeys is not a function')) {
    return '当前客户端仍在使用旧的设备验证流程，请刷新应用后重试。若问题持续存在，请彻底退出后重新打开应用。';
  }

  if (error.message.includes('importCrossSigningKeys failed to import the keys')) {
    return '恢复密钥导入失败，请稍后重试。若刚重新登录，请等待设备列表同步后再试一次。';
  }

  return error.message;
};

type ManualVerificationMethodSwitcherProps = {
  value: ManualVerificationMethod;
  onChange: (value: ManualVerificationMethod) => void;
};
export function ManualVerificationMethodSwitcher({
  value,
  onChange,
}: ManualVerificationMethodSwitcherProps) {
  const [menuCords, setMenuCords] = useState<RectCords>();

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (method: ManualVerificationMethod) => {
    setMenuCords(undefined);
    onChange(method);
  };

  return (
    <>
      <Chip
        type="button"
        variant="Secondary"
        fill="Soft"
        radii="Pill"
        before={<Icon size="100" src={Icons.ChevronBottom} />}
        onClick={handleMenu}
      >
        <Text as="span" size="B300">
          {value === ManualVerificationMethod.RecoveryPassphrase && '恢复口令'}
          {value === ManualVerificationMethod.RecoveryKey && '恢复密钥'}
        </Text>
      </Chip>
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
            <Menu>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                <MenuItem
                  size="300"
                  variant="Surface"
                  aria-selected={value === ManualVerificationMethod.RecoveryPassphrase}
                  radii="300"
                  onClick={() => handleSelect(ManualVerificationMethod.RecoveryPassphrase)}
                >
                  <Box grow="Yes">
                    <Text size="T300">恢复口令</Text>
                  </Box>
                </MenuItem>
                <MenuItem
                  size="300"
                  variant="Surface"
                  aria-selected={value === ManualVerificationMethod.RecoveryKey}
                  radii="300"
                  onClick={() => handleSelect(ManualVerificationMethod.RecoveryKey)}
                >
                  <Box grow="Yes">
                    <Text size="T300">恢复密钥</Text>
                  </Box>
                </MenuItem>
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
    </>
  );
}

type ManualVerificationTileProps = {
  secretStorageKeyId: string;
  secretStorageKeyContent: SecretStorageKeyContent;
  options?: ReactNode;
};
export function ManualVerificationTile({
  secretStorageKeyId,
  secretStorageKeyContent,
  options,
}: ManualVerificationTileProps) {
  const mx = useMatrixClient();

  const hasPassphrase = !!secretStorageKeyContent.passphrase;
  const [method, setMethod] = useState(
    hasPassphrase
      ? ManualVerificationMethod.RecoveryPassphrase
      : ManualVerificationMethod.RecoveryKey
  );

  const verifyAndRestoreBackup = useCallback(
    async (recoveryKey: Uint8Array) => {
      const crypto = mx.getCrypto();
      const userId = mx.getSafeUserId();
      if (!crypto) {
        throw new Error('未找到加密模块，请刷新后重试。');
      }

      storePrivateKey(secretStorageKeyId, recoveryKey);

      // A key backup can be valid even when cross-signing has not synced yet
      // (or is not configured for an older account). Do not make restoring
      // historical messages conditional on device verification.
      let verificationNotice: string | undefined;
      try {
        let crossSigningStatus = await crypto.getCrossSigningStatus();
        if (!crossSigningStatus.publicKeysOnDevice) {
          const hasCrossSigningKeys = await crypto.userHasCrossSigningKeys(userId, true);
          if (!hasCrossSigningKeys) {
            throw new Error(
              '当前账号没有可恢复的设备验证数据。请先在已验证设备上启用设备验证，或改用其他已验证设备来完成验证。'
            );
          }
          crossSigningStatus = await waitForCrossSigningKeysReady(crypto, userId);
        }

        if (!crossSigningStatus.publicKeysOnDevice) {
          throw new Error('设备验证数据正在同步，请稍等几秒后再试一次。');
        }

        const hasCrossSigningPrivateKeys =
          crossSigningStatus.privateKeysInSecretStorage ||
          Object.values(crossSigningStatus.privateKeysCachedLocally).some(Boolean);

        if (!hasCrossSigningPrivateKeys) {
          throw new Error(
            '当前账号没有可恢复的设备验证数据。请先在已验证设备上启用设备验证，或改用其他已验证设备来完成验证。'
          );
        }

        let bootstrapCrossSigningError: Error | undefined;
        for (const delayMs of CROSS_SIGNING_SYNC_RETRY_DELAYS_MS) {
          if (delayMs > 0) {
            await wait(delayMs);
          }

          try {
            await crypto.bootstrapCrossSigning({});
            bootstrapCrossSigningError = undefined;
            break;
          } catch (error) {
            if (!(error instanceof Error) || !isTransientVerificationError(error)) {
              throw error;
            }

            bootstrapCrossSigningError = error;
            crossSigningStatus = await waitForCrossSigningKeysReady(crypto, userId);
          }
        }

        if (bootstrapCrossSigningError) {
          throw new Error('设备验证数据正在同步，请稍等几秒后再试一次。');
        }
      } catch {
        verificationNotice =
          '\u8bbe\u5907\u9a8c\u8bc1\u6682\u65f6\u65e0\u6cd5\u5b8c\u6210\uff0c\u4f46\u52a0\u5bc6\u5907\u4efd\u6062\u590d\u5c06\u7ee7\u7eed\u8fdb\u884c\u3002';
      }

      await crypto.bootstrapSecretStorage({});

      try {
        await waitForBackupVersionReady(crypto);
        await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
        await crypto.checkKeyBackupAndEnable();

        const restoreTask = crypto.restoreKeyBackup().then(async () => {
          await Promise.allSettled(
            mx
              .getRooms()
              .map((room) =>
                decryptAllTimelineEvent(mx, room.getLiveTimeline(), { retryFailures: true })
              )
          );
        });
        const restoreResultPromise = restoreTask.then(
          () => ({ status: 'completed' as const }),
          (restoreError: unknown) => ({
            status: 'error' as const,
            restoreError,
          })
        );
        const restoreResult = await Promise.race([
          restoreResultPromise,
          wait(BACKUP_RESTORE_FOREGROUND_TIMEOUT_MS).then(() => ({
            status: 'background' as const,
          })),
        ]);

        if (restoreResult.status === 'error') {
          throw restoreResult.restoreError;
        }
        if (restoreResult.status === 'background') {
          return '设备验证已完成，旧消息正在后台恢复，已进入过的房间会逐步重新解密。';
        }
      } catch (error) {
        const backupRestoreNotice =
          error instanceof Error ? getBackupRestoreNotice(error) : undefined;
        if (backupRestoreNotice) {
          return backupRestoreNotice;
        }
        throw error;
      }

      return verificationNotice;
    },
    [mx, secretStorageKeyId]
  );

  const [verifyState, handleDecodedRecoveryKey] = useAsyncCallback<
    string | undefined,
    Error,
    [Uint8Array]
  >(verifyAndRestoreBackup);
  const verifying = verifyState.status === AsyncStatus.Loading;

  useEffect(() => {
    if (verifyState.status === AsyncStatus.Success) {
      mx.emit(CryptoEvent.DevicesUpdated, [mx.getSafeUserId()], false);
    }
  }, [mx, verifyState.status]);

  return (
    <Box direction="Column" gap="200">
      <SettingTile
        title="手动验证"
        description={hasPassphrase ? '请选择验证方式。' : '请输入恢复密钥。'}
        after={
          <Box alignItems="Center" gap="200">
            {hasPassphrase && (
              <ManualVerificationMethodSwitcher value={method} onChange={setMethod} />
            )}
            {options}
          </Box>
        }
      />
      {verifyState.status === AsyncStatus.Success ? (
        <Box direction="Column" gap="100">
          <Text size="T200" style={{ color: color.Success.Main }}>
            <b>设备验证成功。</b>
          </Text>
          {verifyState.data && (
            <Text size="T200" style={{ color: color.Warning.Main }}>
              <b>{verifyState.data}</b>
            </Text>
          )}
        </Box>
      ) : (
        <Box direction="Column" gap="100">
          {method === ManualVerificationMethod.RecoveryKey && (
            <SecretStorageRecoveryKey
              processing={verifying}
              keyContent={secretStorageKeyContent}
              onDecodedRecoveryKey={handleDecodedRecoveryKey}
            />
          )}
          {method === ManualVerificationMethod.RecoveryPassphrase &&
            secretStorageKeyContent.passphrase && (
              <SecretStorageRecoveryPassphrase
                processing={verifying}
                keyContent={secretStorageKeyContent}
                passphraseContent={secretStorageKeyContent.passphrase}
                onDecodedRecoveryKey={handleDecodedRecoveryKey}
              />
            )}
          {verifyState.status === AsyncStatus.Error && (
            <Text size="T200" style={{ color: color.Critical.Main }}>
              <b>{getManualVerificationErrorMessage(verifyState.error)}</b>
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}
