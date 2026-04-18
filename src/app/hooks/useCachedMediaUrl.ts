import { useEffect, useState } from 'react';
import {
  getCachedMediaObjectUrl,
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
  }, [src]);

  return cachedState.src === src ? cachedState.url : undefined;
};
