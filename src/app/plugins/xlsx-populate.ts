import xlsxPopulateRuntimeUrl from './xlsx-populate.runtime.min.js?url';

export type XlsxPopulateWorkbook = {
  outputAsync: (options?: { type?: 'arraybuffer' | 'blob' }) => Promise<ArrayBuffer | Blob>;
};

export type XlsxPopulateModule = {
  fromDataAsync: (
    data: ArrayBuffer | Blob | Uint8Array,
    options?: {
      password?: string;
    }
  ) => Promise<XlsxPopulateWorkbook>;
};

type WorkerDecryptRequest = {
  type: 'decrypt';
  data: ArrayBuffer;
  password: string;
};

type WorkerDecryptSuccess = {
  type: 'success';
  data: ArrayBuffer;
};

type WorkerDecryptError = {
  type: 'error';
  message: string;
};

type WorkerDecryptMessage = WorkerDecryptSuccess | WorkerDecryptError;

const XLSX_POPULATE_SCRIPT_ID = 'cinny-xlsx-populate-runtime';
const XLSX_POPULATE_SCRIPT_URLS = [
  xlsxPopulateRuntimeUrl,
  'https://cdn.bootcdn.net/ajax/libs/xlsx-populate/1.21.0/xlsx-populate.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx-populate/1.21.0/xlsx-populate.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx-populate@1.21.0/browser/xlsx-populate.min.js',
  'https://unpkg.com/xlsx-populate/browser/xlsx-populate.min.js',
];
const DEFAULT_DECRYPT_TIMEOUT = 60_000;

let xlsxPopulateRuntimePromise: Promise<XlsxPopulateModule> | undefined;
let workerScriptUrl: string | undefined;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  return 'Spreadsheet decryption failed';
};

const toArrayBuffer = async (value: ArrayBuffer | Blob): Promise<ArrayBuffer> => {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  return value.arrayBuffer();
};

const getGlobalXlsxPopulate = (): XlsxPopulateModule | undefined => {
  const runtime = (globalThis as typeof globalThis & { XlsxPopulate?: XlsxPopulateModule })
    .XlsxPopulate;

  if (runtime && typeof runtime.fromDataAsync === 'function') {
    return runtime;
  }

  return undefined;
};

const removeRuntimeScript = () => {
  if (typeof document === 'undefined') return;

  document.getElementById(XLSX_POPULATE_SCRIPT_ID)?.remove();
};

