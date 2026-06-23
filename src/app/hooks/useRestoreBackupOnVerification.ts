import { useSetAtom } from 'jotai';
import { useCallback, useRef } from 'react';
import {
  BackupProgressStatus,
  backupRestoreProgressAtom,
  setBackupRestoreProgressAtom,
} from '../state/backupRestore';
import { useMatrixClient } from './useMatrixClient';
import { useKeyBackupDecryptionKeyCached } from './useKeyBackup';
import { getBackupRestoreErrorMessage, runKeyBackupRestore } from '../utils/restoreKeyBackup';

export const useRestoreBackupOnVerification = () => {
  const setRestoreProgress = useSetAtom(backupRestoreProgressAtom);
  const setBackupRestoreProgress = useSetAtom(setBackupRestoreProgressAtom);
  const restoreInFlightRef = useRef(false);

  const mx = useMatrixClient();

  useKeyBackupDecryptionKeyCached(
    useCallback(() => {
      if (restoreInFlightRef.current) return;

      const crypto = mx.getCrypto();
      if (!crypto) return;

      restoreInFlightRef.current = true;

      runKeyBackupRestore({
        crypto,
        setRestoreProgress,
        setBackupRestoreProgress,
      })
        .catch((error) => {
          setBackupRestoreProgress({
            status: BackupProgressStatus.Error,
            message: getBackupRestoreErrorMessage(error),
          });
        })
        .finally(() => {
          restoreInFlightRef.current = false;
        });
    }, [mx, setBackupRestoreProgress, setRestoreProgress])
  );
};
