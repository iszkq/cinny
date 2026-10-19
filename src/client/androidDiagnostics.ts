import { isNativeApp } from '../app/utils/nativePlatform';
import { Capacitor } from '@capacitor/core';

const STORAGE_KEY = 'cinny_android_diagnostics_v1';
const MAX_ENTRIES = 160;
const isAndroidBuild = import.meta.env.VITE_ANDROID_APP === 'true';

type DiagnosticEntry = {
  at: string;
  event: string;
  details?: Record<string, boolean | number | string | null>;
};

const readEntries = (): DiagnosticEntry[] => {
  if (!isNativeApp() || typeof localStorage === 'undefined') return [];
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
  if (!isNativeApp()) return;
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
    '计算器移动端状态诊断（不含密码、token、私钥或恢复密钥）',
    `生成时间: ${new Date().toISOString()}`,
    `Client build: ${import.meta.env.VITE_IOS_APP === 'true' ? 26 : 21}`,
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

const lockReasons: Record<string, string> = {
  'background-immediate': '设置为离开应用立即锁定',
  'background-timeout': '离开应用超过设定时长',
  'idle-on-resume': '恢复页面时已超过无操作时长',
  'idle-input': '再次操作时已超过无操作时长',
  'idle-timeout': '前台无操作超时',
  'invalid-config': '本机隐私设置读取或校验失败',
  manual: '手动立即锁定',
  'settings-changed': '保存隐私设置后锁定',
  'root-back': '从登录页或无可返回页面执行返回',
};
export const getAndroidLockDiagnostics = (): string =>
  readEntries()
    .filter((entry) => entry.event.startsWith('calculator_'))
    .slice(-15)
    .map((entry) => {
      const detail = entry.details;
      let label = entry.event;
      if (entry.event === 'calculator_locked')
        label = lockReasons[String(detail?.reason)] ?? String(detail?.reason);
      if (entry.event === 'calculator_document_start')
        label = detail?.restored
          ? '打开页面，继续本次使用'
          : '打开页面，保持手动锁定或离开超时后的锁定';
      if (entry.event === 'calculator_background') label = '离开应用，开始锁定计时';
      if (entry.event === 'calculator_config_read_failed')
        label = '隐私设置暂时读取失败，未主动触发锁定';
      if (entry.event === 'calculator_resource_reload_prevented')
        label = '已阻止网络或资源异常导致的自动刷新';
      if (entry.event === 'calculator_session_reload') label = '服务器登录会话失效，重新加载页面';
      return `${new Date(entry.at).toLocaleString()} ${label}`;
    })
    .join('\n') || '暂无锁定记录';
