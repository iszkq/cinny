import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCachedMediaUrls } from './useCachedMediaUrl';
import { isDesktopUpdaterSupported } from '../utils/desktopUpdater';
import { getOriginalMediaUrl, shouldUseObjectUrlForMediaDisplay } from '../utils/matrix';
import { invalidateCachedMediaUrl, primeCachedMediaObjectUrl } from '../utils/mediaUrlCache';

const AVATAR_RETRY_DELAY_MS = 250;

const clearTimer = (timer: number | undefined): undefined => {
  if (typeof timer === 'number') {
    window.clearTimeout(timer);
  }
  return undefined;
};

export const useResilientAvatarMedia = (src?: string, preferOriginal = false) => {
  const mediaSrc = useMemo(
    () => (preferOriginal ? getOriginalMediaUrl(src) : src),
    [preferOriginal, src]
  );
  const desktopSupported = isDesktopUpdaterSupported();
  const { desktopUrl, objectUrl } = useCachedMediaUrls(mediaSrc);
  const directUrl = shouldUseObjectUrlForMediaDisplay(mediaSrc) ? undefined : mediaSrc;
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

    retryTimerRef.current = clearTimer(retryTimerRef.current);
    setCandidateIndex(0);
    setRetryNonce(0);
    setShowFallback(false);
    retriedSrcRef.current = undefined;
  }, [candidateKey, desktopSupported]);

  useEffect(() => {
    if (desktopSupported) return;
    retryTimerRef.current = clearTimer(retryTimerRef.current);
    setWebError(false);
    setRetryNonce(0);
    retriedSrcRef.current = undefined;
  }, [desktopSupported, mediaSrc]);

  useEffect(() => {
    if (!desktopSupported && webDisplaySrc) setWebError(false);
  }, [desktopSupported, webDisplaySrc]);

  useEffect(
    () => () => {
      retryTimerRef.current = clearTimer(retryTimerRef.current);
    },
    []
  );

  const handleLoad = useCallback(() => {
    retryTimerRef.current = clearTimer(retryTimerRef.current);
    setWebError(false);
    setShowFallback(false);
    if (displaySrc) {
      retriedSrcRef.current = undefined;
    }
  }, [displaySrc]);

  const handleError = useCallback(() => {
    retryTimerRef.current = clearTimer(retryTimerRef.current);

    if (!desktopSupported) {
      if (mediaSrc && retriedSrcRef.current !== mediaSrc) {
        retriedSrcRef.current = mediaSrc;
        setWebError(false);
        retryTimerRef.current = window.setTimeout(() => {
          invalidateCachedMediaUrl(mediaSrc).then(() => {
            setRetryNonce((value) => value + 1);
            primeCachedMediaObjectUrl(mediaSrc, 'visible', true);
          });
        }, AVATAR_RETRY_DELAY_MS);
        return;
      }
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
  }, [candidateIndex, candidates.length, desktopSupported, displaySrc, mediaSrc]);

  return {
    displaySrc,
    showFallback: desktopSupported ? !displaySrc || showFallback : !displaySrc || webError,
    imageKey: `${displaySrc ?? 'empty'}-${retryNonce}`,
    handleLoad,
    handleError,
  };
};
