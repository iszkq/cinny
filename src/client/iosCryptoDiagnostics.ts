import * as wasm from '@matrix-org/matrix-sdk-crypto-wasm';
import { recordAndroidDiagnostic } from './androidDiagnostics';

const instrumented = new WeakMap<object, Set<string>>();

// Observe the original calls without changing ownership, freeing objects,
// swallowing exceptions, retrying writes or resetting any persistent store.
export function installIOSCryptoCallDiagnostics(
  bindings: Record<string, unknown> = wasm,
  report = recordAndroidDiagnostic
) {
  const operations: Record<string, string[]> = {
    OlmMachine: ['getDevice', 'getIdentity', 'queryKeysForUsers', 'markRequestAsSent'],
    Device: ['requestVerification', 'free'],
    OwnUserIdentity: ['requestVerification', 'verify', 'free'],
    VerificationRequest: ['acceptWithMethods', 'startSas', 'generateQrCode', 'scanQrCode'],
  };
  const seen = new Set<string>();
  for (const [className, methods] of Object.entries(operations)) {
    const constructor = bindings[className] as { prototype?: object } | undefined;
    const prototype = constructor?.prototype;
    if (!prototype) continue;
    let installed = instrumented.get(prototype);
    if (!installed) {
      installed = new Set();
      instrumented.set(prototype, installed);
    }
    for (const method of methods) {
      if (installed.has(method)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
      if (!descriptor || typeof descriptor.value !== 'function') continue;
      const original = descriptor.value;
      const fail = (error: unknown) => {
        const message = error instanceof Error ? error.message : '';
        const kind = /ownership|borrowed/i.test(message)
          ? 'ownership'
          : /out of bounds.*(?:table|memory)|out of bounds table access/i.test(message)
          ? 'wasm_bounds'
          : /unreachable|null pointer|moved value/i.test(message)
          ? 'wasm_trap'
          : 'other';
        const operation = `${className}.${method}`;
        if (!seen.has(`${operation}:${kind}`)) {
          seen.add(`${operation}:${kind}`);
          report('ios_crypto_call_failed', { operation, kind });
        }
        throw error;
      };
      installed.add(method);
      Object.defineProperty(prototype, method, {
        ...descriptor,
        value: function observedIOSCryptoCall(this: unknown, ...args: unknown[]) {
          try {
            const result = Reflect.apply(original, this, args);
            return result instanceof Promise ? result.catch(fail) : result;
          } catch (error) {
            return fail(error);
          }
        },
      });
    }
  }
}
