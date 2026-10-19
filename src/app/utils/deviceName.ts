export function deviceNameForPlatform({
  android = false,
  ios = false,
  desktop = false,
  userAgent = '',
  touchPoints = 0,
}: {
  android?: boolean;
  ios?: boolean;
  desktop?: boolean;
  userAgent?: string;
  touchPoints?: number;
}): string {
  if (android) return '星火 Android';
  if (ios)
    return /iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)
      ? '星火 iPad'
      : '星火 iPhone';
  if (desktop) {
    if (/Windows/i.test(userAgent)) return '星火 Windows';
    if (/Macintosh|Mac OS/i.test(userAgent)) return '星火 Mac';
    if (/Linux/i.test(userAgent)) return '星火 Linux';
    return '星火 Desktop';
  }
  return '星火 Web';
}
export const shouldUpgradeDeviceName = (name?: string) =>
  !name || ['星火 Web', '星火Web', 'Starfire Web', 'Cinny Web'].includes(name);
