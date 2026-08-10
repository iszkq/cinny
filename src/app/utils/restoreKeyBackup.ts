import { CryptoApi, ImportRoomKeyProgressData } from 'matrix-js-sdk/lib/crypto-api';
import type { KeyBackupInfo, KeyBackupRestoreResult } from 'matrix-js-sdk/lib/crypto-api/keybackup';
import { BackupProgressStatus, IBackupProgress } from '../state/backupRestore';

const RESTORE_BACKGROUND_TIMEOUT_MS = 45000;
const RESTORE_BACKGROUND_MESSAGE =
  '恢复时间较长，仍在继续。你可以先正常使用，旧消息会在恢复完成后逐步恢复。';
const DEFAULT_RESTORE_ERROR_MESSAGE = '恢复加密备份失败，请稍后重试。';

let latestRestoreJobId = 0;

const createRestoreJobId = () => {
  latestRestoreJobId += 1;
  return latestRestoreJobId;
};

const isLatestRestoreJob = (jobId: number) => latestRestoreJobId === jobId;

const normalizeRestoreError = (error: unknown): Error => {
  if (error instanceof Error) return error;
  return new Error(DEFAULT_RESTORE_ERROR_MESSAGE);
};

const hasUsableBackup = (
  backupInfo: KeyBackupInfo | null | undefined
): backupInfo is KeyBackupInfo => Boolean(backupInfo?.version);

export const assertCompleteKeyBackupRestore = (result: KeyBackupRestoreResult): void => {
  if (result.imported < result.total) {
    throw new Error(`消息备份仅恢复 ${result.imported} / ${result.total} 条密钥，请重试。`);
  }
};

export const getBackupRestoreErrorMessage = (error: unknown): string => {
  const normalizedError = normalizeRestoreError(error);
  const { message } = normalizedError;

  if (/[\u4e00-\u9fff]/u.test(message)) {
    return message;
  }

  if (message.includes('No decryption key found in crypto store')) {
    return '尚未找到可用的恢复密钥，请先完成设备验证或重新导入恢复密钥。';
  }

  if (
    message.includes('No backup info available') ||
    message.includes('Backup version to restore') ||
    message.includes('当前账号没有可恢复的消息备份。')
  ) {
    return '服务器上暂时没有可恢复的消息备份。请确认旧设备已经开启消息备份。';
  }

  if (
    message.includes(
      'getBackupDecryptor: key backup on server does not match the decryption key'
    ) ||
    message.includes('decryption key does not match backup info')
  ) {
    return '当前服务器上的消息备份与这把恢复密钥不匹配，请在已验证设备上重新开启消息备份后再试。';
  }

  if (
    message.includes('fetch failed') ||
    message.includes('Failed to fetch') ||
    message.includes('NetworkError') ||
    message.includes('ERR_NETWORK') ||
    message.includes('ERR_CONNECTION') ||
    message.includes('ERR_INTERNET')
  ) {
    return '连接服务器失败，暂时无法恢复加密备份，请检查网络或代理后重试。';
  }

  return DEFAULT_RESTORE_ERROR_MESSAGE;
};

type RunKeyBackupRestoreOptions = {
  crypto: CryptoApi;
  setRestoreProgress: (progress: ImportRoomKeyProgressData) => void;
  setBackupRestoreProgress: (progress: IBackupProgress) => void;
  retryTimelineDecryption?: () => Promise<void>;
  backgroundMessage?: string;
  timeoutMs?: number;
};

export type KeyBackupRestoreRunResult = 'completed' | 'background';

export const runKeyBackupRestore = async ({
  crypto,
  setRestoreProgress,
  setBackupRestoreProgress,
  retryTimelineDecryption,
  backgroundMessage = RESTORE_BACKGROUND_MESSAGE,
  timeoutMs = RESTORE_BACKGROUND_TIMEOUT_MS,
}: RunKeyBackupRestoreOptions): Promise<KeyBackupRestoreRunResult> => {
  const jobId = createRestoreJobId();
  let backgrounded = false;

  const updateRestoreState = (progress: IBackupProgress) => {
    if (isLatestRestoreJob(jobId)) {
      setBackupRestoreProgress(progress);
    }
  };

  const updateRestoreProgress = (progress: ImportRoomKeyProgressData) => {
    if (isLatestRestoreJob(jobId)) {
      setRestoreProgress(progress);
    }
  };

  updateRestoreState({ status: BackupProgressStatus.Fetching });

  const restoreTask = (async () => {
    await crypto.checkKeyBackupAndEnable();

    const backupInfo = await crypto.getKeyBackupInfo();
    if (!hasUsableBackup(backupInfo)) {
      throw new Error('当前账号没有可恢复的消息备份。');
    }

    const result = await crypto.restoreKeyBackup({
      progressCallback(progress) {
        updateRestoreProgress(progress);
      },
    });
    assertCompleteKeyBackupRestore(result);
    if (retryTimelineDecryption) {
      updateRestoreState({ status: BackupProgressStatus.Decrypting });
      await retryTimelineDecryption();
    }
  })();

  return new Promise<KeyBackupRestoreRunResult>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      backgrounded = true;
      updateRestoreState({
        status: BackupProgressStatus.Background,
        message: backgroundMessage,
      });
      resolve('background');
    }, timeoutMs);

    restoreTask
      .then(() => {
        window.clearTimeout(timeoutId);
        updateRestoreState({
          status: BackupProgressStatus.Done,
          message: '备份密钥已恢复，旧消息将在打开时逐步解密。',
        });
        resolve('completed');
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        const normalizedError = normalizeRestoreError(error);

        if (backgrounded) {
          updateRestoreState({
            status: BackupProgressStatus.Error,
            message: getBackupRestoreErrorMessage(normalizedError),
          });
          resolve('background');
          return;
        }

        reject(normalizedError);
      });
  });
};
