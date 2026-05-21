import { ReactNode, useCallback, useEffect } from 'react';
import { IThumbnailContent } from '../../../../types/matrix/common';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { decryptFile, downloadEncryptedMedia, mxcUrlToHttp } from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import {
  getPreparedMediaUrl,
  primeCachedMediaObjectUrl,
  primePersistentMediaUrl,
} from '../../../utils/mediaUrlCache';
import { releaseObjectUrl, retainObjectUrl } from '../../../utils/objectUrlRetainer';
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

      if (useAuthentication) {
        return (await primeCachedMediaObjectUrl(mediaUrl, 'visible')) ?? mediaUrl;
      }

      void primePersistentMediaUrl(mediaUrl);
      return (await getPreparedMediaUrl(mediaUrl, 'visible')) ?? mediaUrl;
    }, [mx, info, useAuthentication])
  );

  useEffect(() => {
    loadThumbSrc();
  }, [loadThumbSrc]);

  useEffect(() => {
    const retainedSrc = thumbSrcState.status === AsyncStatus.Success ? thumbSrcState.data : undefined;
    retainObjectUrl(retainedSrc);

    return () => {
      releaseObjectUrl(retainedSrc);
    };
  }, [
    thumbSrcState.status,
    thumbSrcState.status === AsyncStatus.Success ? thumbSrcState.data : undefined,
  ]);

  return thumbSrcState.status === AsyncStatus.Success ? renderImage(thumbSrcState.data) : null;
}
