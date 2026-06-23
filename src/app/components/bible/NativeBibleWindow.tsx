import React, { useCallback, useEffect, useRef } from 'react';
import { Box } from 'folds';
import { ScreenSizeProvider, useScreenSize } from '../../hooks/useScreenSize';
import { BibleExperienceModal } from '../../features/bible/BibleExperienceModal';
import { emitNativeBibleWindowClose } from '../../utils/nativeBibleWindow';

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
      <BibleExperienceModal open requestClose={handleClose} />
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
