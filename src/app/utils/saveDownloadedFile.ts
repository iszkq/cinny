import FileSaver from 'file-saver';
import { isDesktopUpdaterSupported } from './desktopUpdater';

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read file data.'));
    };

    reader.onload = () => {
      const { result } = reader;
      if (typeof result !== 'string') {
        reject(new Error('Failed to encode file data.'));
        return;
      }

      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };

    reader.readAsDataURL(blob);
  });

export const saveDownloadedFile = async (fileContent: Blob, fileName: string): Promise<void> => {
  if (!isDesktopUpdaterSupported()) {
    FileSaver.saveAs(fileContent, fileName);
    return;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  const dataBase64 = await blobToBase64(fileContent);

  await invoke<boolean>('save_downloaded_file', {
    request: {
      fileName,
      dataBase64,
    },
  });
};
