import type { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';

export type CryptoInitializationLease = {
  waitForTurn: Promise<void>;
  release: () => void;
};

// Serialize destructive crypto initialization across otherwise independent UI
// modules without retaining a logged-out Matrix client.
const cryptoInitializationTails = new WeakMap<CryptoApi, Promise<void>>();

export const queueCryptoInitialization = (crypto: CryptoApi): CryptoInitializationLease => {
  const previousTurn = cryptoInitializationTails.get(crypto) ?? Promise.resolve();
  let releaseTurn: () => void = () => undefined;
  const currentTurn = new Promise<void>((resolve) => {
    releaseTurn = resolve;
  });
  cryptoInitializationTails.set(crypto, currentTurn);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseTurn();
    if (cryptoInitializationTails.get(crypto) === currentTurn) {
      cryptoInitializationTails.delete(crypto);
    }
  };

  return { waitForTurn: previousTurn, release };
};

export const runCryptoInitializationExclusive = async <T>(
  crypto: CryptoApi,
  taskFactory: () => Promise<T>
): Promise<T> => {
  const lease = queueCryptoInitialization(crypto);
  await lease.waitForTurn;
  try {
    return await taskFactory();
  } finally {
    lease.release();
  }
};
