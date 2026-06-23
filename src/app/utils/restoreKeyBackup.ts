import {
  CryptoApi,
  ImportRoomKeyProgressData,
} from 'matrix-js-sdk/lib/crypto-api';
import type { KeyBackupInfo } from 'matrix-js-sdk/lib/crypto-api/keybackup';
import { BackupProgressStatus, IBackupProgress } from '../state/backupRestore';

const RESTORE_BACKGROUND_TIMEOUT_MS = 15000;
const RESTORE_BACKGROUND_MESSAGE =
  '??????????,???????????????????,???????????????';
const DEFAULT_RESTORE_ERROR_MESSAGE = '????????,??????';

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

export const getBackupRestoreErrorMessage = (error: unknown): string => {
  const normalizedError = normalizeRestoreError(error);
  const { message } = normalizedError;

  if (/[\u4e00-\u9fff]/u.test(message)) {
    return message;
  }

  if (message.includes('No decryption key found in crypto store')) {
    return '???????????,??????????????????';
  }

  if (
    message.includes('No backup info available') ||
    message.includes('Backup version to restore') ||
    message.includes('???????????????')
  ) {
    return '????????????????????????????????';
  }

  if (
    message.includes('getBackupDecryptor: key backup on server does not match the decryption key') ||
    message.includes('decryption key does not match backup info')
  ) {
    return '?????????????????????,????????????????????';
  }

  if (
    message.includes('fetch failed') ||
    message.includes('Failed to fetch') ||
    message.includes('NetworkError') ||
    message.includes('ERR_NETWORK') ||
    message.includes('ERR_CONNECTION') ||
    message.includes('ERR_INTERNET')
  ) {
    return '???????,??????????,????????????';
  }

  return DEFAULT_RESTORE_ERROR_MESSAGE;
};

type RunKeyBackupRestoreOptions = {
  crypto: CryptoApi;
  setRestoreProgress: (progress: ImportRoomKeyProgressData) => void;
  setBackupRestoreProgress: (progress: IBackupProgress) => void;
  backgroundMessage?: string;
  timeoutMs?: number;
};

export type KeyBackupRestoreRunResult = 'completed' | 'background';

export const runKeyBackupRestore = async ({
  crypto,
  setRestoreProgress,
  setBackupRestoreProgress,
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
    if (!backgrounded && isLatestRestoreJob(jobId)) {
      setRestoreProgress(progress);
    }
  };

  updateRestoreState({ status: BackupProgressStatus.Fetching });

  const restoreTask = (async () => {
    await crypto.checkKeyBackupAndEnable();

    const backupInfo = await crypto.getKeyBackupInfo();
    if (!hasUsableBackup(backupInfo)) {
      throw new Error('???????????????');
    }

    await crypto.restoreKeyBackup({
      progressCallback(progress) {
        updateRestoreProgress(progress);
      },
    });
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
        updateRestoreState({ status: BackupProgressStatus.Done });
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
