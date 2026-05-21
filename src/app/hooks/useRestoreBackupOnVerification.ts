import { useSetAtom } from 'jotai';
import { useCallback, useRef } from 'react';
import {
  BackupProgressStatus,
  backupRestoreProgressAtom,
  setBackupRestoreProgressAtom,
} from '../state/backupRestore';
import { useMatrixClient } from './useMatrixClient';
import { useKeyBackupDecryptionKeyCached } from './useKeyBackup';

export const useRestoreBackupOnVerification = () => {
  const setRestoreProgress = useSetAtom(backupRestoreProgressAtom);
  const setRestoreProgressState = useSetAtom(setBackupRestoreProgressAtom);

  const mx = useMatrixClient();
  const restorePromiseRef = useRef<Promise<void>>();

  useKeyBackupDecryptionKeyCached(
    useCallback(() => {
      if (restorePromiseRef.current) {
        return;
      }

      const crypto = mx.getCrypto();
      if (!crypto) {
        setRestoreProgressState({
          status: BackupProgressStatus.Idle,
        });
        return;
      }

      restorePromiseRef.current = crypto
        .restoreKeyBackup({
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
    }, [mx, setRestoreProgress, setRestoreProgressState])
  );
};
