import React, { Suspense, lazy, useCallback, useEffect, useRef } from 'react';
import { Box } from 'folds';
import { ScreenSizeProvider, useScreenSize } from '../../hooks/useScreenSize';
import { emitNativeBibleWindowClose } from '../../utils/nativeBibleWindow';

const LazyBibleExperienceModal = lazy(async () => ({
  default: (await import('../../features/bible/BibleExperienceModal')).BibleExperienceModal,
}));

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
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().close())
      .catch(() => {
        window.close();
      });
  }, [emitClose]);

  useEffect(() => {
    window.addEventListener('pagehide', emitClose);
    return () => window.removeEventListener('pagehide', emitClose);
  }, [emitClose]);

  return (
    <Box style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
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
