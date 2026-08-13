import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCachedMediaUrls } from './useCachedMediaUrl';
import { getOriginalMediaUrl, shouldUseObjectUrlForMediaDisplay } from '../utils/matrix';
import {
  invalidateCachedMediaUrl,
  isCachedMediaObjectUrl,
  primeCachedMediaObjectUrl,
} from '../utils/mediaUrlCache';
import { isAndroidApp } from '../utils/nativePlatform';
import { prepareAndroidMediaAssetUrl } from '../utils/androidMediaAssetCache';

const AVATAR_RETRY_DELAY_MS = 250;
const LOADED_AVATAR_MEDIA_LIMIT = 2048;
const loadedAvatarMedia = new Set<string>();
const androidLoadedAvatarBySource = new Map<string, string>();

const markAvatarMediaLoaded = (src: string) => {
  // Remember successful image URLs across avatar component remounts. Without this, a cached
  // avatar still renders its text fallback for one frame while waiting for a new load event.
  loadedAvatarMedia.delete(src);
  loadedAvatarMedia.add(src);

  if (loadedAvatarMedia.size > LOADED_AVATAR_MEDIA_LIMIT) {
    const oldestSrc = loadedAvatarMedia.values().next().value;
    if (typeof oldestSrc === 'string') loadedAvatarMedia.delete(oldestSrc);
  }
};

const clearTimer = (timer: number | undefined): undefined => {
  if (typeof timer === 'number') {
    window.clearTimeout(timer);
  }
  return undefined;
};

export const useResilientAvatarMedia = (src?: string, preferOriginal = false) => {
  const androidApp = isAndroidApp();
  const mediaSrc = useMemo(
    // Android prioritizes the already-sized homeserver thumbnail. Downloading an avatar's full
    // original on every first encounter made contacts and rooms appear to lose their avatar while
    // a much larger file was fetched. Desktop/web keep the animated-original preference.
    () => (preferOriginal && !androidApp ? getOriginalMediaUrl(src) : src),
    [androidApp, preferOriginal, src]
  );
  const { desktopUrl, objectUrl } = useCachedMediaUrls(mediaSrc);
  const [androidAssetUrl, setAndroidAssetUrl] = useState<string>();
  const directUrl = shouldUseObjectUrlForMediaDisplay(mediaSrc) ? undefined : mediaSrc;
  const rememberedAvatarUrl =
    androidApp && mediaSrc ? androidLoadedAvatarBySource.get(mediaSrc) : undefined;
  const rememberedAndroidUrl =
    rememberedAvatarUrl && isCachedMediaObjectUrl(rememberedAvatarUrl)
      ? rememberedAvatarUrl
      : undefined;

  useEffect(() => {
    let disposed = false;
    setAndroidAssetUrl(undefined);
    if (!androidApp || !mediaSrc) return undefined;

    // A native cache hit is a local file URL and can be painted immediately
    // after process restart. Do not wait for the Blob/ObjectURL queue.
    void prepareAndroidMediaAssetUrl(mediaSrc, undefined, false, true)?.then((url) => {
      if (disposed) return;
      if (url) {
        setAndroidAssetUrl(url);
        return;
      }

      // Browser fetches often paint first, but that cache belongs to WebView
      // and can disappear with its renderer. Always finish one native-file
      // write so the next process starts from Android private storage.
      void prepareAndroidMediaAssetUrl(mediaSrc)?.then((nativeUrl) => {
        if (!disposed && nativeUrl) setAndroidAssetUrl(nativeUrl);
      });
    });
    return () => {
      disposed = true;
    };
  }, [androidApp, mediaSrc]);
  if (rememberedAvatarUrl && !rememberedAndroidUrl && mediaSrc) {
    androidLoadedAvatarBySource.delete(mediaSrc);
  }
  const candidates = useMemo(() => {
    const orderedCandidates = preferOriginal
      ? [
          // Show the Matrix thumbnail immediately. Once the original has been fetched into a
          // safe object/desktop URL, it moves ahead of this thumbnail and animation starts.
          desktopUrl,
          androidAssetUrl,
          objectUrl,
          rememberedAndroidUrl,
          directUrl,
        ]
      : [desktopUrl, androidAssetUrl, objectUrl, rememberedAndroidUrl, directUrl];

    return Array.from(new Set(orderedCandidates.filter(Boolean) as string[]));
  }, [androidAssetUrl, desktopUrl, directUrl, objectUrl, preferOriginal, rememberedAndroidUrl]);
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

  useEffect(() => {
    if (!androidApp || !mediaSrc || objectUrl) return undefined;

    const handleOnline = () => {
      invalidateCachedMediaUrl(mediaSrc).then(() => {
        primeCachedMediaObjectUrl(mediaSrc, 'visible', true);
      });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [androidApp, mediaSrc, objectUrl]);

  const handleLoad = useCallback(() => {
    retryTimerRef.current = clearTimer(retryTimerRef.current);
    setShowFallback(false);
    if (displaySrc) {
      markAvatarMediaLoaded(displaySrc);
      if (androidApp && mediaSrc) {
        androidLoadedAvatarBySource.delete(mediaSrc);
        androidLoadedAvatarBySource.set(mediaSrc, displaySrc);
        if (androidLoadedAvatarBySource.size > LOADED_AVATAR_MEDIA_LIMIT) {
          const oldestSource = androidLoadedAvatarBySource.keys().next().value;
          if (typeof oldestSource === 'string') androidLoadedAvatarBySource.delete(oldestSource);
        }
      }
      retriedSrcRef.current = undefined;
    }
  }, [androidApp, displaySrc, mediaSrc]);

  const handleError = useCallback(() => {
    retryTimerRef.current = clearTimer(retryTimerRef.current);
    if (displaySrc) {
      loadedAvatarMedia.delete(displaySrc);
      if (androidApp && mediaSrc && androidLoadedAvatarBySource.get(mediaSrc) === displaySrc) {
        androidLoadedAvatarBySource.delete(mediaSrc);
      }
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
  }, [androidApp, candidateIndex, candidates.length, displaySrc, mediaSrc]);

  return {
    displaySrc,
    displaySrcLoaded: Boolean(displaySrc && loadedAvatarMedia.has(displaySrc)),
    showFallback: !displaySrc || showFallback,
    imageKey: `${displaySrc ?? 'empty'}-${retryNonce}`,
    handleLoad,
    handleError,
  };
};