const loadRuntimeFromScript = (src: string): Promise<XlsxPopulateModule> =>
  new Promise((resolve, reject) => {
    const handleComplete = () => {
      const runtime = getGlobalXlsxPopulate();

      if (!runtime) {
        reject(new Error('Failed to initialize spreadsheet encryption runtime'));
        return;
      }

      resolve(runtime);
    };

    const handleError = () => {
      reject(new Error(`Failed to load spreadsheet encryption runtime from ${src}`));
    };

    const existingScript = document.getElementById(XLSX_POPULATE_SCRIPT_ID) as
      | HTMLScriptElement
      | null;

    if (existingScript && existingScript.src === src) {
      existingScript.addEventListener('load', handleComplete, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
      return;
    }

    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement('script');
    script.id = XLSX_POPULATE_SCRIPT_ID;
    script.async = true;
    script.src = src;
    script.addEventListener('load', handleComplete, { once: true });
    script.addEventListener('error', handleError, { once: true });

    document.head.appendChild(script);
  });

const loadXlsxPopulateRuntime = async (): Promise<XlsxPopulateModule> => {
  const resolved = getGlobalXlsxPopulate();
  if (resolved) return resolved;

  if (typeof document === 'undefined') {
    throw new Error('Spreadsheet encryption preview is only available in the browser');
  }

  if (!xlsxPopulateRuntimePromise) {
    xlsxPopulateRuntimePromise = (async () => {
      let lastError: unknown;

      for (const src of XLSX_POPULATE_SCRIPT_URLS) {
        try {
          return await loadRuntimeFromScript(src);
        } catch (error) {
          lastError = error;
          removeRuntimeScript();
        }
      }

      throw lastError ?? new Error('Failed to load spreadsheet encryption runtime');
    })().catch((error) => {
      xlsxPopulateRuntimePromise = undefined;
      removeRuntimeScript();
      throw error;
    });
  }

  return xlsxPopulateRuntimePromise;
};

const waitForUiPaint = async () => {
  if (typeof window === 'undefined') {
    return;
  }

  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
};

const decryptSpreadsheetInMainThread = async (
  data: ArrayBuffer,
  password: string
): Promise<ArrayBuffer> => {
  await waitForUiPaint();

  const runtime = await loadXlsxPopulateRuntime();
  const workbook = await runtime.fromDataAsync(data.slice(0), {
    password,
  });
  const output = await workbook.outputAsync({ type: 'arraybuffer' });

  return toArrayBuffer(output);
};

const createWorkerSource = (): string => `
const SCRIPT_URLS = ${JSON.stringify(XLSX_POPULATE_SCRIPT_URLS)};

try { self.window = self; } catch (error) {}
try { self.global = self; } catch (error) {}
try { self.globalThis = self; } catch (error) {}

const getErrorMessage = (error) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Spreadsheet decryption failed';
};

const toArrayBuffer = async (value) => {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  if (value && typeof value.arrayBuffer === 'function') {
    return value.arrayBuffer();
  }

  throw new Error('Failed to serialize decrypted spreadsheet');
};

const loadRuntime = async () => {
  const existingRuntime = self.XlsxPopulate;
  if (existingRuntime && typeof existingRuntime.fromDataAsync === 'function') {
    return existingRuntime;
  }

  if (typeof self.importScripts !== 'function') {
    throw new Error('Spreadsheet encryption runtime is not supported in this browser');
  }

  let lastError;
  for (const src of SCRIPT_URLS) {
    try {
      self.importScripts(src);
      const runtime = self.XlsxPopulate;
      if (runtime && typeof runtime.fromDataAsync === 'function') {
        return runtime;
      }
      throw new Error('Failed to initialize spreadsheet encryption runtime');
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Failed to load spreadsheet encryption runtime');
};

self.onmessage = async (event) => {
  const message = event.data;
  if (!message || message.type !== 'decrypt') {
    return;
  }

  try {
    const runtime = await loadRuntime();
    const workbook = await runtime.fromDataAsync(message.data, {
      password: message.password,
    });
    const output = await workbook.outputAsync({ type: 'arraybuffer' });
    const buffer = await toArrayBuffer(output);
    self.postMessage({ type: 'success', data: buffer }, [buffer]);
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: getErrorMessage(error),
    });
  }
};
`;

const getWorkerScriptUrl = (): string => {
  if (!workerScriptUrl) {
    workerScriptUrl = URL.createObjectURL(
      new Blob([createWorkerSource()], {
        type: 'application/javascript',
      })
    );
  }

  return workerScriptUrl;
};

const decryptSpreadsheetInWorker = async (
  data: ArrayBuffer,
  password: string,
  timeoutMs: number
): Promise<ArrayBuffer> => {
  const worker = new Worker(getWorkerScriptUrl());
  const payload = data.slice(0);

  return new Promise<ArrayBuffer>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      settled = true;
      worker.onmessage = null;
      worker.onerror = null;
      globalThis.clearTimeout(timeoutId);
      worker.terminate();
    };

    const rejectWith = (message: string) => {
      cleanup();
      reject(new Error(message));
    };

    const timeoutId = globalThis.setTimeout(() => {
      rejectWith('Spreadsheet decryption timed out');
    }, timeoutMs);

    worker.onerror = () => {
      rejectWith('Spreadsheet decryption failed');
    };

    worker.onmessage = (event: MessageEvent<WorkerDecryptMessage>) => {
      if (settled) {
        return;
      }

      const message = event.data;

      if (message?.type === 'success' && message.data instanceof ArrayBuffer) {
        cleanup();
        resolve(message.data);
        return;
      }

      rejectWith(getErrorMessage(message?.type === 'error' ? message.message : undefined));
    };

    const request: WorkerDecryptRequest = {
      type: 'decrypt',
      data: payload,
      password,
    };

    worker.postMessage(request, [payload]);
  });
};

export const decryptSpreadsheetArrayBuffer = async (
  data: ArrayBuffer,
  password: string,
  timeoutMs = DEFAULT_DECRYPT_TIMEOUT
): Promise<ArrayBuffer> => {
  const trimmedPassword = password.trim();

  if (!trimmedPassword) {
    throw new Error('Password is required');
  }

  if (typeof Worker !== 'undefined') {
    try {
      return await decryptSpreadsheetInWorker(data, trimmedPassword, timeoutMs);
    } catch {
      // Fallback to main thread when the worker environment cannot initialize the runtime.
    }
  }

  return decryptSpreadsheetInMainThread(data, trimmedPassword);
};
