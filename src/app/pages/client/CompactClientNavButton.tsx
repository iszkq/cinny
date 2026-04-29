import React, { useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Icon,
  IconButton,
  Icons,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  config,
} from 'folds';
import { useScreenSizeContext, ScreenSize } from '../../hooks/useScreenSize';
import { stopPropagation } from '../../utils/keyboard';
import { SidebarNav } from './SidebarNav';

export function CompactClientNavButton() {
  const screenSize = useScreenSizeContext();
  const [open, setOpen] = useState(false);

  if (screenSize === ScreenSize.Desktop) {
    return null;
  }

  return (
    <>
      <IconButton
        fill="None"
        onClick={() => setOpen(true)}
        aria-pressed={open}
        aria-label="Open sections"
      >
        <Icon src={Icons.UnorderList} />
      </IconButton>
      <Overlay open={open} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setOpen(false),
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Modal
              size="300"
              style={{
                width: 'fit-content',
                maxWidth: 'calc(100vw - 24px)',
                height: 'min(88dvh, 720px)',
                maxHeight: 'calc(100dvh - 24px)',
                display: 'flex',
                padding: 0,
                border: 'none',
                overflow: 'hidden',
                background: 'transparent',
                boxShadow: 'none',
                borderRadius: config.radii.R500,
              }}
            >
              <SidebarNav />
            </Modal>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
    </>
  );
}
