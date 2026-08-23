import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FocusTrap from 'focus-trap-react';
import classNames from 'classnames';
import {
  Box,
  Icon,
  IconButton,
  Icons,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
} from 'folds';
import type { ImageViewerProps } from './ImageViewer';
import {
  ImageViewerBackdrop,
  ImageViewerMinimizedButton,
  ImageViewerMinimizedLayer,
  ImageViewerModal,
  ImageViewerWindowLayer,
  ImageViewerWindowMaximized,
  ImageViewerWindowModal,
} from '../../styles/Modal.css';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { stopPropagation } from '../../utils/keyboard';
import { loadImageElement } from '../../utils/dom';
import { getImageViewerModalStyle } from '../../utils/imageViewerModal';
import { isDesktopUpdaterSupported } from '../../utils/desktopUpdater';
import { mobileOrTablet } from '../../utils/user-agent';
import {
  closeNativeImagePreviewWindow,
  createNativeImagePreviewId,
  focusNativeImagePreviewWindow,
  getTransferableImagePreviewSrc,
  listenNativeImagePreviewAction,
  openNativeImagePreviewWindow,
  type NativeImagePreviewPayload,
} from '../../utils/nativeImagePreview';

type ImageViewerDialogProps = Omit<
  ImageViewerProps,
  'maximized' | 'onMinimize' | 'onOcrPanelOpenChange' | 'onToggleMaximized' | 'onWindowDragStart'
> & {
  open: boolean;
  focusRequestKey?: number;
  renderViewer: (props: ImageViewerProps) => ReactNode;
};

type WindowOffset = {
  x: number;
  y: number;
};

type NativePreviewRef = {
  previewId: string;
  label: string;
  updatePayload: (payload: NativeImagePreviewPayload) => Promise<void>;
  unlistenAction: () => void;
  unlistenReady: () => void;
  unlistenDestroyed: () => void;
};

type LatestNativePreviewInput = {
  src: string;
  alt: string;
  loading?: boolean;
  canPrev?: boolean;
  canNext?: boolean;
  imageOcrConfig?: ImageViewerProps['imageOcrConfig'];
  onPrev?: () => void;
  onNext?: () => void;
  requestClose: () => void;
  originalLoadFailed?: boolean;
  onRetryOriginal?: () => void;
};

const WINDOW_EDGE_PADDING_PX = 16;
const OCR_PANEL_MODAL_EXTRA_WIDTH_PX = 252;

const isEditableEventTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(target.closest('input, textarea, [contenteditable="true"]'));
};

const isInteractiveDragTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;

  return Boolean(
    target.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]')
  );
};

