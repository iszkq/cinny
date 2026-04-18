import { useEffect, useMemo, useState } from 'react';
import { IImageInfo } from '../../types/matrix/common';
import {
  getAnimatedMediaPreview,
  isAnimatedPreviewCandidate,
  primeAnimatedMediaPreview,
} from '../utils/animatedMediaPreview';

export const useAnimatedMediaPreview = (src: string | undefined, info?: IImageInfo) => {
  const mimeType = info?.mimetype;
  const width = info?.w;
  const height = info?.h;
  const previewInfo = useMemo<IImageInfo | undefined>(() => {
    if (!mimeType && !width && !height) {
      return undefined;
    }

    return {
      mimetype: mimeType,
      w: width,
      h: height,
    };
  }, [height, mimeType, width]);

  const canUseStaticPreview = useMemo(
    () => isAnimatedPreviewCandidate(previewInfo),
    [previewInfo]
  );
  const [previewSrc, setPreviewSrc] = useState<string | undefined>(() => getAnimatedMediaPreview(src));

  useEffect(() => {
    if (!src || !canUseStaticPreview) {
      setPreviewSrc(undefined);
      return;
    }

    const cachedPreview = getAnimatedMediaPreview(src);
    if (cachedPreview) {
      setPreviewSrc(cachedPreview);
      return;
    }

    let disposed = false;

    primeAnimatedMediaPreview(src, previewInfo)?.then((loadedPreview) => {
      if (!disposed && loadedPreview) {
        setPreviewSrc(loadedPreview);
      }
    });

    return () => {
      disposed = true;
    };
  }, [canUseStaticPreview, previewInfo, src]);

  return canUseStaticPreview ? previewSrc : undefined;
};
