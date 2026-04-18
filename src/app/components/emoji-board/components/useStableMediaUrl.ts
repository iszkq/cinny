import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getCachedMediaObjectUrl,
  primeCachedMediaObjectUrl,
} from '../../../utils/mediaUrlCache';

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
  const candidates = useMemo(() => buildMediaCandidates(src, fallbackSrc), [src, fallbackSrc]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [src, fallbackSrc]);

  const activeCandidate = candidates[candidateIndex];

  const handleLoad = useCallback(() => {
    if (activeCandidate?.source) {
      void primeCachedMediaObjectUrl(activeCandidate.source);
    }
  }, [activeCandidate]);

  const handleError = useCallback(() => {
    setCandidateIndex((currentIndex) =>
      Math.min(currentIndex + 1, candidates.length)
    );
  }, [candidates.length]);

  return {
    displayUrl: activeCandidate?.displayUrl,
    hasFailed: candidates.length === 0 || candidateIndex >= candidates.length,
    handleLoad,
    handleError,
  };
};