const getWindowElement = (): HTMLElement | null =>
  document.querySelector('[data-image-viewer-window="true"]');

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function ImageViewerDialog({
  open,
  src,
  alt,
  loading,
  requestClose,
  focusRequestKey,
  renderViewer,
  ...viewerProps
}: ImageViewerDialogProps) {
  const screenSize = useScreenSizeContext();
  const mobile = mobileOrTablet() || screenSize === ScreenSize.Mobile;
  const desktopNativePreview = isDesktopUpdaterSupported();
  const [imageSize, setImageSize] = useState<{ width?: number; height?: number }>({});
  const [maximized, setMaximized] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [ocrPanelOpen, setOcrPanelOpen] = useState(false);
  const [windowOffset, setWindowOffset] = useState<WindowOffset>({ x: 0, y: 0 });
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const nativePreviewRef = useRef<NativePreviewRef>();
  const [nativePreviewFailed, setNativePreviewFailed] = useState(false);
  const latestNativeInputRef = useRef<LatestNativePreviewInput>({
    src,
    alt,
    loading,
    canPrev: viewerProps.canPrev,
    canNext: viewerProps.canNext,
    imageOcrConfig: viewerProps.imageOcrConfig,
    onPrev: viewerProps.onPrev,
    onNext: viewerProps.onNext,
    requestClose,
    originalLoadFailed: viewerProps.originalLoadFailed,
    onRetryOriginal: viewerProps.onRetryOriginal,
  });
  const [nativePreviewActive, setNativePreviewActive] = useState(false);

  const clearDragListeners = useCallback(() => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
  }, []);

  const closeNativePreview = useCallback((closeWindow = true) => {
    const nativePreview = nativePreviewRef.current;
    if (!nativePreview) return;

    nativePreview.unlistenAction();
    nativePreview.unlistenReady();
    nativePreview.unlistenDestroyed();
    nativePreviewRef.current = undefined;
    setNativePreviewActive(false);

    if (closeWindow) {
      closeNativeImagePreviewWindow(nativePreview.label).catch(() => undefined);
    }
  }, []);

  const getClampedWindowOffset = useCallback((nextOffset: WindowOffset): WindowOffset => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return nextOffset;

    const windowElement = getWindowElement();
    const rect = windowElement?.getBoundingClientRect();
    if (!rect) return nextOffset;

    const maxX = Math.max(0, (window.innerWidth - rect.width) / 2 - WINDOW_EDGE_PADDING_PX);
    const maxY = Math.max(0, (window.innerHeight - rect.height) / 2 - WINDOW_EDGE_PADDING_PX);

    return {
      x: clamp(nextOffset.x, -maxX, maxX),
      y: clamp(nextOffset.y, -maxY, maxY),
    };
  }, []);

  const handleWindowDragStart = useCallback<React.PointerEventHandler<HTMLElement>>(
    (evt) => {
      if (mobile || maximized || isInteractiveDragTarget(evt.target)) return;
      if (evt.pointerType === 'mouse' && evt.button !== 0) return;

      evt.preventDefault();
      clearDragListeners();

      const startX = evt.clientX;
      const startY = evt.clientY;
      const startOffset = windowOffset;

      const handlePointerMove = (moveEvt: PointerEvent) => {
        setWindowOffset(
          getClampedWindowOffset({
            x: startOffset.x + moveEvt.clientX - startX,
            y: startOffset.y + moveEvt.clientY - startY,
          })
        );
      };

      const handlePointerUp = () => {
        clearDragListeners();
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp, { once: true });
      window.addEventListener('pointercancel', handlePointerUp, { once: true });
      dragCleanupRef.current = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
      };
    },
    [clearDragListeners, getClampedWindowOffset, maximized, mobile, windowOffset]
  );

  const buildNativePreviewPayload = useCallback(async (previewId: string) => {
    const input = latestNativeInputRef.current;
    const transferableSrc = await getTransferableImagePreviewSrc(input.src).catch(() => input.src);

    return {
      previewId,
      src: transferableSrc,
      alt: input.alt,
      loading: input.loading,
      canPrev: input.canPrev,
      canNext: input.canNext,
      imageOcrConfig: input.imageOcrConfig,
      originalLoadFailed: input.originalLoadFailed,
    };
  }, []);

  useEffect(() => {
    latestNativeInputRef.current = {
      src,
      alt,
      loading,
      canPrev: viewerProps.canPrev,
      canNext: viewerProps.canNext,
      imageOcrConfig: viewerProps.imageOcrConfig,
      onPrev: viewerProps.onPrev,
      onNext: viewerProps.onNext,
      requestClose,
      originalLoadFailed: viewerProps.originalLoadFailed,
      onRetryOriginal: viewerProps.onRetryOriginal,
    };
  }, [
    alt,
    loading,
    requestClose,
    src,
    viewerProps.canNext,
    viewerProps.canPrev,
    viewerProps.imageOcrConfig,
    viewerProps.onNext,
    viewerProps.onRetryOriginal,
    viewerProps.originalLoadFailed,
    viewerProps.onPrev,
  ]);

  useEffect(() => {
    if (!open) {
      setImageSize({});
      setMaximized(false);
      setMinimized(false);
      setOcrPanelOpen(false);
      setWindowOffset({ x: 0, y: 0 });
      setNativePreviewFailed(false);
      clearDragListeners();
      closeNativePreview();
      return undefined;
    }

    let mounted = true;
    setNativePreviewFailed(false);
    setImageSize({});
    loadImageElement(src)
      .then((img) => {
        if (!mounted) return;
        setImageSize({
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
        });
      })
      .catch(() => {
        if (mounted) {
          setImageSize({});
        }
      });

    return () => {
      mounted = false;
    };
  }, [clearDragListeners, closeNativePreview, open, src]);

  useEffect(() => {
    if (!open || !desktopNativePreview || nativePreviewRef.current) {
      return undefined;
    }

    let cancelled = false;
    const openAbortController = new AbortController();
    const previewId = createNativeImagePreviewId();
    let unlistenAction: (() => void) | undefined;
    let unlistenReady: (() => void) | undefined;
    let unlistenDestroyed: (() => void) | undefined;
    let closeHandled = false;
    const releaseActionListener = () => {
      const listener = unlistenAction;
      unlistenAction = undefined;
      listener?.();
    };
    const handleNativeClosed = () => {
      if (cancelled || closeHandled) return;
      closeHandled = true;

      if (nativePreviewRef.current?.previewId === previewId) {
        closeNativePreview(false);
      } else {
        releaseActionListener();
        unlistenReady?.();
        unlistenDestroyed?.();
      }
      latestNativeInputRef.current.requestClose();
    };

    const openNativePreview = async () => {
      unlistenAction = await listenNativeImagePreviewAction(previewId, (action) => {
        const input = latestNativeInputRef.current;

        if (action.type === 'close') {
          handleNativeClosed();
          return;
        }
        if (action.type === 'prev') {
          input.onPrev?.();
          return;
        }
        if (action.type === 'next') {
          input.onNext?.();
          return;
        }
        if (action.type === 'retry') {
          input.onRetryOriginal?.();
        }
      });
      if (cancelled) {
        releaseActionListener();
        return;
      }

      const input = latestNativeInputRef.current;
      const nativePreview = await openNativeImagePreviewWindow(
        {
          previewId,
          // Open the native shell before serializing or downloading the full
          // image. The active payload is delivered by the update effect below.
          src: '',
          alt: input.alt,
          loading: true,
          canPrev: input.canPrev,
          canNext: input.canNext,
          imageOcrConfig: input.imageOcrConfig,
          originalLoadFailed: input.originalLoadFailed,
        },
        openAbortController.signal,
        handleNativeClosed
      );
      if (!nativePreview) {
        releaseActionListener();
        if (!cancelled) {
          setNativePreviewFailed(true);
        }
        return;
      }

      if (cancelled) {
        releaseActionListener();
        nativePreview.unlistenReady();
        nativePreview.unlistenDestroyed();
        await closeNativeImagePreviewWindow(nativePreview.label).catch(() => undefined);
        return;
      }

      unlistenReady = nativePreview.unlistenReady;
      unlistenDestroyed = nativePreview.unlistenDestroyed;
      nativePreviewRef.current = {
        previewId,
        label: nativePreview.label,
        updatePayload: nativePreview.updatePayload,
        unlistenAction: releaseActionListener,
        unlistenReady,
        unlistenDestroyed,
      };
      setNativePreviewActive(true);
    };

    openNativePreview().catch(() => {
      releaseActionListener();
      unlistenReady?.();
      unlistenDestroyed?.();
      nativePreviewRef.current = undefined;
      setNativePreviewActive(false);
      if (!cancelled) {
        setNativePreviewFailed(true);
      }
    });

    return () => {
      cancelled = true;
      openAbortController.abort();
      releaseActionListener();
    };
  }, [closeNativePreview, desktopNativePreview, open]);

  useEffect(() => {
    const nativePreview = nativePreviewRef.current;
    if (!open || !nativePreview) return undefined;

    let cancelled = false;
    buildNativePreviewPayload(nativePreview.previewId)
      .then((payload) => {
        if (cancelled) return;
        nativePreview.updatePayload(payload).catch(() => undefined);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    alt,
    buildNativePreviewPayload,
    loading,
    nativePreviewActive,
    open,
    src,
    viewerProps.canNext,
    viewerProps.canPrev,
    viewerProps.imageOcrConfig,
    viewerProps.originalLoadFailed,
  ]);

  useEffect(() => {
    const nativePreview = nativePreviewRef.current;
    if (!open || !nativePreview || focusRequestKey === undefined) return;

    focusNativeImagePreviewWindow(nativePreview.label).catch(() => undefined);
  }, [focusRequestKey, nativePreviewActive, open]);

  useEffect(() => {
    if (!open || mobile || minimized || nativePreviewActive) return undefined;

    const handleKeyDown = (evt: KeyboardEvent) => {
      if (evt.key !== 'Escape' || isEditableEventTarget(evt.target)) return;
      evt.preventDefault();
      requestClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [minimized, mobile, nativePreviewActive, open, requestClose]);

  useEffect(
    () => () => {
      clearDragListeners();
      closeNativePreview();
    },
    [clearDragListeners, closeNativePreview]
  );

  useEffect(() => {
    if (!open || mobile || maximized || minimized || nativePreviewActive) return undefined;

    const handleResize = () => {
      setWindowOffset((currentOffset) => getClampedWindowOffset(currentOffset));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getClampedWindowOffset, maximized, minimized, mobile, nativePreviewActive, open]);

  if (!open) return null;
  if (desktopNativePreview && !nativePreviewFailed) return null;
  if (nativePreviewActive) return null;

  const modalStyle = {
    ...getImageViewerModalStyle(imageSize.width, imageSize.height),
    ...(ocrPanelOpen && !mobile
      ? { '--image-viewer-ocr-width': `${OCR_PANEL_MODAL_EXTRA_WIDTH_PX}px` }
      : {}),
  };
  const windowModalStyle = maximized
    ? undefined
    : {
        ...modalStyle,
        transform: `translate3d(${windowOffset.x}px, ${windowOffset.y}px, 0)`,
      };
  const content = renderViewer({
    ...viewerProps,
    src,
    alt,
    loading,
    requestClose,
    maximized,
    onMinimize: mobile ? undefined : () => setMinimized(true),
    onOcrPanelOpenChange: setOcrPanelOpen,
    onToggleMaximized: mobile ? undefined : () => setMaximized((current) => !current),
    onWindowDragStart: mobile || maximized ? undefined : handleWindowDragStart,
  });

  if (mobile) {
    return (
      <Overlay open={open} backdrop={<OverlayBackdrop className={ImageViewerBackdrop} />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: requestClose,
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Modal
              className={ImageViewerModal}
              size="500"
              style={modalStyle}
              onContextMenu={(evt: any) => evt.stopPropagation()}
            >
              {content}
            </Modal>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
    );
  }

  if (typeof document === 'undefined') return null;

  if (minimized) {
    return createPortal(
      <Box className={ImageViewerMinimizedLayer}>
        <button
          type="button"
          className={ImageViewerMinimizedButton}
          onClick={() => setMinimized(false)}
          title={alt}
        >
          <Icon size="50" src={Icons.Photo} />
          <Text size="B300" truncate>
            {alt}
          </Text>
        </button>
        <IconButton
          size="300"
          radii="300"
          onClick={requestClose}
          aria-label={'\u5173\u95ed\u9884\u89c8'}
        >
          <Icon size="50" src={Icons.Cross} />
        </IconButton>
      </Box>,
      document.body
    );
  }

  return createPortal(
    <div className={ImageViewerWindowLayer}>
      <Modal
        className={classNames(
          ImageViewerModal,
          ImageViewerWindowModal,
          maximized && ImageViewerWindowMaximized
        )}
        size="500"
        style={windowModalStyle}
        data-image-viewer-window="true"
        onContextMenu={(evt: any) => evt.stopPropagation()}
      >
        {content}
      </Modal>
    </div>,
    document.body
  );
}
