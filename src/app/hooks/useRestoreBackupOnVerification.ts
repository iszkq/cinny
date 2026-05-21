import { useSetAtom } from 'jotai';
import { useCallback } from 'react';
import {
  BackupProgressStatus,
  backupRestoreProgressAtom,
  setBackupRestoreProgressAtom,
} from '../state/backupRestore';
import { useMatrixClient } from './useMatrixClient';
import { useKeyBackupDecryptionKeyCached } from './useKeyBackup';

export const useRestoreBackupOnVerification = () => {
  const setRestoreProgress = useSetAtom(backupRestoreProgressAtom);
  const setBackupRestoreProgress = useSetAtom(setBackupRestoreProgressAtom);

  const mx = useMatrixClient();

  useKeyBackupDecryptionKeyCached(
    useCallback(() => {
      const crypto = mx.getCrypto();
      if (!crypto) return;

      crypto
        .restoreKeyBackup({
          progressCallback(progress) {
            setRestoreProgress(progress);
          },
        })
        .then(() => {
          setBackupRestoreProgress({ status: BackupProgressStatus.Done });
        })
        .catch(() => {
          setBackupRestoreProgress({ status: BackupProgressStatus.Idle });
        });
    }, [mx, setBackupRestoreProgress, setRestoreProgress])
  );
};
