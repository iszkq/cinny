import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getCachedMediaObjectUrl,
  invalidateCachedMediaUrl,
  primeCachedMediaObjectUrl,
  subscribeCachedMediaObjectUrl,
} from '../../utils/mediaUrlCache';
import { primeDesktopMediaAssetUrl } from '../../utils/desktopMediaAssetCache';
import { isDesktopUpdaterSupported } from '../../utils/desktopUpdater';
import { releaseObjectUrl, retainObjectUrl } from '../../utils/objectUrlRetainer';
import { shouldUseObjectUrlForMediaDisplay } from '../../utils/matrix';
import { mobileOrTablet } from '../../utils/user-agent';
import { isAndroidApp } from '../../utils/nativePlatform';

type MediaCandidate = {
  source: string;
  displayUrl: string;
};

type UseStableMediaUrlOptions = {
  autoRetry?: boolean;
  disableObjectUrlCache?: boolean;
  mimeType?: string;
  fallbackMimeType?: string;
  preferObjectUrl?: boolean;
  requireObjectUrl?: boolean;
};

const PREFERRED_OBJECT_URL_WAIT_MS = 700;
const retryDelays = [1_500, 5_000, 15_000];

const buildMediaCandidates = (
  options: {
    allowBrowserObjectUrlCache: boolean;
    allowDirectSource: boolean;
  },
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

    if (options.allowBrowserObjectUrlCache) {
      const cachedUrl = getCachedMediaObjectUrl(source);
      if (cachedUrl && !seenDisplayUrls.has(cachedUrl)) {
        candidates.push({ source, displayUrl: cachedUrl });
        seenDisplayUrls.add(cachedUrl);
      }
    }

    if (options.allowDirectSource && !seenDisplayUrls.has(source)) {
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
  const autoRetry = options.autoRetry ?? false;
  const disableObjectUrlCache = options.disableObjectUrlCache ?? false;
  const mobileDevice = mobileOrTablet();
  const preferObjectUrl =
    options.preferObjectUrl ??
    (mobileDevice ||
      shouldUseObjectUrlForMediaDisplay(src) ||
      shouldUseObjectUrlForMediaDisplay(fallbackSrc));
  const requireObjectUrl =
    options.requireObjectUrl ??
    (isAndroidApp() &&
      (shouldUseObjectUrlForMediaDisplay(src) || shouldUseObjectUrlForMediaDisplay(fallbackSrc)));
  const deferFallbackPreparation = requireObjectUrl && isAndroidApp();
  const desktopSupported = isDesktopUpdaterSupported();
  const objectUrlCacheEnabled = preferObjectUrl && !disableObjectUrlCache;
  const shouldWaitForPreparedMedia =
    preferObjectUrl && Boolean(src || fallbackSrc) && (desktopSupported || mobileDevice);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [desktopSrc, setDesktopSrc] = useState<string | undefined>();
  const [desktopFallbackSrc, setDesktopFallbackSrc] = useState<string | undefined>();
  const [loadedDisplayUrl, setLoadedDisplayUrl] = useState<string | undefined>();
  const [preparedMediaReady, setPreparedMediaReady] = useState(!shouldWaitForPreparedMedia);
  const fallbackAttemptedRef = useRef(false);
  const autoRetryAttemptRef = useRef(0);

  useEffect(() => {
    autoRetryAttemptRef.current = 0;
  }, [fallbackSrc, src]);

  const candidates = useMemo(
    () =>
      buildMediaCandidates(
        {
          allowBrowserObjectUrlCache: objectUrlCacheEnabled,
          allowDirectSource: !requireObjectUrl,
        },
        desktopSrc,
        src,
        desktopFallbackSrc,
        fallbackSrc
      ),
    // The media cache mutates outside React. cacheVersion is the explicit invalidation signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      cacheVersion,
      desktopFallbackSrc,
      desktopSrc,
      fallbackSrc,
      objectUrlCacheEnabled,
      requireObjectUrl,
      src,
    ]
  );

  const hasPreparedCandidate =
    Boolean(desktopSrc || desktopFallbackSrc) ||
    candidates.some((candidate) => candidate.displayUrl !== candidate.source);
  const waitingForPreparedMedia =
    shouldWaitForPreparedMedia && !hasPreparedCandidate && !preparedMediaReady;
  const activeCandidates = waitingForPreparedMedia ? [] : candidates;

  useEffect(() => {
    setCandidateIndex(0);
    setDesktopSrc(undefined);
    setDesktopFallbackSrc(undefined);
    setLoadedDisplayUrl(undefined);
    setPreparedMediaReady(!shouldWaitForPreparedMedia);
    fallbackAttemptedRef.current = false;
  }, [fallbackSrc, shouldWaitForPreparedMedia, src]);

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
    if (!desktopSupported || (!desktopSrc && !desktopFallbackSrc)) {
      return;
    }

    setCandidateIndex(0);
  }, [desktopFallbackSrc, desktopSrc, desktopSupported]);

  useEffect(() => {
    if (!objectUrlCacheEnabled) {
      return undefined;
    }

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
      void primeCachedMediaObjectUrl(src, 'visible');
    }
    if (!deferFallbackPreparation && fallbackSrc && fallbackSrc !== src) {
      void primeCachedMediaObjectUrl(fallbackSrc, 'background');
    }

    return () => {
      unsubscribeList.forEach((unsubscribe) => unsubscribe());
    };
  }, [deferFallbackPreparation, desktopSupported, fallbackSrc, objectUrlCacheEnabled, src]);

  useEffect(() => {
    if (!shouldWaitForPreparedMedia) {
      return undefined;
    }

    let disposed = false;
    // Authenticated Android media has no safe direct <img> fallback. Do not manufacture a Retry
    // state while the bounded browser/native request is still running; wait for the real result.
    const timeoutId = requireObjectUrl
      ? undefined
      : setTimeout(() => {
          if (!disposed) {
            setPreparedMediaReady(true);
          }
        }, PREFERRED_OBJECT_URL_WAIT_MS);

    const preparePreferredUrl = async () => {
      if (desktopSupported) {
        await Promise.all([
          src ? primeDesktopMediaAssetUrl(src, 'visible', options.mimeType) : undefined,
          fallbackSrc && fallbackSrc !== src
            ? primeDesktopMediaAssetUrl(
                fallbackSrc,
                'background',
                options.fallbackMimeType ?? options.mimeType
              )
            : undefined,
        ]).catch(() => undefined);
      } else {
        const primaryObjectUrl = src
          ? await primeCachedMediaObjectUrl(src, 'visible')?.catch(() => undefined)
          : undefined;
        if ((!src || !primaryObjectUrl) && fallbackSrc && fallbackSrc !== src) {
          await primeCachedMediaObjectUrl(fallbackSrc, 'visible')?.catch(() => undefined);
        } else if (!deferFallbackPreparation && fallbackSrc && fallbackSrc !== src) {
          await primeCachedMediaObjectUrl(fallbackSrc, 'background')?.catch(() => undefined);
        }
      }

      if (disposed) {
        return;
      }

      if (timeoutId !== undefined) clearTimeout(timeoutId);
      setPreparedMediaReady(true);
      setCacheVersion((prev) => prev + 1);
    };

    void preparePreferredUrl();

    return () => {
      disposed = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [
    desktopSupported,
    deferFallbackPreparation,
    fallbackSrc,
    options.fallbackMimeType,
    options.mimeType,
    requireObjectUrl,
    shouldWaitForPreparedMedia,
    src,
  ]);

  const activeCandidate = activeCandidates[candidateIndex];
  const displayUrl = loadedDisplayUrl ?? activeCandidate?.displayUrl;
  const hasFailed =
    !loadedDisplayUrl &&
    !waitingForPreparedMedia &&
    (activeCandidates.length === 0 || candidateIndex >= activeCandidates.length);
  const requestKey = `${candidateIndex}-${cacheVersion}-${displayUrl ?? 'empty'}`;
  const isLoaded = Boolean(loadedDisplayUrl && loadedDisplayUrl === displayUrl);

  useEffect(() => {
    retainObjectUrl(displayUrl);

    return () => {
      releaseObjectUrl(displayUrl);
    };
  }, [displayUrl]);

  const handleLoad = useCallback(() => {
    autoRetryAttemptRef.current = 0;
    setLoadedDisplayUrl((prev) => prev ?? activeCandidate?.displayUrl);
  }, [activeCandidate]);

  const handleError = useCallback(() => {
    if (loadedDisplayUrl) {
      return;
    }

    if (
      requireObjectUrl &&
      activeCandidate?.source === src &&
      fallbackSrc &&
      fallbackSrc !== src &&
      !fallbackAttemptedRef.current
    ) {
      fallbackAttemptedRef.current = true;
      setPreparedMediaReady(false);
      invalidateCachedMediaUrl(src)
        .then(() => primeCachedMediaObjectUrl(fallbackSrc, 'visible', true))
        .catch(() => undefined)
        .finally(() => {
          setPreparedMediaReady(true);
          setCandidateIndex(0);
          setCacheVersion((prev) => prev + 1);
        });
      return;
    }

    setCandidateIndex((currentIndex) => Math.min(currentIndex + 1, activeCandidates.length));
  }, [
    activeCandidate,
    activeCandidates.length,
    fallbackSrc,
    loadedDisplayUrl,
    requireObjectUrl,
    src,
  ]);

  const retry = useCallback(() => {
    setLoadedDisplayUrl(undefined);
    setCandidateIndex(0);
    setPreparedMediaReady(!shouldWaitForPreparedMedia);
    fallbackAttemptedRef.current = false;

    if (!objectUrlCacheEnabled) {
      setCacheVersion((prev) => prev + 1);
      return;
    }

    const sources = Array.from(new Set([src, fallbackSrc].filter(Boolean) as string[]));
    Promise.all(sources.map((source) => invalidateCachedMediaUrl(source)))
      .then(() =>
        Promise.all(
          sources.map((source, index) =>
            primeCachedMediaObjectUrl(source, index === 0 ? 'visible' : 'background', true)
          )
        )
      )
      .catch(() => undefined)
      .finally(() => {
        setPreparedMediaReady(true);
        setCacheVersion((prev) => prev + 1);
      });
  }, [fallbackSrc, objectUrlCacheEnabled, shouldWaitForPreparedMedia, src]);

  useEffect(() => {
    if (!isAndroidApp() || !hasFailed) return undefined;

    const handleOnline = () => retry();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [hasFailed, retry]);

  useEffect(() => {
    if (!autoRetry || !isAndroidApp() || !hasFailed) return undefined;

    const retryDelay = retryDelays[autoRetryAttemptRef.current];
    if (retryDelay === undefined) return undefined;

    autoRetryAttemptRef.current += 1;
    const timeoutId = window.setTimeout(retry, retryDelay);
    return () => window.clearTimeout(timeoutId);
  }, [autoRetry, hasFailed, retry]);

  return {
    displayUrl,
    hasFailed,
    isLoaded,
    requestKey,
    handleLoad,
    handleError,
    retry,
  };
};
