import { useSetAtom } from 'jotai';
import { useCallback, useEffect, useRef } from 'react';
import { backupRestoreProgressAtom } from '../state/backupRestore';
import { useMatrixClient } from './useMatrixClient';
import { useKeyBackupDecryptionKeyCached } from './useKeyBackup';
import { restoreKeyBackupAndDecrypt } from '../utils/keyBackup';

export const useRestoreBackupOnVerification = () => {
  const setRestoreProgress = useSetAtom(backupRestoreProgressAtom);

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
      .catch(() => undefined)
      .finally(() => {
        restorePromiseRef.current = undefined;
      });

    return restorePromiseRef.current;
  }, [mx, setRestoreProgress]);

  useEffect(() => {
    void attemptRestore();
  }, [attemptRestore]);

  useKeyBackupDecryptionKeyCached(
    useCallback(() => {
      void attemptRestore();
    }, [attemptRestore])
  );
};
