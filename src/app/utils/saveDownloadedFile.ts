import FileSaver from 'file-saver';
import { registerPlugin } from '@capacitor/core';
import { isDesktopUpdaterSupported } from './desktopUpdater';
import { isAndroidApp } from './nativePlatform';
import { isIOS } from './user-agent';

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

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const getDownloadMimeType = (fileContent: Blob, fileName: string): string => {
  if (fileContent.type && fileContent.type !== 'application/octet-stream') return fileContent.type;

  const extension = fileName.split('.').pop()?.toLowerCase();
  return (extension && IMAGE_MIME_BY_EXTENSION[extension]) || 'application/octet-stream';
};

const shareImageOnIOS = async (
  fileContent: Blob,
  fileName: string,
  mimeType: string
): Promise<boolean> => {
  if (!isIOS() || !mimeType.startsWith('image/') || typeof navigator.share !== 'function') {
    return false;
  }

  const imageFile = new File([fileContent], fileName, { type: mimeType });
  const shareData: ShareData = { files: [imageFile] };
  if (typeof navigator.canShare !== 'function' || !navigator.canShare(shareData)) return false;

  try {
    await navigator.share(shareData);
  } catch (error) {
    // Closing the iOS share sheet is a user cancellation, not a failed download.
    if (error instanceof DOMException && error.name === 'AbortError') return true;
    // If Safari considers the activation expired, fall back to its normal file saver.
    if (error instanceof DOMException && error.name === 'NotAllowedError') return false;
    if (error instanceof TypeError) return false;
    throw error;
  }
  return true;
};

export const saveDownloadedFile = async (fileContent: Blob, fileName: string): Promise<void> => {
  const mimeType = getDownloadMimeType(fileContent, fileName);

  if (isAndroidApp()) {
    const dataBase64 = await blobToBase64(fileContent);
    await NativeFileSaver.save({
      fileName,
      mimeType,
      dataBase64,
    });
    return;
  }

  if (!isDesktopUpdaterSupported()) {
    if (await shareImageOnIOS(fileContent, fileName, mimeType)) return;
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
