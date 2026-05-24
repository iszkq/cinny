import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getCachedMediaObjectUrl,
  primeCachedMediaObjectUrl,
  subscribeCachedMediaObjectUrl,
} from '../../utils/mediaUrlCache';
import { primeDesktopMediaAssetUrl } from '../../utils/desktopMediaAssetCache';
import { isDesktopUpdaterSupported } from '../../utils/desktopUpdater';
import { releaseObjectUrl, retainObjectUrl } from '../../utils/objectUrlRetainer';
import { shouldUseObjectUrlForMediaDisplay } from '../../utils/matrix';

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

const PREFERRED_OBJECT_URL_WAIT_MS = 700;

const buildMediaCandidates = (
  options: {
    allowBrowserObjectUrlCache: boolean;
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
  const disableObjectUrlCache = options.disableObjectUrlCache ?? false;
  const preferObjectUrl =
    options.preferObjectUrl ??
    (shouldUseObjectUrlForMediaDisplay(src) ||
      shouldUseObjectUrlForMediaDisplay(fallbackSrc));
  const desktopSupported = isDesktopUpdaterSupported();
  const objectUrlCacheEnabled = preferObjectUrl && !disableObjectUrlCache;
  const shouldWaitForPreparedMedia =
    preferObjectUrl &&
    Boolean(src || fallbackSrc) &&
    desktopSupported;
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [desktopSrc, setDesktopSrc] = useState<string | undefined>();
  const [desktopFallbackSrc, setDesktopFallbackSrc] = useState<string | undefined>();
  const [loadedDisplayUrl, setLoadedDisplayUrl] = useState<string | undefined>();
  const [preparedMediaReady, setPreparedMediaReady] = useState(!shouldWaitForPreparedMedia);

  const candidates = useMemo(
    () =>
      buildMediaCandidates(
        { allowBrowserObjectUrlCache: objectUrlCacheEnabled },
        desktopSrc,
        src,
        desktopFallbackSrc,
        fallbackSrc
      ),
    [
      cacheVersion,
      desktopFallbackSrc,
      desktopSrc,
      fallbackSrc,
      objectUrlCacheEnabled,
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

    if (desktopSupported) {
      if (src) {
        void primeCachedMediaObjectUrl(src, 'visible');
      }
      if (fallbackSrc && fallbackSrc !== src) {
        void primeCachedMediaObjectUrl(fallbackSrc, 'background');
      }
    }

    return () => {
      unsubscribeList.forEach((unsubscribe) => unsubscribe());
    };
  }, [desktopSupported, fallbackSrc, objectUrlCacheEnabled, src]);

  useEffect(() => {
    if (!shouldWaitForPreparedMedia) {
      return undefined;
    }

    let disposed = false;
    const timeoutId = setTimeout(() => {
      if (!disposed) {
        setPreparedMediaReady(true);
      }
    }, PREFERRED_OBJECT_URL_WAIT_MS);

    const preparePreferredUrl = async () => {
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

      if (disposed) {
        return;
      }

      clearTimeout(timeoutId);
      setPreparedMediaReady(true);
      setCacheVersion((prev) => prev + 1);
    };

    void preparePreferredUrl();

    return () => {
      disposed = true;
      clearTimeout(timeoutId);
    };
  }, [
    desktopSupported,
    fallbackSrc,
    options.fallbackMimeType,
    options.mimeType,
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
    setLoadedDisplayUrl((prev) => prev ?? activeCandidate?.displayUrl);
  }, [activeCandidate]);

  const handleError = useCallback(() => {
    if (loadedDisplayUrl) {
      return;
    }

    setCandidateIndex((currentIndex) => Math.min(currentIndex + 1, activeCandidates.length));
  }, [activeCandidates.length, loadedDisplayUrl]);

  return {
    displayUrl,
    hasFailed,
    isLoaded,
    requestKey,
    handleLoad,
    handleError,
  };
};
