import { useCallback } from 'react';
import type * as DocxPreview from 'docx-preview';
import { useAsyncCallback } from '../hooks/useAsyncCallback';

export type DocxPreviewModule = typeof DocxPreview;

export const useDocxPreviewLoader = () =>
  useAsyncCallback(
    useCallback(async () => {
      const docxPreview = await import('docx-preview');

      return ('default' in docxPreview && docxPreview.default
        ? docxPreview.default
        : docxPreview) as DocxPreviewModule;
    }, [])
  );
