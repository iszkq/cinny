import { useCallback, useEffect, useMemo, useState } from 'react';
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

const buildMediaCandidates = (...sources: Array<string | undefined>): MediaCandidate[] => {
  const candidates: MediaCandidate[] = [];
  const seenSources = new Set<string>();
  const seenDisplayUrls = new Set<string>();

  sources.forEach((source) => {
    if (!source || seenSources.has(source)) {
      return;
    }

    seenSources.add(source);

    const cachedUrl = getCachedMediaObjectUrl(source);
    if (cachedUrl && !seenDisplayUrls.has(cachedUrl)) {
      candidates.push({ source, displayUrl: cachedUrl });
      seenDisplayUrls.add(cachedUrl);
    }

    if (!seenDisplayUrls.has(source)) {
      candidates.push({ source, displayUrl: source });
      seenDisplayUrls.add(source);
    }
  });

  return candidates;
};

export const useStableMediaUrl = (src?: string, fallbackSrc?: string) => {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [loadedDisplayUrl, setLoadedDisplayUrl] = useState<string | undefined>();
  const [retryCount, setRetryCount] = useState(0);

  const candidates = useMemo(
    () => buildMediaCandidates(src, fallbackSrc),
    [src, fallbackSrc, cacheVersion]
  );

  useEffect(() => {
    setCandidateIndex(0);
    setLoadedDisplayUrl(undefined);
    setRetryCount(0);
  }, [src, fallbackSrc]);

  useEffect(() => {
    if (!src && !fallbackSrc) {
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
      void primeCachedMediaObjectUrl(src);
    }
    if (fallbackSrc && fallbackSrc !== src) {
      void primeCachedMediaObjectUrl(fallbackSrc);
    }

    return () => {
      unsubscribeList.forEach((unsubscribe) => unsubscribe());
    };
  }, [src, fallbackSrc]);

  const activeCandidate = candidates[candidateIndex];
  const displayUrl = loadedDisplayUrl ?? activeCandidate?.displayUrl;
  const hasFailed = !loadedDisplayUrl && (candidates.length === 0 || candidateIndex >= candidates.length);

  useEffect(() => {
    retainObjectUrl(displayUrl);

    return () => {
      releaseObjectUrl(displayUrl);
    };
  }, [displayUrl]);

  useEffect(() => {
    if (!hasFailed || loadedDisplayUrl || retryCount >= 4) {
      return undefined;
    }

    const retryTimer = window.setTimeout(() => {
      setRetryCount((prev) => prev + 1);
      setCacheVersion((prev) => prev + 1);
      setCandidateIndex(0);

      if (src) {
        void primeCachedMediaObjectUrl(src);
      }
      if (fallbackSrc && fallbackSrc !== src) {
        void primeCachedMediaObjectUrl(fallbackSrc);
      }
    }, 1200 * (retryCount + 1));

    return () => {
      window.clearTimeout(retryTimer);
    };
  }, [fallbackSrc, hasFailed, loadedDisplayUrl, retryCount, src]);

  const handleLoad = useCallback(() => {
    if (activeCandidate?.source) {
      void primeCachedMediaObjectUrl(activeCandidate.source);
    }
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
    handleLoad,
    handleError,
  };
};
