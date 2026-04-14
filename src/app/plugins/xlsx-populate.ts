import { useCallback } from 'react';
import { useAsyncCallback } from '../hooks/useAsyncCallback';

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

const XLSX_POPULATE_SCRIPT_ID = 'cinny-xlsx-populate-runtime';
const XLSX_POPULATE_SCRIPT_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx-populate/1.21.0/xlsx-populate.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx-populate@1.21.0/browser/xlsx-populate.min.js',
];

let xlsxPopulateRuntimePromise: Promise<XlsxPopulateModule> | undefined;

const getGlobalXlsxPopulate = (): XlsxPopulateModule | undefined => {
  const runtime = (globalThis as typeof globalThis & { XlsxPopulate?: XlsxPopulateModule })
    .XlsxPopulate;

  if (runtime && typeof runtime.fromDataAsync === 'function') {
    return runtime;
  }

  return undefined;
};

const removeRuntimeScript = () => {
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

export const useXlsxPopulateLoader = () =>
  useAsyncCallback(useCallback(async () => loadXlsxPopulateRuntime(), []));
