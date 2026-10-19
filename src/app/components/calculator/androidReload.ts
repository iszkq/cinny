import type { CalculatorConfig } from './lock';
const KEY = 'calculator-android-reload-unlock-v1';
type ReloadUnlock = { idleAt: number; awayAt?: number; configToken: string };
const token = (config: CalculatorConfig) =>
  `${config.mode}:${config.pin?.salt ?? ''}:${config.backgroundSeconds}:${config.idleMinutes}`;
export function clearAndroidReloadUnlock(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* A missing marker stays locked. */ }
}
export function saveAndroidReloadUnlock(config: CalculatorConfig, idleAt: number, awayAt?: number): void {
  try { sessionStorage.setItem(KEY, JSON.stringify({idleAt,awayAt,configToken:token(config)})); }
  catch { clearAndroidReloadUnlock(); }
}
export function readAndroidReloadUnlock(config: CalculatorConfig, android: boolean, navigationType: string, now = Date.now()): ReloadUnlock | undefined {
  let stored: string | null;
  try { stored=sessionStorage.getItem(KEY); } catch { return undefined; }
  // Consume on every document start; cold navigation can never inherit it.
  clearAndroidReloadUnlock();
  if (!android || navigationType !== 'reload' || !stored) return undefined;
  try {
    const state = JSON.parse(stored) as ReloadUnlock;
    if (state.configToken !== token(config) || !Number.isFinite(state.idleAt) || state.idleAt > now) return undefined;
    if (config.idleMinutes > 0 && now-state.idleAt >= config.idleMinutes*60000) return undefined;
    if (state.awayAt !== undefined && (!Number.isFinite(state.awayAt) || state.awayAt > now || now-state.awayAt >= config.backgroundSeconds*1000)) return undefined;
    return state;
  } catch { return undefined; }
}
