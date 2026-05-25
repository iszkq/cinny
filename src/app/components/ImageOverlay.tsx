import FocusTrap from 'focus-trap-react';
import { as, Modal, Overlay, OverlayBackdrop, OverlayCenter } from 'folds';
import React, { ReactNode, useEffect, useState } from 'react';
import { ImageViewerBackdrop, ImageViewerModal } from '../styles/Modal.css';
import { stopPropagation } from '../utils/keyboard';
import { loadImageElement } from '../utils/dom';
import { getImageViewerModalStyle } from '../utils/imageViewerModal';

export type RenderViewerProps = {
  src: string;
  alt: string;
  requestClose: () => void;
};

type ImageOverlayProps = RenderViewerProps & {
  viewer: boolean;
  renderViewer: (props: RenderViewerProps) => ReactNode;
};

export const ImageOverlay = as<'div', ImageOverlayProps>(
  ({ src, alt, viewer, requestClose, renderViewer, ...props }, ref) => {
    const [imageSize, setImageSize] = useState<{ width?: number; height?: number }>({});

    useEffect(() => {
      if (!viewer) {
        setImageSize({});
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
    }, [src, viewer]);

    return (
      <Overlay
        {...props}
        ref={ref}
        open={viewer}
        backdrop={<OverlayBackdrop className={ImageViewerBackdrop} />}
      >
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => requestClose(),
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Modal
              className={ImageViewerModal}
              size="500"
              style={getImageViewerModalStyle(imageSize.width, imageSize.height)}
              onContextMenu={(evt: any) => evt.stopPropagation()}
            >
              {renderViewer({
                src,
                alt,
                requestClose,
              })}
            </Modal>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
    );
  }
);
