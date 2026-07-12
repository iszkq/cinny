import React, { Suspense, lazy, useCallback, useEffect, useRef } from 'react';
import { Box } from 'folds';
import { ScreenSize, ScreenSizeProvider } from '../../hooks/useScreenSize';
import { emitNativeBibleWindowClose } from '../../utils/nativeBibleWindow';

const LazyBibleExperienceModal = lazy(async () => ({
  default: (await import('../../features/bible/BibleExperienceModal')).BibleExperienceModal,
}));

const isEditableEventTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(target.closest('input, textarea, [contenteditable="true"]'));
};

const closeCurrentNativeWindow = async (): Promise<void> => {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const currentWindow = getCurrentWindow();

  await currentWindow.destroy().catch(async () => {
    await currentWindow.close().catch(() => {
      window.close();
    });
  });
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
    emitNativeBibleWindowClose().catch(() => undefined);
  }, []);

  const handleClose = useCallback(() => {
    emitClose();
    closeCurrentNativeWindow().catch(() => undefined);
  }, [emitClose]);

  useEffect(() => {
    window.addEventListener('pagehide', emitClose);
    return () => window.removeEventListener('pagehide', emitClose);
  }, [emitClose]);

  useEffect(() => {
    const { background: htmlBackground } = document.documentElement.style;
    const { background: bodyBackground } = document.body.style;
    const root = document.getElementById('root');
    const rootBackground = root?.style.background;

    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    if (root) root.style.background = 'transparent';

    return () => {
      document.documentElement.style.background = htmlBackground;
      document.body.style.background = bodyBackground;
      if (root) root.style.background = rootBackground ?? '';
    };
  }, []);

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
    <Box style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: 'transparent' }}>
      <Suspense fallback={<BibleWindowFallback />}>
        <LazyBibleExperienceModal open requestClose={handleClose} />
      </Suspense>
    </Box>
  );
}

export function NativeBibleWindow() {
  return (
    <ScreenSizeProvider value={ScreenSize.Desktop}>
      <NativeBibleWindowContent />
    </ScreenSizeProvider>
  );
}
