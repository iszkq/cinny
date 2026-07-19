import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import { imageViewerSessionAtom } from '../../state/imageViewer';
import { ImageViewerDialog } from './ImageViewerDialog';

export function GlobalImageViewer() {
  const [session, setSession] = useAtom(imageViewerSessionAtom);
  const [activeItemId, setActiveItemId] = useState<string>();
  const [sourceCache, setSourceCache] = useState<Record<string, string>>({});
  const [loadingItemId, setLoadingItemId] = useState<string>();

  useEffect(
    () => () => {
      setSession(undefined);
    },
    [setSession]
  );

  useEffect(() => {
    setActiveItemId(session?.activeItemId);
    setSourceCache({});
    setLoadingItemId(undefined);
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
    session
      .resolveSource(activeItem)
      .then((src) => {
        if (disposed) return;
        setSourceCache((cache) => ({ ...cache, [activeItem.id]: src }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!disposed) {
          setLoadingItemId((itemId) => (itemId === activeItem.id ? undefined : itemId));
        }
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
      src={src}
      alt={activeItem.body}
      loading={loadingItemId === activeItem.id}
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
