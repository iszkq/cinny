import { useCallback } from 'react';
import { useAsyncCallback } from '../hooks/useAsyncCallback';
import { trimTrailingSlash } from '../utils/common';

export type XLSXWorksheet = unknown;

export type XLSXWorkbook = {
  SheetNames: string[];
  Sheets: Record<string, XLSXWorksheet | undefined>;
};

export type XLSXModule = {
  read: (
    data: ArrayBuffer,
    options: {
      type: 'array';
      dense: boolean;
      cellDates: boolean;
      raw: boolean;
    }
  ) => XLSXWorkbook;
  utils: {
    sheet_to_json: (
      sheet: XLSXWorksheet,
      options: {
        header: 1;
        raw: boolean;
        defval: string;
      }
    ) => unknown[][];
  };
};

const XLSX_BROWSER_SCRIPT_ID = 'cinny-xlsx-browser-runtime';

let xlsxRuntimePromise: Promise<XLSXModule> | undefined;

const getGlobalXLSX = (): XLSXModule | undefined => {
  const globalXlsx = (globalThis as typeof globalThis & { XLSX?: XLSXModule }).XLSX;

  if (globalXlsx && typeof globalXlsx.read === 'function') {
    return globalXlsx;
  }

  return undefined;
};

const loadXLSXBrowserRuntime = async (): Promise<XLSXModule> => {
  const resolved = getGlobalXLSX();
  if (resolved) return resolved;

  if (typeof document === 'undefined') {
    throw new Error('Spreadsheet preview is only available in the browser');
  }

  if (!xlsxRuntimePromise) {
    const src = `${trimTrailingSlash(import.meta.env.BASE_URL)}/xlsx.full.min.js`;

    xlsxRuntimePromise = new Promise<XLSXModule>((resolve, reject) => {
      const complete = () => {
        const runtime = getGlobalXLSX();

        if (!runtime) {
          reject(new Error('Failed to initialize browser XLSX runtime'));
          return;
        }

        resolve(runtime);
      };

      const handleError = () => {
        reject(new Error('Failed to load browser XLSX runtime'));
      };

      const existingScript = document.getElementById(XLSX_BROWSER_SCRIPT_ID) as
        | HTMLScriptElement
        | null;

      if (existingScript) {
        existingScript.addEventListener('load', complete, { once: true });
        existingScript.addEventListener('error', handleError, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.id = XLSX_BROWSER_SCRIPT_ID;
      script.async = true;
      script.src = src;
      script.addEventListener('load', complete, { once: true });
      script.addEventListener('error', handleError, { once: true });

      document.head.appendChild(script);
    }).catch((error) => {
      xlsxRuntimePromise = undefined;
      document.getElementById(XLSX_BROWSER_SCRIPT_ID)?.remove();
      throw error;
    });
  }

  return xlsxRuntimePromise;
};

export const useXLSXLoader = () =>
  useAsyncCallback(
    useCallback(async () => loadXLSXBrowserRuntime(), [])
  );
