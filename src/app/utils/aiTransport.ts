import { isDesktopUpdaterSupported } from './desktopUpdater';

export const validateAIEndpoint = (endpoint: string): string => {
  const url = new URL(endpoint.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('AI 接口必须使用 HTTP 或 HTTPS，不能在地址中包含密码。');
  }
  return url.toString();
};

export async function requestAI(
  endpoint: string,
  apiKey = '',
  body?: string,
  signal?: AbortSignal
): Promise<Response> {
  const url = validateAIEndpoint(endpoint);
  if (signal?.aborted) throw new Error('AI 请求已取消');
  if (isDesktopUpdaterSupported()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{ status: number; body: string }>('request_ai_http', {
      request: { endpoint: url, apiKey, body },
    });
    if (signal?.aborted) throw new Error('AI 请求已取消');
    return new Response(result.body, { status: result.status });
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 120_000);
  try {
    return await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}),
      },
      body,
      signal: controller.signal,
      redirect: 'error',
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
