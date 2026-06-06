import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Spinner, Text } from 'folds';
import { ImageViewer } from './ImageViewer';
import {
  NATIVE_IMAGE_PREVIEW_UPDATE_EVENT,
  emitNativeImagePreviewAction,
  emitNativeImagePreviewReady,
  getNativeImagePreviewId,
  type NativeImagePreviewPayload,
} from '../../utils/nativeImagePreview';
import { ScreenSizeProvider, useScreenSize } from '../../hooks/useScreenSize';

type EventPayload<T> = {
  payload: T;
};

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

function NativeImagePreviewWindowContent() {
  const previewId = getNativeImagePreviewId();
  const closeEmittedRef = useRef(false);
  const [payload, setPayload] = useState<NativeImagePreviewPayload>();
  const [maximized, setMaximized] = useState(false);

  const emitCloseAction = useCallback(() => {
    if (!previewId || closeEmittedRef.current) return;
    closeEmittedRef.current = true;
    void emitNativeImagePreviewAction({ previewId, type: 'close' }).catch(() => undefined);
  }, [previewId]);

  const handleClose = useCallback(() => {
    emitCloseAction();
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().close())
      .catch(() => {
        window.close();
      });
  }, [emitCloseAction]);

  const handleMinimize = useCallback(() => {
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().minimize())
      .catch(() => undefined);
  }, []);

  const handleToggleMaximized = useCallback(() => {
    import('@tauri-apps/api/window')
      .then(async ({ getCurrentWindow }) => {
        await getCurrentWindow().toggleMaximize();
        setMaximized((current) => !current);
      })
      .catch(() => undefined);
  }, []);

  const handleWindowDragStart = useCallback<React.PointerEventHandler<HTMLElement>>((evt) => {
    if (maximized) return;
    if (isInteractiveDragTarget(evt.target)) return;
    if (evt.pointerType === 'mouse' && evt.button !== 0) return;

    evt.preventDefault();
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
      .catch(() => undefined);
  }, [maximized]);

  useEffect(() => {
    if (!previewId) return undefined;

    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen(
          NATIVE_IMAGE_PREVIEW_UPDATE_EVENT,
          (event: EventPayload<NativeImagePreviewPayload>) => {
            if (event.payload?.previewId !== previewId) return;
            setPayload(event.payload);
          }
        )
      )
      .then((nextUnlisten) => {
        unlisten = nextUnlisten;
        void emitNativeImagePreviewReady(previewId).catch(() => undefined);
      })
      .catch(() => undefined);

    return () => {
      unlisten?.();
    };
  }, [previewId]);

  useEffect(() => {
    window.addEventListener('pagehide', emitCloseAction);
    return () => window.removeEventListener('pagehide', emitCloseAction);
  }, [emitCloseAction]);

  useEffect(() => {
    const handleKeyDown = (evt: KeyboardEvent) => {
      if (evt.key !== 'Escape' || isEditableEventTarget(evt.target)) return;
      evt.preventDefault();
      handleClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  if (!previewId) {
    return (
      <Box grow="Yes" alignItems="Center" justifyContent="Center">
        <Text>Image preview is missing its window id.</Text>
      </Box>
    );
  }

  if (!payload) {
    return (
      <Box
        style={{
          width: '100vw',
          height: '100vh',
          background: 'rgba(248, 250, 252, 0.78)',
        }}
        alignItems="Center"
        justifyContent="Center"
        direction="Column"
        gap="200"
      >
        <Spinner variant="Secondary" />
        <Text size="T200" priority="300">
          {'\u56fe\u7247\u6b63\u5728\u6253\u5f00...'}
        </Text>
      </Box>
    );
  }

  return (
    <Box style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <ImageViewer
        src={payload.src}
        alt={payload.alt}
        loading={payload.loading}
        requestClose={handleClose}
        canPrev={payload.canPrev}
        canNext={payload.canNext}
        onPrev={
          payload.canPrev
            ? () => {
                void emitNativeImagePreviewAction({ previewId, type: 'prev' });
              }
            : undefined
        }
        onNext={
          payload.canNext
            ? () => {
                void emitNativeImagePreviewAction({ previewId, type: 'next' });
              }
            : undefined
        }
        onMinimize={handleMinimize}
        maximized={maximized}
        onToggleMaximized={handleToggleMaximized}
        onWindowDragStart={!maximized ? handleWindowDragStart : undefined}
      />
    </Box>
  );
}

export function NativeImagePreviewWindow() {
  const screenSize = useScreenSize();

  return (
    <ScreenSizeProvider value={screenSize}>
      <NativeImagePreviewWindowContent />
    </ScreenSizeProvider>
  );
}
