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

type ImageViewerDialogProps = Omit<
  ImageViewerProps,
  'maximized' | 'onMinimize' | 'onToggleMaximized' | 'onWindowDragStart'
> & {
  open: boolean;
  renderViewer: (props: ImageViewerProps) => ReactNode;
};

type WindowOffset = {
  x: number;
  y: number;
};

const WINDOW_EDGE_PADDING_PX = 16;

const isEditableEventTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(target.closest('input, textarea, [contenteditable="true"]'));
};

const isInteractiveDragTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;

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
  renderViewer,
  ...viewerProps
}: ImageViewerDialogProps) {
  const screenSize = useScreenSizeContext();
  const mobile = screenSize === ScreenSize.Mobile;
  const [imageSize, setImageSize] = useState<{ width?: number; height?: number }>({});
  const [maximized, setMaximized] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [windowOffset, setWindowOffset] = useState<WindowOffset>({ x: 0, y: 0 });
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const clearDragListeners = useCallback(() => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
  }, []);

  const getClampedWindowOffset = useCallback((nextOffset: WindowOffset): WindowOffset => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return nextOffset;

    const windowElement = getWindowElement();
    const rect = windowElement?.getBoundingClientRect();
    if (!rect) return nextOffset;

    const maxX = Math.max(0, (window.innerWidth - rect.width) / 2 - WINDOW_EDGE_PADDING_PX);
    const maxY = Math.max(
      0,
      (window.innerHeight - rect.height) / 2 - WINDOW_EDGE_PADDING_PX
    );

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
    [
      clearDragListeners,
      getClampedWindowOffset,
      maximized,
      mobile,
      windowOffset,
    ]
  );

  useEffect(() => {
    if (!open) {
      setImageSize({});
      setMaximized(false);
      setMinimized(false);
      setWindowOffset({ x: 0, y: 0 });
      clearDragListeners();
      return undefined;
    }

    let mounted = true;
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
  }, [clearDragListeners, open, src]);

  useEffect(() => {
    if (!open || mobile || minimized) return undefined;

    const handleKeyDown = (evt: KeyboardEvent) => {
      if (evt.key !== 'Escape' || isEditableEventTarget(evt.target)) return;
      evt.preventDefault();
      requestClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [minimized, mobile, open, requestClose]);

  useEffect(
    () => () => {
      clearDragListeners();
    },
    [clearDragListeners]
  );

  useEffect(() => {
    if (!open || mobile || maximized || minimized) return undefined;

    const handleResize = () => {
      setWindowOffset((currentOffset) => getClampedWindowOffset(currentOffset));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getClampedWindowOffset, maximized, minimized, mobile, open]);

  if (!open) return null;

  const modalStyle = getImageViewerModalStyle(imageSize.width, imageSize.height);
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
