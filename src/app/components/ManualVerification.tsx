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
import { persistCurrentDeviceVerification } from '../utils/matrix-crypto';
import { queueCryptoInitialization } from '../utils/cryptoInitializationGate';

export enum ManualVerificationMethod {
  RecoveryPassphrase = 'passphrase',
  RecoveryKey = 'key',
}

const CROSS_SIGNING_SYNC_RETRY_DELAYS_MS = [0, 600, 1500] as const;
const BACKUP_INFO_RETRY_DELAYS_MS = [0, 500, 1200] as const;
const CRYPTO_PREPARE_OPERATION_TIMEOUT_MS = 8_000;
const SINGLE_FLIGHT_FOREGROUND_DEADLINE_MS = 12_000;
const BACKUP_RECOVERY_FOREGROUND_TIMEOUT_MS = 12_000;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const withTimeout = <T,>(task: Promise<T>, timeoutMs: number, message: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    task.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });

type ForegroundTaskResult<T> = { status: 'completed'; value: T } | { status: 'background' };

const waitForTaskForegroundDeadline = <T,>(
  task: Promise<T>,
  timeoutMs: number
): Promise<ForegroundTaskResult<T>> =>
  new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => resolve({ status: 'background' }), timeoutMs);

    // A UI deadline must never reject or cancel the shared SDK task. Keeping
    // both handlers attached also consumes a rejection which arrives after the
    // UI has already detached into its background state.
    task.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve({ status: 'completed', value });
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });

const crossSigningBootstrapTasks = new WeakMap<CryptoApi, Promise<void>>();
const backupPreparationTasks = new WeakMap<CryptoApi, Promise<void>>();
const backupRecoveryTasks = new WeakMap<CryptoApi, Promise<void>>();

const runSingleFlightCryptoTask = (
  tasks: WeakMap<CryptoApi, Promise<void>>,
  crypto: CryptoApi,
  taskFactory: () => Promise<void>
): Promise<void> => {
  const existingTask = tasks.get(crypto);
  if (existingTask) return existingTask;

  const task = Promise.resolve().then(taskFactory);
  tasks.set(crypto, task);

  const clearTask = () => {
    if (tasks.get(crypto) === task) {
      tasks.delete(crypto);
    }
  };
  task.then(clearTask, clearTask);

  return task;
};

const bootstrapCrossSigningSingleFlight = (crypto: CryptoApi): Promise<void> =>
  runSingleFlightCryptoTask(crossSigningBootstrapTasks, crypto, () =>
    crypto.bootstrapCrossSigning({})
  );

const prepareKeyBackupSingleFlight = (
  crypto: CryptoApi,
  preparation: () => Promise<void>
): Promise<void> => runSingleFlightCryptoTask(backupPreparationTasks, crypto, preparation);

const recoverKeyBackupSingleFlight = (
  crypto: CryptoApi,
  recovery: () => Promise<void>
): Promise<void> => runSingleFlightCryptoTask(backupRecoveryTasks, crypto, recovery);

type ManualVerificationResult = {
  status: 'completed' | 'background';
  notice?: string;
};

type VerificationStageResult =
  | { status: 'completed'; notice?: string }
  | { status: 'error'; error: Error };

type BackupPreparationStageResult = { status: 'completed' } | { status: 'error'; error: Error };

type BackupRecoveryStageResult =
  | { status: 'completed' }
  | { status: 'error'; error: Error }
  | { status: 'skipped' };

type ManualVerificationWorkflow = {
  verification: Promise<VerificationStageResult>;
  backupPreparation: Promise<BackupPreparationStageResult>;
  backupRecovery: Promise<BackupRecoveryStageResult>;
};

const manualVerificationWorkflows = new WeakMap<CryptoApi, ManualVerificationWorkflow>();

const getOrCreateManualVerificationWorkflow = (
  crypto: CryptoApi,
  createWorkflow: () => ManualVerificationWorkflow
): ManualVerificationWorkflow => {
  const existingWorkflow = manualVerificationWorkflows.get(crypto);
  if (existingWorkflow) return existingWorkflow;

  const workflow = createWorkflow();
  manualVerificationWorkflows.set(crypto, workflow);

  const clearWorkflow = () => {
    if (manualVerificationWorkflows.get(crypto) === workflow) {
      manualVerificationWorkflows.delete(crypto);
    }
  };
  workflow.backupRecovery.then(clearWorkflow, clearWorkflow);

  return workflow;
};

