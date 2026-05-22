import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCachedMediaUrls } from './useCachedMediaUrl';
import { isDesktopUpdaterSupported } from '../utils/desktopUpdater';
import { shouldUseObjectUrlForMediaDisplay } from '../utils/matrix';

const AVATAR_RETRY_DELAY_MS = 250;

const clearTimer = (timerRef: { current: number | undefined }) => {
  if (typeof timerRef.current === 'number') {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }
};

export const useResilientAvatarMedia = (src?: string) => {
  const desktopSupported = isDesktopUpdaterSupported();
  const { desktopUrl, objectUrl } = useCachedMediaUrls(src);
  const directUrl = shouldUseObjectUrlForMediaDisplay(src) ? undefined : src;
  const candidates = useMemo(
    () => Array.from(new Set([desktopUrl, objectUrl, directUrl].filter(Boolean) as string[])),
    [desktopUrl, directUrl, objectUrl]
  );
  const candidateKey = useMemo(() => candidates.join('\n'), [candidates]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const [showFallback, setShowFallback] = useState(false);
  const [webError, setWebError] = useState(false);
  const retriedSrcRef = useRef<string>();
  const retryTimerRef = useRef<number>();

  const desktopDisplaySrc = candidates[candidateIndex];
  const webDisplaySrc = objectUrl ?? directUrl;
  const displaySrc = desktopSupported ? desktopDisplaySrc : webDisplaySrc;

  useEffect(() => {
    if (!desktopSupported) {
      return;
    }

    clearTimer(retryTimerRef);
    setCandidateIndex(0);
    setRetryNonce(0);
    setShowFallback(false);
    retriedSrcRef.current = undefined;
  }, [candidateKey, desktopSupported]);

  useEffect(() => {
    if (desktopSupported) {
      return;
    }

    clearTimer(retryTimerRef);
    setWebError(false);
  }, [desktopSupported, webDisplaySrc]);

  useEffect(
    () => () => {
      clearTimer(retryTimerRef);
    },
    []
  );

  const handleLoad = useCallback(() => {
    clearTimer(retryTimerRef);
    setWebError(false);
    setShowFallback(false);
    if (displaySrc) {
      retriedSrcRef.current = undefined;
    }
  }, [displaySrc]);

  const handleError = useCallback(() => {
    clearTimer(retryTimerRef);

    if (!desktopSupported) {
      setWebError(true);
      return;
    }

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
  }, [candidateIndex, candidates.length, desktopSupported, displaySrc]);

  return {
    displaySrc,
    showFallback: desktopSupported ? !displaySrc || showFallback : !displaySrc || webError,
    imageKey: desktopSupported ? `${displaySrc ?? 'empty'}-${retryNonce}` : undefined,
    handleLoad,
    handleError,
  };
};
