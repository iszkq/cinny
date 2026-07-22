import React, { ReactNode } from 'react';
import FocusTrap from 'focus-trap-react';
import { Modal, Overlay, OverlayBackdrop, OverlayCenter } from 'folds';
import { stopPropagation } from '../utils/keyboard';
import { AppModal, AppModalCenter } from '../styles/Modal.css';

type Modal500Props = {
  requestClose: () => void;
  children: ReactNode;
};
export function Modal500({ requestClose, children }: Modal500Props) {
  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter className={AppModalCenter}>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: true,
            onDeactivate: requestClose,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Modal className={AppModal} size="500" variant="Background">
            {children}
          </Modal>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
