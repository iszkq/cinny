import type { Logger } from 'matrix-js-sdk/lib/logger';
import { recordAndroidDiagnostic } from './androidDiagnostics';

// Capture only fixed phase labels, never raw SDK arguments (keys or tokens).
export function createStartupLogger(original: Logger): Logger {
  let lastPhase = '';
  const capture = (messages: unknown[]) => {
    const message = typeof messages[0] === 'string' ? messages[0] : '';
    const phases: [string, string][] = [
      ['Initialising Rust crypto-sdk WASM artifact', 'wasm_loading'],
      ['Opening Rust CryptoStore', 'database_opening'],
      ['Init OlmMachine', 'olm_initializing'],
      ['Performing initial key query after migration', 'legacy_key_query'],
      ['Failed to check for cross-signing keys after migration', 'legacy_key_query_retry'],
      ['Failed to get backup version during migration', 'legacy_backup_retry'],
      ['Completed rust crypto-sdk setup', 'crypto_ready'],
    ];
    const phase = phases.find(([text]) => message.startsWith(text))?.[1];
    if (phase && phase !== lastPhase) {
      lastPhase = phase;
      recordAndroidDiagnostic('crypto_init_phase', { phase });
    }
  };
  const wrap = (base: Logger): Logger => ({
    trace: (...args) => base.trace(...args),
    debug: (...args) => {
      capture(args);
      base.debug(...args);
    },
    info: (...args) => {
      capture(args);
      base.info(...args);
    },
    warn: (...args) => {
      capture(args);
      base.warn(...args);
    },
    error: (...args) => {
      capture(args);
      base.error(...args);
    },
    getChild: (namespace) => wrap(base.getChild(namespace)),
  });
  return wrap(original);
}
