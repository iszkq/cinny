export const PIN_IDLE_MINUTES = [1, 5, 10] as const;
export type PinIdleMinutes = typeof PIN_IDLE_MINUTES[number];
export const normalizePinIdleMinutes = (value: unknown): PinIdleMinutes =>
  PIN_IDLE_MINUTES.includes(value as PinIdleMinutes) ? (value as PinIdleMinutes) : 5;

// Check the deadline before accepting activity, including the first event after sleep.
export const createIdleLock = (minutes: number, lock: () => void, now = Date.now) => {
  let lastActivity = now();
  let locked = false;
  const check = () => {
    if (!locked && now() - lastActivity >= minutes * 60_000) {
      locked = true;
      lock();
    }
    return locked;
  };
  return {
    check,
    activity: () => {
      if (!check()) lastActivity = now();
    },
  };
};
