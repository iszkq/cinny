import { MatrixClient } from 'matrix-js-sdk';
import { ImportRoomKeyProgressData } from 'matrix-js-sdk/lib/crypto-api';
import { crossSignCurrentDevice } from './matrix-crypto';
import { decryptAllTimelineEvent } from './room';

type RestoreKeyBackupOptions = {
  progressCallback?: (progress: ImportRoomKeyProgressData) => void;
  loadFromSecretStorage?: boolean;
};

export const restoreKeyBackupAndDecrypt = async (
  mx: MatrixClient,
  options: RestoreKeyBackupOptions = {}
): Promise<void> => {
  const crypto = mx.getCrypto();
  if (!crypto) {
    throw new Error('Unexpected Error! Crypto module not found.');
  }

  await crossSignCurrentDevice(mx).catch(() => undefined);

  if (options.loadFromSecretStorage !== false) {
    await crypto.loadSessionBackupPrivateKeyFromSecretStorage().catch(() => undefined);
  }

  await crypto.restoreKeyBackup({
    progressCallback: options.progressCallback,
  });

  await Promise.allSettled(
    mx.getRooms().map((room) => decryptAllTimelineEvent(mx, room.getLiveTimeline()))
  );
};
