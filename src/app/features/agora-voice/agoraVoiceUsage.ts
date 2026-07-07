export const DEFAULT_AGORA_VOICE_MONTHLY_FREE_MINUTES = 10000;

type AgoraVoiceUsage = {
  seconds: number;
};

const getUsageMonth = (date = new Date()): string => {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
};

const getUsageKey = (userId: string, date = new Date()): string =>
  `cinny:agora-voice-usage:${userId}:${getUsageMonth(date)}`;

const readUsage = (userId: string): AgoraVoiceUsage => {
  try {
    const rawUsage = window.localStorage.getItem(getUsageKey(userId));
    if (!rawUsage) return { seconds: 0 };

    const parsed = JSON.parse(rawUsage) as Partial<AgoraVoiceUsage>;
    return {
      seconds: typeof parsed.seconds === 'number' && parsed.seconds > 0 ? parsed.seconds : 0,
    };
  } catch {
    return { seconds: 0 };
  }
};

const writeUsage = (userId: string, usage: AgoraVoiceUsage) => {
  try {
    window.localStorage.setItem(getUsageKey(userId), JSON.stringify(usage));
  } catch {
    // Local quota is a lightweight estimate; calling should not fail if storage is unavailable.
  }
};

export const getAgoraVoiceMonthlyLimitSeconds = (monthlyFreeMinutes?: number): number =>
  Math.max(0, Math.floor(monthlyFreeMinutes ?? DEFAULT_AGORA_VOICE_MONTHLY_FREE_MINUTES) * 60);

export const getAgoraVoiceRemainingSeconds = (
  userId: string,
  monthlyFreeMinutes?: number
): number => {
  const limitSeconds = getAgoraVoiceMonthlyLimitSeconds(monthlyFreeMinutes);
  const usage = readUsage(userId);

  return Math.max(0, limitSeconds - usage.seconds);
};

export const addAgoraVoiceUsage = (
  userId: string,
  seconds: number,
  monthlyFreeMinutes?: number
): number => {
  const usage = readUsage(userId);
  const nextUsage = {
    seconds: usage.seconds + Math.max(0, Math.ceil(seconds)),
  };
  writeUsage(userId, nextUsage);

  return getAgoraVoiceRemainingSeconds(userId, monthlyFreeMinutes);
};
