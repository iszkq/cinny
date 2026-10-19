import { useEffect } from 'react';
import { createIdleLock } from '../utils/idleLock';
import { getPinIdleMinutes, lockScreenForAccount } from '../utils/pinLock';

export function usePinIdleLock(
  baseUrl: string | undefined,
  userId: string | null,
  active: boolean,
  minutes: number
) {
  useEffect(() => {
    if (!baseUrl || !userId || !active) return undefined;
    const timer = createIdleLock(getPinIdleMinutes(baseUrl, userId), () =>
      lockScreenForAccount(baseUrl, userId)
    );
    const activity = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) timer.activity();
    };
    const check = () => {
      timer.check();
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'];
    events.forEach((name) =>
      window.addEventListener(name, activity, { passive: true, capture: true })
    );
    window.addEventListener('focus', check, true);
    document.addEventListener('visibilitychange', check);
    const interval = window.setInterval(check, 1000);
    return () => {
      events.forEach((name) => window.removeEventListener(name, activity, true));
      window.removeEventListener('focus', check, true);
      document.removeEventListener('visibilitychange', check);
      window.clearInterval(interval);
    };
  }, [baseUrl, userId, active, minutes]);
}
