import { useCallback } from 'react';
import { useAsyncCallback } from '../hooks/useAsyncCallback';

export type MammothResult = {
  value: string;
  messages?: Array<{
    type?: string;
    message?: string;
  }>;
};

export type MammothModule = {
  convertToHtml: (
    input: {
      arrayBuffer: ArrayBuffer;
    },
    options?: Record<string, unknown>
  ) => Promise<MammothResult>;
};

const MAMMOTH_SCRIPT_ID = 'cinny-mammoth-runtime';
const MAMMOTH_SCRIPT_URLS = [
  'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
  'https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js',
];

let mammothRuntimePromise: Promise<MammothModule> | undefined;

const getGlobalMammoth = (): MammothModule | undefined => {
  const runtime = (globalThis as typeof globalThis & { mammoth?: MammothModule }).mammoth;

  if (runtime && typeof runtime.convertToHtml === 'function') {
    return runtime;
  }

  return undefined;
};

const removeRuntimeScript = () => {
  document.getElementById(MAMMOTH_SCRIPT_ID)?.remove();
};

const loadRuntimeFromScript = (src: string): Promise<MammothModule> =>
  new Promise((resolve, reject) => {
    const handleComplete = () => {
      const runtime = getGlobalMammoth();

      if (!runtime) {
        reject(new Error('Failed to initialize word preview runtime'));
        return;
      }

      resolve(runtime);
    };

    const handleError = () => {
      reject(new Error(`Failed to load word preview runtime from ${src}`));
    };

    const existingScript = document.getElementById(MAMMOTH_SCRIPT_ID) as HTMLScriptElement | null;

    if (existingScript && existingScript.src === src) {
      existingScript.addEventListener('load', handleComplete, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
      return;
    }

    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement('script');
    script.id = MAMMOTH_SCRIPT_ID;
    script.async = true;
    script.src = src;
    script.addEventListener('load', handleComplete, { once: true });
    script.addEventListener('error', handleError, { once: true });

    document.head.appendChild(script);
  });

const loadMammothRuntime = async (): Promise<MammothModule> => {
  const resolved = getGlobalMammoth();
  if (resolved) return resolved;

  if (typeof document === 'undefined') {
    throw new Error('Word preview is only available in the browser');
  }

  if (!mammothRuntimePromise) {
    mammothRuntimePromise = (async () => {
      let lastError: unknown;

      for (const src of MAMMOTH_SCRIPT_URLS) {
        try {
          return await loadRuntimeFromScript(src);
        } catch (error) {
          lastError = error;
          removeRuntimeScript();
        }
      }

      throw lastError ?? new Error('Failed to load word preview runtime');
    })().catch((error) => {
      mammothRuntimePromise = undefined;
      removeRuntimeScript();
      throw error;
    });
  }

  return mammothRuntimePromise;
};

export const useMammothLoader = () =>
  useAsyncCallback(useCallback(async () => loadMammothRuntime(), []));
