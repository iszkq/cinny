import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCachedMediaUrl } from './useCachedMediaUrl';

const AVATAR_RETRY_DELAY_MS = 250;

const clearTimer = (timerRef: { current: number | undefined }) => {
  if (typeof timerRef.current === 'number') {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }
};

export const useResilientAvatarMedia = (src?: string) => {
  const cachedSrc = useCachedMediaUrl(src);
  const candidates = useMemo(
    () => Array.from(new Set([cachedSrc, src].filter(Boolean) as string[])),
    [cachedSrc, src]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const [showFallback, setShowFallback] = useState(false);
  const retriedSrcRef = useRef<string>();
  const retryTimerRef = useRef<number>();

  const displaySrc = candidates[candidateIndex];

  useEffect(() => {
    clearTimer(retryTimerRef);
    setCandidateIndex(0);
    setRetryNonce(0);
    setShowFallback(false);
    retriedSrcRef.current = undefined;
  }, [cachedSrc, src]);

  useEffect(
    () => () => {
      clearTimer(retryTimerRef);
    },
    []
  );

  const handleLoad = useCallback(() => {
    clearTimer(retryTimerRef);
    setShowFallback(false);
    if (displaySrc) {
      retriedSrcRef.current = undefined;
    }
  }, [displaySrc]);

  const handleError = useCallback(() => {
    clearTimer(retryTimerRef);

    if (candidateIndex + 1 < candidates.length) {
      setShowFallback(false);
      setCandidateIndex((value) => Math.min(value + 1, candidates.length - 1));
      return;
    }

    if (displaySrc && retriedSrcRef.current !== displaySrc) {
      retriedSrcRef.current = displaySrc;
      setShowFallback(false);
      retryTimerRef.current = window.setTimeout(() => {
        setRetryNonce((value) => value + 1);
      }, AVATAR_RETRY_DELAY_MS);
      return;
    }

    setShowFallback(true);
  }, [candidateIndex, candidates.length, displaySrc]);

  return {
    displaySrc,
    showFallback: !displaySrc || showFallback,
    imageKey: `${displaySrc ?? 'empty'}-${retryNonce}`,
    handleLoad,
    handleError,
  };
};
