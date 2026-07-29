import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import { imageViewerSessionAtom } from '../../state/imageViewer';
import { ImageViewerDialog } from './ImageViewerDialog';

const ORIGINAL_LOADING_DELAY_MS = 180;
const ORIGINAL_LOADING_MAX_MS = 8_000;

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
    let loadingDelayId: number | undefined;
    let loadingMaxId: number | undefined;
    const hasActivePreview = activeItem.id === session.activeItemId && Boolean(session.initialSrc);

    setLoadingItemId(undefined);
    setFailedItemId((itemId) => (itemId === activeItem.id ? undefined : itemId));

    if (!hasActivePreview) {
      loadingDelayId = window.setTimeout(() => {
        if (!disposed) {
          setLoadingItemId(activeItem.id);
        }
      }, ORIGINAL_LOADING_DELAY_MS);
      loadingMaxId = window.setTimeout(() => {
        if (!disposed) {
          setLoadingItemId((itemId) => (itemId === activeItem.id ? undefined : itemId));
        }
      }, ORIGINAL_LOADING_MAX_MS);
    }

    session
      .resolveSource(activeItem, 'visible')
      .then((src) => {
        if (disposed) return;
        setSourceCache((cache) => ({ ...cache, [activeItem.id]: src }));
        setFailedItemId((itemId) => (itemId === activeItem.id ? undefined : itemId));
      })
      .catch(() => {
        if (!disposed) {
          setFailedItemId(activeItem.id);
        }
      })
      .finally(() => {
        if (loadingDelayId !== undefined) {
          window.clearTimeout(loadingDelayId);
        }
        if (loadingMaxId !== undefined) {
          window.clearTimeout(loadingMaxId);
        }
        if (!disposed) {
          setLoadingItemId((itemId) => (itemId === activeItem.id ? undefined : itemId));
        }
      });

    return () => {
      disposed = true;
      if (loadingDelayId !== undefined) {
        window.clearTimeout(loadingDelayId);
      }
      if (loadingMaxId !== undefined) {
        window.clearTimeout(loadingMaxId);
      }
    };
  }, [activeItem, retryVersion, session, sourceCache]);

  useEffect(() => {
    if (!session || !activeItem || !sourceCache[activeItem.id]) return undefined;

    const activeIndex = session.items.findIndex((item) => item.id === activeItem.id);
    if (activeIndex < 0) return undefined;

    const adjacentItems = [session.items[activeIndex - 1], session.items[activeIndex + 1]].filter(
      (item): item is NonNullable<typeof item> => Boolean(item && !sourceCache[item.id])
    );
    if (adjacentItems.length === 0) return undefined;

    let disposed = false;
    Promise.all(
      adjacentItems.map((item) =>
        session
          .resolveSource(item, 'background')
          .then((src) => ({ id: item.id, src }))
          .catch(() => undefined)
      )
    ).then((resolvedItems) => {
      if (disposed) return;

      const availableItems = resolvedItems.filter((item): item is NonNullable<typeof item> =>
        Boolean(item)
      );
      if (availableItems.length === 0) return;

      setSourceCache((cache) => {
        const nextCache = { ...cache };
        availableItems.forEach((item) => {
          nextCache[item.id] = item.src;
        });
        return nextCache;
      });
    });

    return () => {
      disposed = true;
    };
  }, [activeItem, session, sourceCache]);

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
