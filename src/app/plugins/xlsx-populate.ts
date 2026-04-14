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

const XLSX_POPULATE_SCRIPT_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx-populate/1.21.0/xlsx-populate.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx-populate@1.21.0/browser/xlsx-populate.min.js',
  'https://unpkg.com/xlsx-populate/browser/xlsx-populate.min.js',
];

const DEFAULT_DECRYPT_TIMEOUT = 60_000;

let workerScriptUrl: string | undefined;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  return 'Spreadsheet decryption failed';
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

const toArrayBuffer = async (value) => {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  if (value && typeof value.arrayBuffer === 'function') {
    return value.arrayBuffer();
  }

  throw new Error('Failed to serialize decrypted spreadsheet');
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

export const decryptSpreadsheetArrayBuffer = async (
  data: ArrayBuffer,
  password: string,
  timeoutMs = DEFAULT_DECRYPT_TIMEOUT
): Promise<ArrayBuffer> => {
  const trimmedPassword = password.trim();

  if (!trimmedPassword) {
    throw new Error('Password is required');
  }

  if (typeof Worker === 'undefined') {
    throw new Error('Spreadsheet encryption preview is not available in this browser');
  }

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
      password: trimmedPassword,
    };

    worker.postMessage(request, [payload]);
  });
};
