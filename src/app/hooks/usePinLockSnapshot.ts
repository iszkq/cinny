import { useEffect, useState } from 'react';
import { getPinLockSnapshot, subscribePinLockChange } from '../utils/pinLock';

export const usePinLockSnapshot = () => {
  const [snapshot, setSnapshot] = useState(() => getPinLockSnapshot());

  useEffect(() => subscribePinLockChange(() => setSnapshot(getPinLockSnapshot())), []);

  return snapshot;
};
