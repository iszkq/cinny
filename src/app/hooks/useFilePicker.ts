import { useCallback } from 'react';
import { SelectFileOptions, selectFile } from '../utils/dom';

export const useFilePicker = <M extends boolean | undefined = undefined>(
  onSelect: (file: M extends true ? File[] : File) => void,
  multiple?: M
) =>
  useCallback(
    async (accept: string | SelectFileOptions) => {
      const file = await selectFile(accept, multiple);
      if (!file) return;
      onSelect(file);
    },
    [multiple, onSelect]
  );
