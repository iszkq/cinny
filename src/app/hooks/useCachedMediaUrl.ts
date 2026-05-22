import { useEffect, useState } from 'react';
import {
  getCachedMediaObjectUrl,
  primeCachedMediaObjectUrl,
  subscribeCachedMediaObjectUrl,
} from '../utils/mediaUrlCache';
import {
  getCachedDesktopMediaAssetUrl,
  primeDesktopMediaAssetUrl,
} from '../utils/desktopMediaAssetCache';
import { isDesktopUpdaterSupported } from '../utils/desktopUpdater';
import { releaseObjectUrl, retainObjectUrl } from '../utils/objectUrlRetainer';

type CachedMediaState = {
  src: string | undefined;
  url: string | undefined;
};

const DESKTOP_MEDIA_RETRY_DELAY_MS = 250;
const DESKTOP_OBJECT_URL_FALLBACK_DELAY_MS = 350;

const getCachedMediaState = (src: string | undefined): CachedMediaState => ({
  src,
  url: getCachedMediaObjectUrl(src),
});

export const useCachedMediaUrls = (
  src: string | undefined
): { desktopUrl: string | undefined; objectUrl: string | undefined } => {
  const desktopSupported = isDesktopUpdaterSupported();
  const [cachedState, setCachedState] = useState<CachedMediaState>(() =>
    getCachedMediaState(src)
  );
  const [desktopUrl, setDesktopUrl] = useState<string | undefined>(() =>
    desktopSupported ? getCachedDesktopMediaAssetUrl(src) : undefined
  );

  useEffect(() => {
    setCachedState(getCachedMediaState(src));

    if (!src) {
      return undefined;
    }

    const unsubscribe = subscribeCachedMediaObjectUrl(src, (objectUrl) => {
      setCachedState((prevState) => {
        if (prevState.src === src && prevState.url && objectUrl === undefined) {
          return prevState;
        }

        if (prevState.src === src && prevState.url === objectUrl) {
          return prevState;
        }

        return {
          src,
          url: objectUrl,
        };
      });
    });

    let fallbackTimer: number | undefined;
    const primeObjectUrl = () => {
      void primeCachedMediaObjectUrl(src, desktopSupported ? 'background' : 'visible');
    };

    if (desktopSupported) {
      fallbackTimer = window.setTimeout(primeObjectUrl, DESKTOP_OBJECT_URL_FALLBACK_DELAY_MS);
    } else {
      primeObjectUrl();
    }

    return () => {
      if (typeof fallbackTimer === 'number') {
        window.clearTimeout(fallbackTimer);
      }
      unsubscribe();
    };
  }, [desktopSupported, src]);

  useEffect(() => {
    setDesktopUrl(desktopSupported ? getCachedDesktopMediaAssetUrl(src) : undefined);

    if (!src || !desktopSupported) {
      return undefined;
    }

    let disposed = false;
    let retried = false;
    let retryTimer: number | undefined;

    const loadDesktopUrl = () => {
      const desktopAssetPromise = primeDesktopMediaAssetUrl(src, 'visible');
      if (!desktopAssetPromise) {
        return;
      }

      void desktopAssetPromise.then((assetUrl) => {
        if (disposed) {
          return;
        }

        if (assetUrl || retried) {
          setDesktopUrl(assetUrl);
          return;
        }

        retried = true;
        retryTimer = window.setTimeout(() => {
          retryTimer = undefined;
          if (!disposed) {
            loadDesktopUrl();
          }
        }, DESKTOP_MEDIA_RETRY_DELAY_MS);
      });
    };

    loadDesktopUrl();

    return () => {
      disposed = true;
      if (typeof retryTimer === 'number') {
        window.clearTimeout(retryTimer);
      }
    };
  }, [desktopSupported, src]);

  useEffect(() => {
    const retainedUrl = cachedState.src === src ? cachedState.url : undefined;
    retainObjectUrl(retainedUrl);

    return () => {
      releaseObjectUrl(retainedUrl);
    };
  }, [cachedState.src, cachedState.url, src]);

  useEffect(() => {
    retainObjectUrl(desktopUrl);

    return () => {
      releaseObjectUrl(desktopUrl);
    };
  }, [desktopUrl]);

  return {
    desktopUrl,
    objectUrl: cachedState.src === src ? cachedState.url : undefined,
  };
};

export const useCachedMediaUrl = (src: string | undefined): string | undefined => {
  const { desktopUrl, objectUrl } = useCachedMediaUrls(src);
  return desktopUrl ?? objectUrl;
};
