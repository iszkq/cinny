import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCachedMediaUrls } from './useCachedMediaUrl';
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
  const { desktopUrl, objectUrl } = useCachedMediaUrls(mediaSrc);
  const directUrl = shouldUseObjectUrlForMediaDisplay(mediaSrc) ? undefined : mediaSrc;
  const candidates = useMemo(
    () =>
      Array.from(
        new Set(
          [
            desktopUrl,
            objectUrl,
            directUrl,
            // Cross-origin authenticated media is fetched into an object URL when possible.
            // Keep direct URLs as a final fallback for homeservers whose public media works in
            // <img> but whose CORS policy blocks JavaScript fetches.
            mediaSrc,
            // Animated avatars prefer the original download URL. The original Matrix thumbnail
            // must remain available so one failed original request cannot hide every avatar.
            src,
          ].filter(Boolean) as string[]
        )
      ),
    [desktopUrl, directUrl, mediaSrc, objectUrl, src]
  );
  const candidateKey = useMemo(() => candidates.join('\n'), [candidates]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const [showFallback, setShowFallback] = useState(false);
  const retriedSrcRef = useRef<string>();
  const retryTimerRef = useRef<number>();

  const displaySrc = candidates[candidateIndex];

  useEffect(() => {
    retryTimerRef.current = clearTimer(retryTimerRef.current);
    setCandidateIndex(0);
    setRetryNonce(0);
    setShowFallback(false);
    retriedSrcRef.current = undefined;
  }, [candidateKey]);

  useEffect(
    () => () => {
      retryTimerRef.current = clearTimer(retryTimerRef.current);
    },
    []
  );

  const handleLoad = useCallback(() => {
    retryTimerRef.current = clearTimer(retryTimerRef.current);
    setShowFallback(false);
    if (displaySrc) {
      retriedSrcRef.current = undefined;
    }
  }, [displaySrc]);

  const handleError = useCallback(() => {
    retryTimerRef.current = clearTimer(retryTimerRef.current);

    if (candidateIndex + 1 < candidates.length) {
      setShowFallback(false);
      setCandidateIndex((value) => Math.min(value + 1, candidates.length - 1));
      return;
    }

    if (displaySrc && retriedSrcRef.current !== displaySrc) {
      retriedSrcRef.current = displaySrc;
      setShowFallback(false);
      retryTimerRef.current = window.setTimeout(() => {
        if (mediaSrc) {
          invalidateCachedMediaUrl(mediaSrc).then(() => {
            primeCachedMediaObjectUrl(mediaSrc, 'visible', true);
            setRetryNonce((value) => value + 1);
          });
        } else {
          setRetryNonce((value) => value + 1);
        }
      }, AVATAR_RETRY_DELAY_MS);
      return;
    }

    setShowFallback(true);
  }, [candidateIndex, candidates.length, displaySrc, mediaSrc]);

  return {
    displaySrc,
    showFallback: !displaySrc || showFallback,
    imageKey: `${displaySrc ?? 'empty'}-${retryNonce}`,
    handleLoad,
    handleError,
  };
};
