import React, { ReactNode, useEffect, useState } from 'react';
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
  'maximized' | 'onMinimize' | 'onToggleMaximized'
> & {
  open: boolean;
  renderViewer: (props: ImageViewerProps) => ReactNode;
};

const isEditableEventTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(target.closest('input, textarea, [contenteditable="true"]'));
};

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

  useEffect(() => {
    if (!open) {
      setImageSize({});
      setMaximized(false);
      setMinimized(false);
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
  }, [open, src]);

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

  if (!open) return null;

  const modalStyle = getImageViewerModalStyle(imageSize.width, imageSize.height);
  const content = renderViewer({
    ...viewerProps,
    src,
    alt,
    loading,
    requestClose,
    maximized,
    onMinimize: mobile ? undefined : () => setMinimized(true),
    onToggleMaximized: mobile ? undefined : () => setMaximized((current) => !current),
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
        style={maximized ? undefined : modalStyle}
        onContextMenu={(evt: any) => evt.stopPropagation()}
      >
        {content}
      </Modal>
    </div>,
    document.body
  );
}
