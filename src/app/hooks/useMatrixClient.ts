import { createContext, useContext } from 'react';
import type { MatrixClient } from 'matrix-js-sdk/lib/client';

const MatrixClientContext = createContext<MatrixClient | null>(null);

export const MatrixClientProvider = MatrixClientContext.Provider;

export function useMatrixClient(): MatrixClient {
  const mx = useContext(MatrixClientContext);
  if (!mx) throw new Error('MatrixClient not initialized!');
  return mx;
}
