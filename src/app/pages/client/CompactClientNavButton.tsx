import { useSpaceSheetDrag } from './useSpaceSheetDrag';
import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useOpenCreateSpaceModal } from '../../state/hooks/createSpaceModal';
import { useLocation } from 'react-router-dom';
import { useNativeBack } from '../../hooks/useNativeBack';
import { SpaceSelectionContext } from './spaceSelection';
import FocusTrap from 'focus-trap-react';
import { Box, Icon, IconButton, Icons, Modal, Overlay, color, config } from 'folds';
import { useScreenSizeContext, ScreenSize } from '../../hooks/useScreenSize';
import { isDesktopUpdaterSupported } from '../../utils/desktopUpdater';
import { stopPropagation } from '../../utils/keyboard';
import { SidebarNav } from './SidebarNav';
import { SettingsPages } from '../../features/settings';
import { useMobileSettings } from './MobileSettings';

export function CompactClientNavButton() {
  const fullPage =
    import.meta.env.VITE_ANDROID_APP === 'true' || import.meta.env.VITE_IOS_APP === 'true';
  const backRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const screenSize = useScreenSizeContext();
  const [open, setOpen] = useState(false);
  const sheet = useSpaceSheetDrag(open, backRef);
  const sheetTop = sheet.top;

  const [menuOpen, setMenuOpen] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useNativeBack(menuRef, () => setMenuOpen(false), menuOpen);
  useEffect(() => {
    if (!open) setMenuOpen(false);
  }, [open]);
  const requestOpenSettings = useMobileSettings();
  const createSpace = useOpenCreateSpaceModal();
  const closeDrawer = useCallback(() => setOpen(false), []);
  useNativeBack(backRef, closeDrawer, open);
  useEffect(() => setOpen(false), [location.key]);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('calculator-open-spaces', show);
    return () => window.removeEventListener('calculator-open-spaces', show);
  }, []);
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
        aria-label="选择空间"
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
              allowOutsideClick: (event) =>
                event.target instanceof Element && !!event.target.closest('.native-back-button'),
              escapeDeactivates: stopPropagation,
            }}
          >
            <Modal
              ref={backRef}
              className={fullPage ? 'native-space-sheet' : undefined}
              data-space-selection
              size="300"
              style={{
                position: 'fixed',
                top: fullPage ? sheetTop : 0,
                left: 0,
                width: fullPage ? '100vw' : 'fit-content',
                maxWidth: fullPage ? '100vw' : 'calc(100vw - 24px)',
                height: fullPage
                  ? `calc(var(--app-height, 100vh) - ${sheetTop})`
                  : 'var(--app-height, 100dvh)',
                maxHeight: fullPage
                  ? `calc(var(--app-height, 100vh) - ${sheetTop})`
                  : 'var(--app-height, 100dvh)',
                display: 'flex',
                transition: !sheet.dragging
                  ? 'top 180ms ease, height 180ms ease, max-height 180ms ease'
                  : 'none',
                padding: 0,
                border: 'none',
                overflow: 'hidden',
                background: color.Background.Container,
                boxShadow: 'none',
                borderRadius: fullPage
                  ? '20px 20px 0 0'
                  : `0 ${config.radii.R500} ${config.radii.R500} 0`,
              }}
              onPointerDown={(evt: React.PointerEvent) => evt.stopPropagation()}
              onClick={(evt: React.MouseEvent) => {
                evt.stopPropagation();
                if (
                  evt.target instanceof Element &&
                  !evt.target.closest('button, a, input, select, [role="button"], [role="menu"]')
                )
                  closeDrawer();
              }}
            >
              <Box
                direction="Column"
                style={{
                  height: '100%',
                  minHeight: 0,
                  overflow: 'hidden',
                }}
              >
                {fullPage && (
                  <>
                    {sheet.handle}
                    <Box
                      shrink="No"
                      alignItems="Center"
                      justifyContent="SpaceBetween"
                      style={{ padding: '8px 16px', minHeight: 64 }}
                    >
                      <button
                        type="button"
                        onClick={closeDrawer}
                        aria-label="关闭空间选择"
                        style={{
                          minHeight: 48,
                          padding: '8px',
                          fontSize: 20,
                          color: 'var(--native-accent)',
                          background: 'transparent',
                          border: 0,
                        }}
                      >
                        取消
                      </button>
                      <div
                        ref={menuRef}
                        style={{
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <span style={{ fontSize: 22, fontWeight: 650 }}>我的空间</span>
                        <button
                          type="button"
                          aria-label="空间菜单"
                          aria-expanded={menuOpen}
                          onClick={() => setMenuOpen(!menuOpen)}
                          style={{
                            minWidth: 44,
                            minHeight: 48,
                            border: 0,
                            background: 'transparent',
                            color: 'var(--native-accent)',
                            fontSize: 24,
                          }}
                        >
                          •••
                        </button>
                        {menuOpen && (
                          <div className="native-space-menu" role="menu" aria-label="空间功能">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setShowTools(!showTools);
                                setMenuOpen(false);
                              }}
                            >
                              {showTools ? '收起更多功能' : '更多功能'}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuOpen(false);
                                openSettings();
                              }}
                            >
                              设置
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          closeDrawer();
                          createSpace();
                        }}
                        style={{
                          minHeight: 48,
                          padding: '8px',
                          fontSize: 20,
                          color: 'var(--native-accent)',
                          background: 'transparent',
                          border: 0,
                        }}
                      >
                        新建
                      </button>
                    </Box>
                  </>
                )}
                <SpaceSelectionContext.Provider value={closeDrawer}>
                  <SidebarNav
                    fullPage={fullPage}
                    toolsExpanded={showTools}
                    compactDrawer
                    requestOpenSettings={() => openSettings()}
                    requestOpenDeviceSettings={() => openSettings(SettingsPages.DevicesPage)}
                  />
                </SpaceSelectionContext.Provider>
              </Box>
            </Modal>
          </FocusTrap>
        </div>
      </Overlay>
    </>
  );
}
