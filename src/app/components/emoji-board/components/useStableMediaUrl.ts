import { useCallback, useEffect, useMemo, useState } from 'react';
import { primeDesktopMediaAssetUrl } from '../../../utils/desktopMediaAssetCache';
import { isDesktopUpdaterSupported } from '../../../utils/desktopUpdater';

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

const buildMediaCandidates = (...sources: Array<string | undefined>): MediaCandidate[] => {
  const candidates: MediaCandidate[] = [];
  const seenSources = new Set<string>();
  const seenDisplayUrls = new Set<string>();

  sources.forEach((source) => {
    if (!source || seenSources.has(source)) {
      return;
    }

    seenSources.add(source);
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
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [desktopSrc, setDesktopSrc] = useState<string | undefined>();
  const [desktopFallbackSrc, setDesktopFallbackSrc] = useState<string | undefined>();
  const [loadedDisplayUrl, setLoadedDisplayUrl] = useState<string | undefined>();

  const candidates = useMemo(
    () => buildMediaCandidates(desktopSrc, src, desktopFallbackSrc, fallbackSrc),
    [desktopFallbackSrc, desktopSrc, fallbackSrc, src]
  );

  useEffect(() => {
    setCandidateIndex(0);
    setDesktopSrc(undefined);
    setDesktopFallbackSrc(undefined);
    setLoadedDisplayUrl(undefined);
  }, [fallbackSrc, src]);

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

  const activeCandidate = candidates[candidateIndex];
  const displayUrl = loadedDisplayUrl ?? activeCandidate?.displayUrl;
  const hasFailed = !loadedDisplayUrl && candidateIndex >= candidates.length;
  const requestKey = `${candidateIndex}-${displayUrl ?? 'empty'}`;
  const isLoaded = Boolean(loadedDisplayUrl && loadedDisplayUrl === displayUrl);

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
