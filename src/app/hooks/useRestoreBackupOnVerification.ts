import { useSetAtom } from 'jotai';
import { useCallback, useEffect, useRef } from 'react';
import {
  BackupProgressStatus,
  backupRestoreProgressAtom,
  setBackupRestoreProgressAtom,
} from '../state/backupRestore';
import { useMatrixClient } from './useMatrixClient';
import { useKeyBackupDecryptionKeyCached } from './useKeyBackup';
import { restoreKeyBackupAndDecrypt } from '../utils/keyBackup';

export const useRestoreBackupOnVerification = () => {
  const setRestoreProgress = useSetAtom(backupRestoreProgressAtom);
  const setRestoreProgressState = useSetAtom(setBackupRestoreProgressAtom);

  const mx = useMatrixClient();
  const restorePromiseRef = useRef<Promise<void>>();

  const attemptRestore = useCallback(() => {
    if (restorePromiseRef.current) {
      return restorePromiseRef.current;
    }

    restorePromiseRef.current = restoreKeyBackupAndDecrypt(mx, {
      progressCallback(progress) {
        setRestoreProgress(progress);
      },
    })
      .then(() => {
        setRestoreProgressState({
          status: BackupProgressStatus.Done,
        });
      })
      .catch(() => {
        setRestoreProgressState({
          status: BackupProgressStatus.Idle,
        });
      })
      .finally(() => {
        restorePromiseRef.current = undefined;
      });

    return restorePromiseRef.current;
  }, [mx, setRestoreProgress, setRestoreProgressState]);

  useEffect(() => {
    void attemptRestore();
  }, [attemptRestore]);

  useKeyBackupDecryptionKeyCached(
    useCallback(() => {
      void attemptRestore();
    }, [attemptRestore])
  );
};
