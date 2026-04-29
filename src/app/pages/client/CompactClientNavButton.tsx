import React, { useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Icon,
  IconButton,
  Icons,
  Modal,
  Overlay,
  OverlayBackdrop,
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
        onClick={() => setOpen((state) => !state)}
        aria-pressed={open}
        aria-label="Open sections"
      >
        <Icon src={Icons.UnorderList} />
      </IconButton>
      <Overlay open={open} backdrop={<OverlayBackdrop />}>
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
              position: 'fixed',
              top: 0,
              left: 0,
              width: 'fit-content',
              maxWidth: 'calc(100vw - 24px)',
              height: '100dvh',
              maxHeight: '100dvh',
              display: 'flex',
              padding: 0,
              border: 'none',
              overflow: 'hidden',
              background: 'transparent',
              boxShadow: 'none',
              borderRadius: `0 ${config.radii.R500} ${config.radii.R500} 0`,
            }}
          >
            <Box
              direction="Column"
              style={{
                height: '100%',
                paddingTop: 'env(safe-area-inset-top, 0px)',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                paddingLeft: 'env(safe-area-inset-left, 0px)',
              }}
            >
              <SidebarNav />
            </Box>
          </Modal>
        </FocusTrap>
      </Overlay>
    </>
  );
}
