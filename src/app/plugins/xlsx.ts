import { useCallback } from 'react';
import type * as XLSX from 'xlsx';
import { useAsyncCallback } from '../hooks/useAsyncCallback';

export type XLSXModule = typeof XLSX;

export const useXLSXLoader = () =>
  useAsyncCallback(
    useCallback(async () => {
      const xlsx = await import('xlsx');

      return ('default' in xlsx && xlsx.default ? xlsx.default : xlsx) as XLSXModule;
    }, [])
  );
