import { MatrixEvent } from 'matrix-js-sdk';

const HISTORICAL_MESSAGE_USER_NOT_JOINED = 'HISTORICAL_MESSAGE_USER_NOT_JOINED';

/**
 * Pre-join ciphertext cannot be recovered because the account was not a room
 * member when it was sent. The SDK only assigns this failure code to encrypted
 * events, so the event-level check is enough and does not depend on the room's
 * currently loaded state timeline.
 */
export const shouldHideHistoricalDecryptionFailure = (mEvent: MatrixEvent): boolean => {
  if (!mEvent.isEncrypted() || !mEvent.isDecryptionFailure()) return false;
  if (mEvent.decryptionFailureReason !== HISTORICAL_MESSAGE_USER_NOT_JOINED) return false;
  return true;
};
