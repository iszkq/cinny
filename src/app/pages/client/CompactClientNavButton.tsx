import React, { useCallback, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { Box, Icon, IconButton, Icons, Modal, Overlay, color, config } from 'folds';
import { useScreenSizeContext, ScreenSize } from '../../hooks/useScreenSize';
import { isDesktopUpdaterSupported } from '../../utils/desktopUpdater';
import { stopPropagation } from '../../utils/keyboard';
import { SidebarNav } from './SidebarNav';
import { SettingsPages } from '../../features/settings';
import { useMobileSettings } from './MobileSettings';

export function CompactClientNavButton() {
  const screenSize = useScreenSizeContext();
  const [open, setOpen] = useState(false);
  const requestOpenSettings = useMobileSettings();
  const closeDrawer = useCallback(() => setOpen(false), []);
  const openSettings = useCallback(
    (initialPage?: SettingsPages) => {
      // Mount settings while the drawer still covers the page. Closing the drawer
      // on the next frame prevents iOS Safari from forwarding this tap to Home.
      requestOpenSettings(initialPage);
      window.requestAnimationFrame(() => setOpen(false));
    },
    [requestOpenSettings]
  );

  if (screenSize === ScreenSize.Desktop || isDesktopUpdaterSupported()) {
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
      <Overlay open={open}>
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.42)',
          }}
          onPointerDown={(evt: React.PointerEvent<HTMLDivElement>) => {
            evt.preventDefault();
            evt.stopPropagation();
          }}
          onClick={(evt: React.MouseEvent<HTMLDivElement>) => {
            evt.preventDefault();
            evt.stopPropagation();
            closeDrawer();
          }}
        >
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: closeDrawer,
              clickOutsideDeactivates: false,
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
                height: 'var(--app-height, 100dvh)',
                maxHeight: 'var(--app-height, 100dvh)',
                display: 'flex',
                padding: 0,
                border: 'none',
                overflow: 'hidden',
                background: color.Background.Container,
                boxShadow: 'none',
                borderRadius: `0 ${config.radii.R500} ${config.radii.R500} 0`,
              }}
              onPointerDown={(evt: React.PointerEvent) => evt.stopPropagation()}
              onClick={(evt: React.MouseEvent) => evt.stopPropagation()}
            >
              <Box
                direction="Column"
                style={{
                  height: '100%',
                  minHeight: 0,
                  overflow: 'hidden',
                }}
              >
                <SidebarNav
                  compactDrawer
                  requestOpenSettings={() => openSettings()}
                  requestOpenDeviceSettings={() => openSettings(SettingsPages.DevicesPage)}
                />
              </Box>
            </Modal>
          </FocusTrap>
        </div>
      </Overlay>
    </>
  );
}
