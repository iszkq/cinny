import { useSetAtom } from 'jotai';
import { useCallback, useRef } from 'react';
import { backupRestoreProgressAtom } from '../state/backupRestore';
import { useMatrixClient } from './useMatrixClient';
import { useKeyBackupDecryptionKeyCached } from './useKeyBackup';
import { retryDecryptLoadedTimelines } from '../utils/keyBackup';

export const useRestoreBackupOnVerification = () => {
  const setRestoreProgress = useSetAtom(backupRestoreProgressAtom);

  const mx = useMatrixClient();
  const restorePromiseRef = useRef<Promise<void>>();

  useKeyBackupDecryptionKeyCached(
    useCallback(() => {
      if (restorePromiseRef.current) {
        return;
      }

      const crypto = mx.getCrypto();
      if (!crypto) {
        return;
      }

      restorePromiseRef.current = crypto
        .restoreKeyBackup({
          progressCallback(progress) {
            setRestoreProgress(progress);
          },
        })
        .then(() => {
          void retryDecryptLoadedTimelines(mx);
        })
        .catch(() => undefined)
        .finally(() => {
          restorePromiseRef.current = undefined;
        });
    }, [mx, setRestoreProgress])
  );
};
