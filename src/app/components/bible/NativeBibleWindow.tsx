import React, { Suspense, lazy, useCallback, useEffect, useRef } from 'react';
import { Box } from 'folds';
import { ScreenSizeProvider, useScreenSize } from '../../hooks/useScreenSize';
import { emitNativeBibleWindowClose } from '../../utils/nativeBibleWindow';

const LazyBibleExperienceModal = lazy(async () => ({
  default: (await import('../../features/bible/BibleExperienceModal')).BibleExperienceModal,
}));

const isInteractiveDragTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;

  return Boolean(
    target.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]')
  );
};

const isEditableEventTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(target.closest('input, textarea, [contenteditable="true"]'));
};

const closeCurrentNativeWindow = async (): Promise<void> => {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
    return;
  } catch {
    // Fall through to the webview-window API used by newer Tauri builds.
  }

  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    await getCurrentWebviewWindow().close();
    return;
  } catch {
    window.close();
  }
};

function BibleWindowFallback() {
  return (
    <Box
      alignItems="Center"
      justifyContent="Center"
      style={{ width: '100vw', height: '100vh' }}
      aria-busy="true"
    >
      Loading...
    </Box>
  );
}

function NativeBibleWindowContent() {
  const closeEmittedRef = useRef(false);

  const emitClose = useCallback(() => {
    if (closeEmittedRef.current) return;
    closeEmittedRef.current = true;
    void emitNativeBibleWindowClose().catch(() => undefined);
  }, []);

  const handleClose = useCallback(() => {
    emitClose();
    void closeCurrentNativeWindow();
  }, [emitClose]);

  const handleWindowDragStart = useCallback<React.PointerEventHandler<HTMLElement>>((evt) => {
    if (isInteractiveDragTarget(evt.target)) return;
    if (evt.pointerType === 'mouse' && evt.button !== 0) return;

    evt.preventDefault();
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', emitClose);
    return () => window.removeEventListener('pagehide', emitClose);
  }, [emitClose]);

  useEffect(() => {
    const handleKeyDown = (evt: KeyboardEvent) => {
      if (evt.key !== 'Escape' || isEditableEventTarget(evt.target)) return;
      evt.preventDefault();
      handleClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  return (
    <Box
      style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}
      onPointerDown={handleWindowDragStart}
    >
      <Suspense fallback={<BibleWindowFallback />}>
        <LazyBibleExperienceModal open requestClose={handleClose} />
      </Suspense>
    </Box>
  );
}

export function NativeBibleWindow() {
  const screenSize = useScreenSize();

  return (
    <ScreenSizeProvider value={screenSize}>
      <NativeBibleWindowContent />
    </ScreenSizeProvider>
  );
}