const toError = (error: unknown, fallbackMessage: string): Error =>
  error instanceof Error ? error : new Error(fallbackMessage);

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

    await withTimeout(
      crypto.userHasCrossSigningKeys(userId, true),
      CRYPTO_PREPARE_OPERATION_TIMEOUT_MS,
      '同步设备验证数据超时，请检查网络后重试。'
    );
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
    return '当前账号没有可恢复的消息备份，旧的加密消息可能暂时仍无法解密。';
  }

  if (
    error.message.includes(
      'loadSessionBackupPrivateKeyFromSecretStorage: unable to get backup version'
    ) ||
    error.message.includes('No backup info available')
  ) {
    return '当前暂时还没读取到消息备份信息。请稍等片刻，旧消息会在备份信息同步后继续恢复；若长时间没有变化，再重试一次。';
  }

  if (
    error.message.includes(
      'loadSessionBackupPrivateKeyFromSecretStorage: decryption key does not match backup info'
    ) ||
    error.message.includes(
      'getBackupDecryptor: key backup on server does not match the decryption key'
    )
  ) {
    return '当前服务器上的消息备份与这把恢复密钥不匹配。请在已验证设备上重新开启消息备份后再试。';
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
  initialMethod?: ManualVerificationMethod;
};
export function ManualVerificationTile({
  secretStorageKeyId,
  secretStorageKeyContent,
  options,
  initialMethod,
}: ManualVerificationTileProps) {
  const mx = useMatrixClient();

  const hasPassphrase = !!secretStorageKeyContent.passphrase;
  const [method, setMethod] = useState(
    initialMethod ??
      (hasPassphrase
        ? ManualVerificationMethod.RecoveryPassphrase
        : ManualVerificationMethod.RecoveryKey)
  );

  const verifyAndRestoreBackup = useCallback(
    async (recoveryKey: Uint8Array): Promise<ManualVerificationResult> => {
      const crypto = mx.getCrypto();
      const userId = mx.getSafeUserId();
      if (!crypto) {
        throw new Error('未找到加密模块，请刷新后重试。');
      }

      const workflow = getOrCreateManualVerificationWorkflow(crypto, () => {
        const initializationLease = queueCryptoInitialization(crypto);
        // Only the workflow which wins the single-flight race may replace the
        // cached recovery key. Reopening the panel with another value while a
        // background workflow is active must not change the key under it.
        const verification = initializationLease.waitForTurn.then(
          async (): Promise<VerificationStageResult> => {
            try {
              storePrivateKey(secretStorageKeyId, recoveryKey);
              let crossSigningStatus = await crypto.getCrossSigningStatus();
              if (!crossSigningStatus.publicKeysOnDevice) {
                const hasCrossSigningKeys = await withTimeout(
                  crypto.userHasCrossSigningKeys(userId, true),
                  CRYPTO_PREPARE_OPERATION_TIMEOUT_MS,
                  '读取设备验证数据超时，请检查网络后重试。'
                );
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

              const cachedPrivateKeys = [
                crossSigningStatus.privateKeysCachedLocally.masterKey,
                crossSigningStatus.privateKeysCachedLocally.selfSigningKey,
                crossSigningStatus.privateKeysCachedLocally.userSigningKey,
              ];
              const hasCompleteCachedPrivateKeys = cachedPrivateKeys.every(Boolean);
              const hasCrossSigningPrivateKeys =
                crossSigningStatus.privateKeysInSecretStorage || hasCompleteCachedPrivateKeys;

              if (!hasCrossSigningPrivateKeys) {
                throw new Error(
                  '当前账号没有完整的可恢复设备验证数据。为避免重置现有验证身份，本次操作已停止；请等待安全数据同步后重试，或改用其他已验证设备。'
                );
              }

              let bootstrapCrossSigningError: Error | undefined;
              for (const delayMs of CROSS_SIGNING_SYNC_RETRY_DELAYS_MS) {
                if (delayMs > 0) {
                  await wait(delayMs);
                }

                try {
                  // The SDK operation is not cancellable. Keep one shared promise
                  // until it really settles; UI deadlines only detach the view.
                  await bootstrapCrossSigningSingleFlight(crypto);
                  bootstrapCrossSigningError = undefined;
                  break;
                } catch (error) {
                  if (!(error instanceof Error) || !isTransientVerificationError(error)) {
                    throw error;
                  }

                  bootstrapCrossSigningError = error;
                  await withTimeout(
                    crypto.userHasCrossSigningKeys(userId, true),
                    CRYPTO_PREPARE_OPERATION_TIMEOUT_MS,
                    '同步设备验证数据超时，请检查网络后重试。'
                  );
                  crossSigningStatus = await crypto.getCrossSigningStatus();
                }
              }

              if (bootstrapCrossSigningError) {
                throw new Error('设备验证数据正在同步，请稍等几秒后再试一次。');
              }

              const verificationResult = await persistCurrentDeviceVerification(mx);
              mx.emit(CryptoEvent.DevicesUpdated, [userId], false);

              return {
                status: 'completed',
                notice: verificationResult.crossSigningSynced
                  ? undefined
                  : '当前设备的本地可信状态已保存，但跨设备签名暂未上传；请保持联网，若其他设备仍显示未验证，可稍后重新输入恢复密钥重试。',
              };
            } catch (error) {
              return {
                status: 'error',
                error: toError(error, '当前设备验证暂时无法完成。'),
              };
            }
          }
        );

        // A key backup can be valid even when cross-signing failed. Do not make restoring
        // historical messages conditional on device verification, but start only after
        // verification has genuinely settled so the two stateful SDK bootstraps cannot overlap.
        const backupPreparation = verification.then(
          async (): Promise<BackupPreparationStageResult> => {
            try {
              await prepareKeyBackupSingleFlight(crypto, async () => {
                await crypto.bootstrapSecretStorage({});
                const backupInfo = await waitForBackupVersionReady(crypto);
                if (!backupInfo?.version) {
                  throw new Error('No backup info available');
                }
                await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
                await crypto.checkKeyBackupAndEnable();
              });
              return { status: 'completed' };
            } catch (error) {
              return {
                status: 'error',
                error: toError(error, '消息备份准备失败。'),
              };
            }
          }
        );

        const backupRecovery = backupPreparation.then(
          async (preparationResult): Promise<BackupRecoveryStageResult> => {
            if (preparationResult.status === 'error') {
              return { status: 'skipped' };
            }

            try {
              await recoverKeyBackupSingleFlight(crypto, async () => {
                await crypto.restoreKeyBackup();
                await Promise.allSettled(
                  mx.getRooms().map((room) =>
                    decryptAllTimelineEvent(mx, room.getLiveTimeline(), {
                      retryFailures: true,
                    })
                  )
                );
              });
              return { status: 'completed' };
            } catch (error) {
              return {
                status: 'error',
                error: toError(error, '消息备份恢复失败。'),
              };
            }
          }
        );
        backupRecovery.then(initializationLease.release, initializationLease.release);

        return { verification, backupPreparation, backupRecovery };
      });

      const verificationForeground = await waitForTaskForegroundDeadline(
        workflow.verification,
        SINGLE_FLIGHT_FOREGROUND_DEADLINE_MS
      );
      if (verificationForeground.status === 'background') {
        return {
          status: 'background',
          notice: '设备验证仍在后台处理中；完成后会继续准备消息备份并恢复旧消息。',
        };
      }
      const verificationResult = verificationForeground.value;

      const preparationForeground = await waitForTaskForegroundDeadline(
        workflow.backupPreparation,
        SINGLE_FLIGHT_FOREGROUND_DEADLINE_MS
      );
      if (preparationForeground.status === 'background') {
        const backupNotice = '消息备份仍在后台准备；准备完成后会继续恢复旧消息。';
        if (verificationResult.status === 'error') {
          throw new Error(
            `恢复密钥正确，但当前设备验证失败：${verificationResult.error.message} ${backupNotice}`
          );
        }
        return {
          status: 'background',
          notice: [verificationResult.notice, backupNotice].filter(Boolean).join(' '),
        };
      }
      const preparationResult = preparationForeground.value;

      let backupNotice: string | undefined;
      let recoveryInBackground = false;
      if (preparationResult.status === 'error') {
        backupNotice =
          getBackupRestoreNotice(preparationResult.error) ??
          `消息备份恢复失败：${preparationResult.error.message}`;
      } else {
        const recoveryForeground = await waitForTaskForegroundDeadline(
          workflow.backupRecovery,
          BACKUP_RECOVERY_FOREGROUND_TIMEOUT_MS
        );
        if (recoveryForeground.status === 'background') {
          recoveryInBackground = true;
          backupNotice = '旧消息正在后台恢复，已进入过的房间会逐步重新解密。';
        } else if (recoveryForeground.value.status === 'error') {
          backupNotice =
            getBackupRestoreNotice(recoveryForeground.value.error) ??
            `消息备份恢复失败：${recoveryForeground.value.error.message}`;
        }
      }

      if (verificationResult.status === 'error') {
        const suffix = backupNotice ? ` ${backupNotice}` : ' 消息备份仍已按恢复密钥继续处理。';
        throw new Error(
          `恢复密钥正确，但当前设备验证失败：${verificationResult.error.message}${suffix}`
        );
      }

      return {
        status: recoveryInBackground ? 'background' : 'completed',
        notice: [verificationResult.notice, backupNotice].filter(Boolean).join(' ') || undefined,
      };
    },
    [mx, secretStorageKeyId]
  );

  const [verifyState, handleDecodedRecoveryKey] = useAsyncCallback<
    ManualVerificationResult,
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
          <Text
            size="T200"
            style={{
              color:
                verifyState.data.status === 'background' ? color.Warning.Main : color.Success.Main,
            }}
          >
            <b>
              {verifyState.data.status === 'background'
                ? '安全恢复仍在后台处理中。'
                : '设备验证成功。'}
            </b>
          </Text>
          {verifyState.data.status === 'background' && (
            <Text size="T200">可以关闭此面板，稍后再回来查看设备验证和旧消息恢复状态。</Text>
          )}
          {verifyState.data.notice && (
            <Text size="T200" style={{ color: color.Warning.Main }}>
              <b>{verifyState.data.notice}</b>
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
