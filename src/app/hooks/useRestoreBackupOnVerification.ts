import { useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { getBackupRestoreAtoms } from '../state/backupRestore';
import { useMatrixClient } from './useMatrixClient';
import { useKeyBackupDecryptionKeyCached } from './useKeyBackup';

export const useRestoreBackupOnVerification = () => {
  const mx = useMatrixClient();
  const { backupRestoreProgressAtom } = getBackupRestoreAtoms(mx);
  const setRestoreProgress = useSetAtom(backupRestoreProgressAtom);

  useKeyBackupDecryptionKeyCached(
    useCallback(() => {
      const crypto = mx.getCrypto();
      if (!crypto) return;

      crypto.restoreKeyBackup({
        progressCallback(progress) {
          setRestoreProgress(progress);
        },
      });
    }, [mx, setRestoreProgress])
  );
};
