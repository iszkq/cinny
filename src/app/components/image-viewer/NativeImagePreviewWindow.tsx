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
import { ScreenSize, ScreenSizeProvider } from '../../hooks/useScreenSize';

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

const OCR_PANEL_WINDOW_EXTRA_WIDTH_PX = 252;

const closeCurrentNativeWindow = async (): Promise<void> => {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const currentWindow = getCurrentWindow();

  await currentWindow.close().catch(async () => {
    await currentWindow.destroy().catch(() => {
      window.close();
    });
  });

  window.setTimeout(() => {
    currentWindow.destroy().catch(() => undefined);
  }, 240);
};

function NativeImagePreviewWindowContent() {
  const previewId = getNativeImagePreviewId();
  const closeEmittedRef = useRef(false);
  const closingRef = useRef(false);
  const ocrExpandedRef = useRef(false);
  const baseWindowSizeRef = useRef<{ width: number; height: number }>();
  const [payload, setPayload] = useState<NativeImagePreviewPayload>();
  const [maximized, setMaximized] = useState(false);

  const emitCloseAction = useCallback(() => {
    if (!previewId || closeEmittedRef.current) return;
    closeEmittedRef.current = true;
    emitNativeImagePreviewAction({ previewId, type: 'close' }).catch(() => undefined);
  }, [previewId]);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    emitCloseAction();
    closeCurrentNativeWindow().catch(() => undefined);
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

  const handleOcrPanelOpenChange = useCallback(
    (open: boolean) => {
      if (maximized && open) return;

      import('@tauri-apps/api/window')
        .then(async ({ getCurrentWindow }) => {
          const { PhysicalSize } = await import('@tauri-apps/api/dpi');
          const currentWindow = getCurrentWindow();

          if (open) {
            if (ocrExpandedRef.current) return;

            const size = await currentWindow.innerSize();
            baseWindowSizeRef.current = {
              width: size.width,
              height: size.height,
            };
            await currentWindow.setSize(
              new PhysicalSize(size.width + OCR_PANEL_WINDOW_EXTRA_WIDTH_PX, size.height)
            );
            ocrExpandedRef.current = true;
            return;
          }

          const baseSize = baseWindowSizeRef.current;
          if (!ocrExpandedRef.current || !baseSize) return;

          await currentWindow.setSize(new PhysicalSize(baseSize.width, baseSize.height));
          ocrExpandedRef.current = false;
          baseWindowSizeRef.current = undefined;
        })
        .catch(() => undefined);
    },
    [maximized]
  );

  const handleWindowDragStart = useCallback<React.PointerEventHandler<HTMLElement>>(
    (evt) => {
      if (maximized) return;
      if (isInteractiveDragTarget(evt.target)) return;
      if (evt.pointerType === 'mouse' && evt.button !== 0) return;

      evt.preventDefault();
      import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
        .catch(() => undefined);
    },
    [maximized]
  );

  useEffect(() => {
    if (!previewId) return undefined;

    let disposed = false;
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
        if (disposed) {
          nextUnlisten();
          return;
        }
        unlisten = nextUnlisten;
        emitNativeImagePreviewReady(previewId).catch(() => undefined);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
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
        imageOcrConfig={payload.imageOcrConfig}
        onOcrPanelOpenChange={handleOcrPanelOpenChange}
        requestClose={handleClose}
        canPrev={payload.canPrev}
        canNext={payload.canNext}
        onPrev={
          payload.canPrev
            ? () => {
                emitNativeImagePreviewAction({ previewId, type: 'prev' }).catch(() => undefined);
              }
            : undefined
        }
        onNext={
          payload.canNext
            ? () => {
                emitNativeImagePreviewAction({ previewId, type: 'next' }).catch(() => undefined);
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
  return (
    <ScreenSizeProvider value={ScreenSize.Tablet}>
      <NativeImagePreviewWindowContent />
    </ScreenSizeProvider>
  );
}
