import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getCachedMediaObjectUrl,
  getPreparedMediaUrl,
  primeCachedMediaObjectUrl,
  subscribeCachedMediaObjectUrl,
} from '../../../utils/mediaUrlCache';
import { primeDesktopMediaAssetUrl } from '../../../utils/desktopMediaAssetCache';
import { isDesktopUpdaterSupported } from '../../../utils/desktopUpdater';
import { releaseObjectUrl, retainObjectUrl } from '../../../utils/objectUrlRetainer';

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

const MAX_MEDIA_RETRY_COUNT = 12;
const MEDIA_RETRY_BASE_DELAY_MS = 250;
const MEDIA_RETRY_MAX_DELAY_MS = 1200;
const PREFERRED_OBJECT_URL_WAIT_MS = 700;

const buildMediaCandidates = (
  options: UseStableMediaUrlOptions,
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

    if (!options.disableObjectUrlCache) {
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
  const preferObjectUrl = options.preferObjectUrl ?? false;
  const desktopSupported = isDesktopUpdaterSupported();
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [desktopSrc, setDesktopSrc] = useState<string | undefined>();
  const [desktopFallbackSrc, setDesktopFallbackSrc] = useState<string | undefined>();
  const [loadedDisplayUrl, setLoadedDisplayUrl] = useState<string | undefined>();
  const [retryCount, setRetryCount] = useState(0);
  const [preferredObjectUrlReady, setPreferredObjectUrlReady] = useState(
    !preferObjectUrl || disableObjectUrlCache
  );

  const candidates = useMemo(
    () =>
      buildMediaCandidates(
        { disableObjectUrlCache, preferObjectUrl: options.preferObjectUrl },
        desktopSrc,
        src,
        desktopFallbackSrc,
        fallbackSrc
      ),
    [
      cacheVersion,
      desktopFallbackSrc,
      desktopSrc,
      disableObjectUrlCache,
      fallbackSrc,
      options.preferObjectUrl,
      src,
    ]
  );

  const hasObjectUrlCandidate = candidates.some(
    (candidate) => candidate.displayUrl !== candidate.source
  );
  const waitingForPreferredObjectUrl =
    preferObjectUrl &&
    !disableObjectUrlCache &&
    !hasObjectUrlCandidate &&
    !preferredObjectUrlReady &&
    Boolean(src || fallbackSrc);
  const activeCandidates = waitingForPreferredObjectUrl ? [] : candidates;

  useEffect(() => {
    setCandidateIndex(0);
    setDesktopSrc(undefined);
    setDesktopFallbackSrc(undefined);
    setLoadedDisplayUrl(undefined);
    setRetryCount(0);
    setPreferredObjectUrlReady(!preferObjectUrl || disableObjectUrlCache || (!src && !fallbackSrc));
  }, [disableObjectUrlCache, fallbackSrc, preferObjectUrl, src]);

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
    if (disableObjectUrlCache) {
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
      void primeCachedMediaObjectUrl(src);
    }
    if (fallbackSrc && fallbackSrc !== src) {
      void primeCachedMediaObjectUrl(fallbackSrc);
    }

    return () => {
      unsubscribeList.forEach((unsubscribe) => unsubscribe());
    };
  }, [disableObjectUrlCache, src, fallbackSrc]);

  useEffect(() => {
    if (!preferObjectUrl || disableObjectUrlCache || (!src && !fallbackSrc)) {
      return undefined;
    }

    let disposed = false;

    const preparePreferredUrl = async () => {
      await Promise.all([
        getPreparedMediaUrl(src, 'visible', PREFERRED_OBJECT_URL_WAIT_MS),
        fallbackSrc && fallbackSrc !== src
          ? getPreparedMediaUrl(fallbackSrc, 'background', PREFERRED_OBJECT_URL_WAIT_MS)
          : undefined,
      ]).catch(() => undefined);

      if (disposed) {
        return;
      }

      setPreferredObjectUrlReady(true);
      setCacheVersion((prev) => prev + 1);
    };

    void preparePreferredUrl();

    return () => {
      disposed = true;
    };
  }, [disableObjectUrlCache, fallbackSrc, preferObjectUrl, src]);

  const activeCandidate = activeCandidates[candidateIndex];
  const displayUrl = loadedDisplayUrl ?? activeCandidate?.displayUrl;
  const hasFailed =
    !loadedDisplayUrl &&
    !waitingForPreferredObjectUrl &&
    (activeCandidates.length === 0 || candidateIndex >= activeCandidates.length);
  const requestKey = `${candidateIndex}-${cacheVersion}-${retryCount}-${displayUrl ?? 'empty'}`;
  const isLoaded = Boolean(loadedDisplayUrl && loadedDisplayUrl === displayUrl);

  useEffect(() => {
    retainObjectUrl(displayUrl);

    return () => {
      releaseObjectUrl(displayUrl);
    };
  }, [displayUrl]);

  useEffect(() => {
    if (!hasFailed || loadedDisplayUrl || retryCount >= MAX_MEDIA_RETRY_COUNT) {
      return undefined;
    }

    const retryTimer = window.setTimeout(() => {
      setRetryCount((prev) => prev + 1);
      setCacheVersion((prev) => prev + 1);
      setCandidateIndex(0);

      if (!disableObjectUrlCache && src) {
        void primeCachedMediaObjectUrl(src);
      }
      if (!disableObjectUrlCache && fallbackSrc && fallbackSrc !== src) {
        void primeCachedMediaObjectUrl(fallbackSrc);
      }
      if (desktopSupported && src) {
        void primeDesktopMediaAssetUrl(src, 'visible', options.mimeType);
      }
      if (desktopSupported && fallbackSrc && fallbackSrc !== src) {
        void primeDesktopMediaAssetUrl(
          fallbackSrc,
          'background',
          options.fallbackMimeType ?? options.mimeType
        );
      }
    }, Math.min(MEDIA_RETRY_BASE_DELAY_MS * (retryCount + 1), MEDIA_RETRY_MAX_DELAY_MS));

    return () => {
      window.clearTimeout(retryTimer);
    };
  }, [
    desktopSupported,
    disableObjectUrlCache,
    fallbackSrc,
    hasFailed,
    loadedDisplayUrl,
    options.fallbackMimeType,
    options.mimeType,
    retryCount,
    src,
  ]);

  const handleLoad = useCallback(() => {
    if (
      !disableObjectUrlCache &&
      activeCandidate?.source &&
      /^https?:\/\//i.test(activeCandidate.source)
    ) {
      void primeCachedMediaObjectUrl(activeCandidate.source);
    }
    setLoadedDisplayUrl((prev) => prev ?? activeCandidate?.displayUrl);
  }, [activeCandidate, disableObjectUrlCache]);

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
