import { useEffect, useState } from 'react';
import {
  getCachedMediaObjectUrl,
  primeCachedMediaObjectUrl,
  subscribeCachedMediaObjectUrl,
} from '../utils/mediaUrlCache';

type CachedMediaState = {
  src: string | undefined;
  url: string | undefined;
};

const getCachedMediaState = (src: string | undefined): CachedMediaState => ({
  src,
  url: getCachedMediaObjectUrl(src),
});

export const useCachedMediaUrl = (src: string | undefined): string | undefined => {
  const [cachedState, setCachedState] = useState<CachedMediaState>(() => getCachedMediaState(src));

  useEffect(() => {
    setCachedState(getCachedMediaState(src));

    if (!src) {
      return undefined;
    }

    const unsubscribe = subscribeCachedMediaObjectUrl(src, (objectUrl) => {
      setCachedState((prevState) => {
        if (prevState.src === src && prevState.url === objectUrl) {
          return prevState;
        }

        return {
          src,
          url: objectUrl,
        };
      });
    });

    void primeCachedMediaObjectUrl(src);

    return unsubscribe;
  }, [src]);

  return cachedState.src === src ? cachedState.url : undefined;
};
