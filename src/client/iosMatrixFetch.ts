import { Capacitor, CapacitorHttp, type HttpOptions, type HttpResponse } from '@capacitor/core';
import { recordAndroidDiagnostic } from './androidDiagnostics';

// Only idempotent Matrix client reads use NSURLSession. SDK authentication,
// refresh and Matrix errors remain in the SDK; writes are never replayed here.
export function createIOSMatrixFetch(
  nativeGet: (options: HttpOptions) => Promise<HttpResponse> = (options) =>
    CapacitorHttp.get(options),
  browserFetch: typeof fetch = globalThis.fetch.bind(globalThis),
  native = Capacitor.isNativePlatform()
): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    if (!native || method !== 'GET' || !url.pathname.includes('/_matrix/client/')) {
      return browserFetch(input, init);
    }
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).forEach(
      (value, key) => {
        headers[key] = value;
      }
    );
    const sync = url.pathname.endsWith('/sync');
    const started = Date.now();
    try {
      const response = await new Promise<HttpResponse>((resolve, reject) => {
        const aborted = () => reject(new DOMException('Request aborted', 'AbortError'));
        signal?.addEventListener('abort', aborted, { once: true });
        // Abort releases the SDK wait. Capacitor cannot cancel the underlying
        // native task; this path is GET-only and the native deadline bounds it.
        Promise.resolve()
          .then(() =>
            nativeGet({
              url: url.href,
              headers,
              responseType: 'text',
              connectTimeout: 15000,
              readTimeout: sync ? 100000 : 45000,
            })
          )
          .then(resolve, reject)
          .finally(() => signal?.removeEventListener('abort', aborted));
      });
      if (sync || url.pathname.endsWith('/devices'))
        recordAndroidDiagnostic('ios_native_read_complete', {
          endpoint: sync ? 'sync' : 'devices',
          status: response.status,
          elapsedMs: Date.now() - started,
        });
      const body = [204, 205, 304].includes(response.status)
        ? null
        : typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data ?? {});
      return new Response(body, { status: response.status, headers: response.headers });
    } catch (error) {
      recordAndroidDiagnostic('ios_native_read_failed', {
        endpoint: sync ? 'sync' : 'client',
        name: error instanceof Error ? error.name : 'unknown',
        elapsedMs: Date.now() - started,
      });
      throw error;
    }
  };
}
