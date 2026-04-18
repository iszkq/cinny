import { useEffect, useState } from 'react';
import {
  getCachedMediaObjectUrl,
  primeCachedMediaObjectUrl,
} from '../utils/mediaUrlCache';

export const useCachedMediaUrl = (src: string | undefined): string | undefined => {
  const [cachedUrl, setCachedUrl] = useState<string | undefined>(() => getCachedMediaObjectUrl(src));

  useEffect(() => {
    if (!src) {
      setCachedUrl(undefined);
      return;
    }

    const memoryCachedUrl = getCachedMediaObjectUrl(src);
    if (memoryCachedUrl) {
      setCachedUrl(memoryCachedUrl);
      return;
    }

    setCachedUrl(undefined);

    let disposed = false;

    primeCachedMediaObjectUrl(src)?.then((resolvedUrl) => {
      if (!disposed && resolvedUrl) {
        setCachedUrl(resolvedUrl);
      }
    });

    return () => {
      disposed = true;
    };
  }, [src]);

  return cachedUrl;
};
