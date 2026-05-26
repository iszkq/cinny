import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { decryptFile, downloadEncryptedMedia } from './matrix';
import {
  getCachedDesktopMediaAssetUrl,
  primeDesktopMediaAssetUrl,
} from './desktopMediaAssetCache';
import { getSessionMediaCacheKey, loadSessionMediaUrl } from './sessionMediaCache';

const DESKTOP_ENCRYPTED_MEDIA_WAIT_MS = 120;

const getEncryptedMediaCacheKey = (
  sourceUrl: string,
  mimeType: string,
  encInfo: EncryptedAttachmentInfo
): string =>
  getSessionMediaCacheKey(
    'encrypted-media',
    `${sourceUrl}::${encInfo.iv ?? ''}::${encInfo.hashes?.sha256 ?? ''}`,
    mimeType
  );

const resolveEncryptedMediaSourceUrl = async (
  sourceUrl: string,
  mimeType: string
): Promise<string> => {
  const cachedDesktopUrl = getCachedDesktopMediaAssetUrl(sourceUrl);
  if (cachedDesktopUrl) {
    return cachedDesktopUrl;
  }

  const desktopAssetPromise = primeDesktopMediaAssetUrl(sourceUrl, 'visible', mimeType);
  if (!desktopAssetPromise) {
    return sourceUrl;
  }

  let timeoutId: number | undefined;

  try {
    const desktopAssetUrl = await Promise.race([
      desktopAssetPromise.catch(() => undefined),
      new Promise<undefined>((resolve) => {
        timeoutId = window.setTimeout(() => resolve(undefined), DESKTOP_ENCRYPTED_MEDIA_WAIT_MS);
      }),
    ]);

    return desktopAssetUrl ?? sourceUrl;
  } finally {
    if (typeof timeoutId === 'number') {
      window.clearTimeout(timeoutId);
    }
  }
};

export const prepareEncryptedMediaObjectUrl = async (
  sourceUrl: string,
  mimeType: string,
  encInfo: EncryptedAttachmentInfo
): Promise<string> => {
  const cacheKey = getEncryptedMediaCacheKey(sourceUrl, mimeType, encInfo);

  return loadSessionMediaUrl(cacheKey, async () => {
    const resolvedSourceUrl = await resolveEncryptedMediaSourceUrl(sourceUrl, mimeType);

    try {
      return await downloadEncryptedMedia(resolvedSourceUrl, (encBuf) =>
        decryptFile(encBuf, mimeType, encInfo)
      );
    } catch (error) {
      if (resolvedSourceUrl === sourceUrl) {
        throw error;
      }

      return downloadEncryptedMedia(sourceUrl, (encBuf) =>
        decryptFile(encBuf, mimeType, encInfo)
      );
    }
  });
};
