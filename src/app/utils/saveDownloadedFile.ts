import FileSaver from 'file-saver';
import { registerPlugin } from '@capacitor/core';
import { isDesktopUpdaterSupported } from './desktopUpdater';
import { isAndroidApp } from './nativePlatform';

type NativeFileSaverPlugin = {
  save(options: {
    fileName: string;
    mimeType: string;
    dataBase64: string;
  }): Promise<{ uri: string; fileName: string }>;
};

const NativeFileSaver = registerPlugin<NativeFileSaverPlugin>('NativeFileSaver');

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
  if (isAndroidApp()) {
    const dataBase64 = await blobToBase64(fileContent);
    await NativeFileSaver.save({
      fileName,
      mimeType: fileContent.type || 'application/octet-stream',
      dataBase64,
    });
    return;
  }

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
