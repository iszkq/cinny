export const APP_TEXT_SIZES = [90, 100, 115, 130, 145] as const;
export const normalizeAppTextSize = (value: unknown): number =>
  typeof value === 'number' && (APP_TEXT_SIZES as readonly number[]).includes(value) ? value : 100;
