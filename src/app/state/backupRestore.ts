import { atom, type WritableAtom } from 'jotai';
import type { MatrixClient } from 'matrix-js-sdk';
import { ImportRoomKeyProgressData, ImportRoomKeyStage } from 'matrix-js-sdk/lib/crypto-api';

export enum BackupProgressStatus {
  Idle,
  Fetching,
  Loading,
  Decrypting,
  Background,
  Error,
  Done,
}
export type ProgressData = {
  downloaded: number;
  successes: number;
  failures: number;
  total: number;
};
export type IBackupProgress =
  | {
      status: BackupProgressStatus.Idle;
    }
  | {
      status: BackupProgressStatus.Fetching;
    }
  | {
      status: BackupProgressStatus.Loading;
      data: ProgressData;
    }
  | {
      status: BackupProgressStatus.Decrypting;
    }
  | {
      status: BackupProgressStatus.Background;
      message: string;
    }
  | {
      status: BackupProgressStatus.Error;
      message: string;
    }
  | {
      status: BackupProgressStatus.Done;
      message?: string;
    };

type BackupRestoreProgressAtom = WritableAtom<
  IBackupProgress,
  [ImportRoomKeyProgressData],
  undefined
>;

type SetBackupRestoreProgressAtom = WritableAtom<null, [IBackupProgress], undefined>;

type BackupRestoreAtoms = {
  backupRestoreProgressAtom: BackupRestoreProgressAtom;
  setBackupRestoreProgressAtom: SetBackupRestoreProgressAtom;
};

const clientBackupRestoreAtoms = new WeakMap<MatrixClient, BackupRestoreAtoms>();

export const getBackupRestoreAtoms = (mx: MatrixClient): BackupRestoreAtoms => {
  const cachedAtoms = clientBackupRestoreAtoms.get(mx);
  if (cachedAtoms) return cachedAtoms;

  const baseBackupRestoreProgressAtom = atom<IBackupProgress>({
    status: BackupProgressStatus.Idle,
  });

  const setBackupRestoreProgressAtom = atom(null, (_get, set, progress: IBackupProgress) => {
    set(baseBackupRestoreProgressAtom, progress);
    return undefined;
  });

  const backupRestoreProgressAtom = atom<IBackupProgress, [ImportRoomKeyProgressData], undefined>(
    (get) => get(baseBackupRestoreProgressAtom),
    (_get, set, progress) => {
      if (progress.stage === ImportRoomKeyStage.Fetch) {
        set(baseBackupRestoreProgressAtom, {
          status: BackupProgressStatus.Fetching,
        });
        return undefined;
      }

      if (progress.stage === ImportRoomKeyStage.LoadKeys) {
        const { total, successes, failures } = progress;

        const downloaded = successes + failures;
        if (total === 0) {
          set(baseBackupRestoreProgressAtom, {
            status: BackupProgressStatus.Fetching,
          });
          return undefined;
        }

        // Reaching 100% means the backup keys were imported. The caller still
        // owns the final completion state because it may need to retry decrypting
        // already-loaded timelines before the user can be told recovery is done.
        set(baseBackupRestoreProgressAtom, {
          status: BackupProgressStatus.Loading,
          data: {
            downloaded,
            successes,
            failures,
            total,
          },
        });
      }
      return undefined;
    }
  );

  const atoms = { backupRestoreProgressAtom, setBackupRestoreProgressAtom };
  clientBackupRestoreAtoms.set(mx, atoms);
  return atoms;
};
