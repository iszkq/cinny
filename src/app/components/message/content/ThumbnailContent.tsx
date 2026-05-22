import { ReactNode, useCallback, useEffect } from 'react';
import { IThumbnailContent } from '../../../../types/matrix/common';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import {
  decryptFile,
  downloadEncryptedMedia,
  mxcUrlToHttp,
  shouldUseObjectUrlForMediaDisplay,
} from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { FALLBACK_MIMETYPE } from '../../../utils/mimeTypes';
import { primeCachedMediaObjectUrl } from '../../../utils/mediaUrlCache';
import {
  loadDesktopMediaAssetBytes,
  primeDesktopMediaAssetUrl,
} from '../../../utils/desktopMediaAssetCache';

export type ThumbnailContentProps = {
  info: IThumbnailContent;
  renderImage: (src: string) => ReactNode;
};
export function ThumbnailContent({ info, renderImage }: ThumbnailContentProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [thumbSrcState, loadThumbSrc] = useAsyncCallback(
    useCallback(async () => {
      const thumbInfo = info.thumbnail_info;
      const thumbMxcUrl = info.thumbnail_file?.url ?? info.thumbnail_url;
      const encInfo = info.thumbnail_file;
      if (typeof thumbMxcUrl !== 'string' || typeof thumbInfo?.mimetype !== 'string') {
        throw new Error('Failed to load thumbnail');
      }

      const mediaUrl = mxcUrlToHttp(mx, thumbMxcUrl, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
      if (encInfo) {
        const desktopMediaAsset = await loadDesktopMediaAssetBytes(
          mediaUrl,
          'visible',
          thumbInfo.mimetype ?? FALLBACK_MIMETYPE
        );
        const fileContent = desktopMediaAsset
          ? await decryptFile(
              desktopMediaAsset.bytes.slice().buffer,
              thumbInfo.mimetype ?? desktopMediaAsset.mimeType ?? FALLBACK_MIMETYPE,
              encInfo
            )
          : await downloadEncryptedMedia(mediaUrl, (encBuf) =>
              decryptFile(encBuf, thumbInfo.mimetype ?? FALLBACK_MIMETYPE, encInfo)
            );
        return URL.createObjectURL(fileContent);
      }

      const desktopMediaUrl = await primeDesktopMediaAssetUrl(
        mediaUrl,
        'visible',
        thumbInfo.mimetype
      );
      if (desktopMediaUrl) {
        return desktopMediaUrl;
      }

      const preparedMediaUrl = await primeCachedMediaObjectUrl(mediaUrl, 'visible');
      if (preparedMediaUrl) {
        return preparedMediaUrl;
      }

      if (shouldUseObjectUrlForMediaDisplay(mediaUrl)) {
        throw new Error('Failed to prepare thumbnail media');
      }

      return mediaUrl;
    }, [mx, info, useAuthentication])
  );

  useEffect(() => {
    loadThumbSrc();
  }, [loadThumbSrc]);

  return thumbSrcState.status === AsyncStatus.Success ? renderImage(thumbSrcState.data) : null;
}
