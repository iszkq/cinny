import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import { imageViewerSessionAtom } from '../../state/imageViewer';
import { ImageViewerDialog } from './ImageViewerDialog';

const ORIGINAL_SOURCE_TIMEOUT_MS = 28_000;
const ORIGINAL_SOURCE_RETRY_DELAY_MS = 500;

const wait = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });

const resolveSourceWithTimeout = async (resolveSource: () => Promise<string>): Promise<string> => {
  let timeoutId: number | undefined;

  try {
    return await Promise.race([
      resolveSource(),
      new Promise<never>((_resolve, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error('Original image request timed out.')),
          ORIGINAL_SOURCE_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
};

export function GlobalImageViewer() {
  const [session, setSession] = useAtom(imageViewerSessionAtom);
  const [activeItemId, setActiveItemId] = useState<string>();
  const [sourceCache, setSourceCache] = useState<Record<string, string>>({});
  const [loadingItemId, setLoadingItemId] = useState<string>();
  const [failedItemId, setFailedItemId] = useState<string>();
  const [retryVersion, setRetryVersion] = useState(0);
  const [focusRequestKey, setFocusRequestKey] = useState(0);

  useEffect(
    () => () => {
      setSession(undefined);
    },
    [setSession]
  );

  useEffect(() => {
    setActiveItemId(session?.activeItemId);
    setLoadingItemId(undefined);
    setFailedItemId(undefined);
    if (session) {
      setFocusRequestKey((key) => key + 1);
    }
  }, [session]);

  const activeItem = useMemo(() => {
    if (!session) return undefined;
    return (
      session.items.find((item) => item.id === activeItemId) ??
      session.items.find((item) => item.id === session.activeItemId)
    );
  }, [activeItemId, session]);

  useEffect(() => {
    if (!session || !activeItem || sourceCache[activeItem.id]) return undefined;

    let disposed = false;
    setLoadingItemId(activeItem.id);
    setFailedItemId((itemId) => (itemId === activeItem.id ? undefined : itemId));

    const resolveOriginal = async () => {
      try {
        return await resolveSourceWithTimeout(() => session.resolveSource(activeItem));
      } catch {
        await wait(ORIGINAL_SOURCE_RETRY_DELAY_MS);
        return resolveSourceWithTimeout(() => session.resolveSource(activeItem));
      }
    };

    resolveOriginal()
      .then((src) => {
        if (disposed) return;
        setSourceCache((cache) => ({ ...cache, [activeItem.id]: src }));
      })
      .catch(() => {
        if (!disposed) {
          setFailedItemId(activeItem.id);
        }
      })
      .finally(() => {
        if (!disposed) {
          setLoadingItemId((itemId) => (itemId === activeItem.id ? undefined : itemId));
        }
      });

    return () => {
      disposed = true;
    };
  }, [activeItem, retryVersion, session, sourceCache]);

  const requestClose = useCallback(() => setSession(undefined), [setSession]);

  if (!session || !activeItem) return null;

  const activeIndex = session.items.findIndex((item) => item.id === activeItem.id);
  const src = sourceCache[activeItem.id] ?? sourceCache[session.activeItemId] ?? session.initialSrc;
  if (!src) return null;

  return (
    <ImageViewerDialog
      open
      focusRequestKey={focusRequestKey}
      src={src}
      alt={activeItem.body}
      loading={loadingItemId === activeItem.id}
      originalLoadFailed={failedItemId === activeItem.id}
      onRetryOriginal={() => {
        setSourceCache((cache) => {
          const nextCache = { ...cache };
          delete nextCache[activeItem.id];
          return nextCache;
        });
        setFailedItemId(undefined);
        setRetryVersion((version) => version + 1);
      }}
      canPrev={activeIndex > 0}
      canNext={activeIndex >= 0 && activeIndex < session.items.length - 1}
      onPrev={
        activeIndex > 0 ? () => setActiveItemId(session.items[activeIndex - 1].id) : undefined
      }
      onNext={
        activeIndex >= 0 && activeIndex < session.items.length - 1
          ? () => setActiveItemId(session.items[activeIndex + 1].id)
          : undefined
      }
      imageOcrConfig={session.imageOcrConfig}
      requestClose={requestClose}
      renderViewer={session.renderViewer}
    />
  );
}
