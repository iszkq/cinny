import { ReactNode, useCallback, useEffect } from 'react';
import { IThumbnailContent } from '../../../../types/matrix/common';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { decryptFile, downloadEncryptedMedia, mxcUrlToHttp } from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import {
  getCachedMediaObjectUrl,
  primeCachedMediaObjectUrl,
  primePersistentMediaUrl,
} from '../../../utils/mediaUrlCache';
import { FALLBACK_MIMETYPE } from '../../../utils/mimeTypes';
import { getSessionMediaCacheKey, loadSessionMediaUrl } from '../../../utils/sessionMediaCache';

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
        return loadSessionMediaUrl(
          getSessionMediaCacheKey('thumbnail', mediaUrl, thumbInfo.mimetype ?? FALLBACK_MIMETYPE),
          async () =>
            downloadEncryptedMedia(mediaUrl, (encBuf) =>
              decryptFile(encBuf, thumbInfo.mimetype ?? FALLBACK_MIMETYPE, encInfo)
            )
        );
      }

      void primePersistentMediaUrl(mediaUrl);
      void primeCachedMediaObjectUrl(mediaUrl, 'background');

      return getCachedMediaObjectUrl(mediaUrl) ?? mediaUrl;
    }, [mx, info, useAuthentication])
  );

  useEffect(() => {
    loadThumbSrc();
  }, [loadThumbSrc]);

  return thumbSrcState.status === AsyncStatus.Success ? renderImage(thumbSrcState.data) : null;
}
