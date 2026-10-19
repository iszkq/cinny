export const CALCULATOR_CONFIG_KEY = 'calculator-privacy-v1';
export const CALCULATOR_CONFIG_EVENT = 'calculator-config-changed';
export const CALCULATOR_LOCK_EVENT = 'calculator-lock-now';
export type CalculatorConfig = {
  mode: 'time' | 'pin';
  owner?: { baseUrl: string; userId: string };
  pin?: { salt: string; hash: string; length?: number };
  backgroundSeconds: number;
  idleMinutes: number;
};
export const DEFAULT_CALCULATOR_CONFIG: CalculatorConfig = {
  mode: 'time', backgroundSeconds: 30, idleMinutes: 5,
};
export const BACKGROUND_DELAYS = [0, 30, 60, 300];
export const IDLE_DELAYS = [0, 1, 5, 15];
export function readCalculatorConfig(): CalculatorConfig {
  const stored = localStorage.getItem(CALCULATOR_CONFIG_KEY);
  if (!stored) return { ...DEFAULT_CALCULATOR_CONFIG };
  const config = JSON.parse(stored) as CalculatorConfig;
  if (!['time', 'pin'].includes(config.mode) ||
      !BACKGROUND_DELAYS.includes(config.backgroundSeconds) ||
      !IDLE_DELAYS.includes(config.idleMinutes) ||
      (config.mode === 'pin' && (!config.pin || !/^[0-9a-f]{32}$/.test(config.pin.salt) || !/^[0-9a-f]{64}$/.test(config.pin.hash)))) {
    // Invalid saved settings must never silently downgrade PIN protection to time.
    throw new Error('Invalid calculator privacy settings');
  }
  return config;
}
export function saveCalculatorConfig(config: CalculatorConfig) {
  localStorage.setItem(CALCULATOR_CONFIG_KEY, JSON.stringify(config));
  window.dispatchEvent(new Event(CALCULATOR_CONFIG_EVENT));
}
const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
async function pinHash(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bytes = Uint8Array.from(salt.match(/../g) ?? [], (v) => parseInt(v, 16));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bytes, iterations: 210000, hash: 'SHA-256' }, key, 256);
  return hex(new Uint8Array(bits));
}
export async function createCalculatorPin(pin: string): Promise<NonNullable<CalculatorConfig['pin']>> {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN 需要为 4～8 位数字。');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await pinHash(pin, salt), length: pin.length };
}
export const timeCode = (date: Date): string =>
  `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
export async function verifyCalculatorCode(code: string, config: CalculatorConfig, now = Date.now()): Promise<boolean> {
  if (config.mode === 'time') return code === timeCode(new Date(now)) || code === timeCode(new Date(now - 60000));
  if (!/^\d{4,8}$/.test(code) || !config.pin) return false;
  const actual = await pinHash(code, config.pin.salt);
  let difference = actual.length ^ config.pin.hash.length;
  for (let i = 0; i < actual.length; i += 1) difference |= actual.charCodeAt(i) ^ config.pin.hash.charCodeAt(i);
  return difference === 0;
}
export const hasLockExpired = (elapsedMs: number, seconds: number): boolean =>
  elapsedMs < 0 || elapsedMs >= seconds * 1000;
