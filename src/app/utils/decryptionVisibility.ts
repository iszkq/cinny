import { MatrixClient, MatrixEvent } from 'matrix-js-sdk';

const HISTORICAL_MESSAGE_USER_NOT_JOINED = 'HISTORICAL_MESSAGE_USER_NOT_JOINED';

/**
 * Pre-join ciphertext cannot be recovered because the account was not a room
 * member when it was sent. Hide only this known, unrecoverable case in rooms
 * that are actually encrypted; all other decryption failures stay visible.
 */
export const shouldHideHistoricalDecryptionFailure = (
  mx: MatrixClient,
  mEvent: MatrixEvent
): boolean => {
  if (!mEvent.isEncrypted() || !mEvent.isDecryptionFailure()) return false;
  if (mEvent.decryptionFailureReason !== HISTORICAL_MESSAGE_USER_NOT_JOINED) return false;

  const roomId = mEvent.getRoomId();
  return Boolean(roomId && mx.getRoom(roomId)?.hasEncryptionStateEvent());
};
