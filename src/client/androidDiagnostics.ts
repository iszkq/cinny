import { Capacitor } from '@capacitor/core';

const STORAGE_KEY = 'cinny_android_diagnostics_v1';
const MAX_ENTRIES = 160;
const isAndroidBuild = import.meta.env.VITE_ANDROID_APP === 'true';

const isAndroid = () =>
  isAndroidBuild || (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android');

type DiagnosticEntry = {
  at: string;
  event: string;
  details?: Record<string, boolean | number | string | null>;
};

const readEntries = (): DiagnosticEntry[] => {
  if (!isAndroid() || typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) : [];
  } catch {
    return [];
  }
};

export const recordAndroidDiagnostic = (
  event: string,
  details?: Record<string, boolean | number | string | null>
) => {
  if (!isAndroid()) return;
  const entry: DiagnosticEntry = { at: new Date().toISOString(), event, details };
  try {
    const entries = [...readEntries(), entry].slice(-MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Diagnostics must never affect login or crypto startup.
  }
};

export const getAndroidDiagnosticsReport = (): string => {
  const entries = readEntries();
  const safeLocalStorage = typeof localStorage !== 'undefined';
  return [
    'Starfire Android 状态诊断（不含密码、token、私钥或恢复密钥）',
    `生成时间: ${new Date().toISOString()}`,
    `Android build: ${isAndroidBuild}`,
    `Capacitor native: ${Capacitor.isNativePlatform()}`,
    `Capacitor platform: ${Capacitor.getPlatform()}`,
    `localStorage available: ${safeLocalStorage}`,
    `记录数量: ${entries.length}`,
    ...entries.map((entry) => {
      const details = entry.details
        ? ` ${Object.entries(entry.details)
            .map(([key, value]) => `${key}=${String(value)}`)
            .join(' ')}`
        : '';
      return `${entry.at} ${entry.event}${details}`;
    }),
  ].join('\n');
};

