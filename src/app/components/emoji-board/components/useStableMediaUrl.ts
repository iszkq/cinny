import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getCachedDesktopMediaAssetUrl,
  primeDesktopMediaAssetUrl,
} from '../../../utils/desktopMediaAssetCache';
import { isDesktopUpdaterSupported } from '../../../utils/desktopUpdater';
import {
  getCachedMediaObjectUrl,
  primeCachedMediaObjectUrl,
  subscribeCachedMediaObjectUrl,
} from '../../../utils/mediaUrlCache';
import { releaseObjectUrl, retainObjectUrl } from '../../../utils/objectUrlRetainer';

type MediaCandidate = {
  source: string;
  displayUrl: string;
};

type UseStableMediaUrlOptions = {
  disableObjectUrlCache?: boolean;
  mimeType?: string;
  fallbackMimeType?: string;
  preferObjectUrl?: boolean;
};

const buildMediaCandidates = (
  allowObjectUrlCache: boolean,
  ...sources: Array<string | undefined>
): MediaCandidate[] => {
  const candidates: MediaCandidate[] = [];
  const seenSources = new Set<string>();
  const seenDisplayUrls = new Set<string>();

  sources.forEach((source) => {
    if (!source || seenSources.has(source)) {
      return;
    }

    seenSources.add(source);

    if (allowObjectUrlCache) {
      const cachedUrl = getCachedMediaObjectUrl(source);
      if (cachedUrl && !seenDisplayUrls.has(cachedUrl)) {
        candidates.push({ source, displayUrl: cachedUrl });
        seenDisplayUrls.add(cachedUrl);
      }
    }

    if (!seenDisplayUrls.has(source)) {
      candidates.push({ source, displayUrl: source });
      seenDisplayUrls.add(source);
    }
  });

  return candidates;
};

export const useStableMediaUrl = (
  src?: string,
  fallbackSrc?: string,
  options: UseStableMediaUrlOptions = {}
) => {
  const desktopSupported = isDesktopUpdaterSupported();
  const objectUrlCacheEnabled = desktopSupported && !(options.disableObjectUrlCache ?? false);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [desktopSrc, setDesktopSrc] = useState<string | undefined>(() =>
    desktopSupported ? getCachedDesktopMediaAssetUrl(src) : undefined
  );
  const [desktopFallbackSrc, setDesktopFallbackSrc] = useState<string | undefined>(() =>
    desktopSupported ? getCachedDesktopMediaAssetUrl(fallbackSrc) : undefined
  );
  const [loadedDisplayUrl, setLoadedDisplayUrl] = useState<string | undefined>();

  const candidates = useMemo(
    () =>
      buildMediaCandidates(
        objectUrlCacheEnabled,
        desktopSrc,
        src,
        desktopFallbackSrc,
        fallbackSrc
      ),
    [cacheVersion, desktopFallbackSrc, desktopSrc, fallbackSrc, objectUrlCacheEnabled, src]
  );

  useEffect(() => {
    setCandidateIndex(0);
    setCacheVersion((prev) => prev + 1);
    setDesktopSrc(desktopSupported ? getCachedDesktopMediaAssetUrl(src) : undefined);
    setDesktopFallbackSrc(
      desktopSupported ? getCachedDesktopMediaAssetUrl(fallbackSrc) : undefined
    );
    setLoadedDisplayUrl(undefined);
  }, [desktopSupported, fallbackSrc, src]);

  useEffect(() => {
    if (!desktopSupported) {
      return undefined;
    }

    let disposed = false;

    if (src) {
      const primeSrcPromise = primeDesktopMediaAssetUrl(src, 'visible', options.mimeType);
      if (primeSrcPromise) {
        void primeSrcPromise.then((assetUrl) => {
          if (!disposed) {
            setDesktopSrc(assetUrl);
          }
        });
      }
    }

    if (fallbackSrc && fallbackSrc !== src) {
      const primeFallbackPromise = primeDesktopMediaAssetUrl(
        fallbackSrc,
        'background',
        options.fallbackMimeType ?? options.mimeType
      );
      if (primeFallbackPromise) {
        void primeFallbackPromise.then((assetUrl) => {
          if (!disposed) {
            setDesktopFallbackSrc(assetUrl);
          }
        });
      }
    }

    return () => {
      disposed = true;
    };
  }, [desktopSupported, fallbackSrc, options.fallbackMimeType, options.mimeType, src]);

  useEffect(() => {
    if (!objectUrlCacheEnabled || (!src && !fallbackSrc)) {
      return undefined;
    }

    const handleCachedUrlChange = () => {
      setCacheVersion((prev) => prev + 1);
      setCandidateIndex(0);
    };

    const unsubscribeList = [
      subscribeCachedMediaObjectUrl(src, handleCachedUrlChange),
      fallbackSrc && fallbackSrc !== src
        ? subscribeCachedMediaObjectUrl(fallbackSrc, handleCachedUrlChange)
        : undefined,
    ].filter(Boolean) as Array<() => void>;

    if (src) {
      void primeCachedMediaObjectUrl(src, 'visible');
    }
    if (fallbackSrc && fallbackSrc !== src) {
      void primeCachedMediaObjectUrl(fallbackSrc, 'background');
    }

    return () => {
      unsubscribeList.forEach((unsubscribe) => unsubscribe());
    };
  }, [fallbackSrc, objectUrlCacheEnabled, src]);

  const activeCandidate = candidates[candidateIndex];
  const displayUrl = loadedDisplayUrl ?? activeCandidate?.displayUrl;
  const hasFailed = !loadedDisplayUrl && candidateIndex >= candidates.length;
  const requestKey = `${candidateIndex}-${cacheVersion}-${displayUrl ?? 'empty'}`;
  const isLoaded = Boolean(loadedDisplayUrl && loadedDisplayUrl === displayUrl);

  useEffect(() => {
    retainObjectUrl(displayUrl);

    return () => {
      releaseObjectUrl(displayUrl);
    };
  }, [displayUrl]);

  const handleLoad = useCallback(() => {
    setLoadedDisplayUrl((prev) => prev ?? activeCandidate?.displayUrl);
  }, [activeCandidate]);

  const handleError = useCallback(() => {
    if (loadedDisplayUrl) {
      return;
    }

    setCandidateIndex((currentIndex) => Math.min(currentIndex + 1, candidates.length));
  }, [candidates.length, loadedDisplayUrl]);

  return {
    displayUrl,
    hasFailed,
    isLoaded,
    requestKey,
    handleLoad,
    handleError,
  };
};
