import React, { Suspense, lazy, useCallback, useEffect } from 'react';
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
  config,
} from 'folds';
import { useAtom } from 'jotai';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '../../../components/sidebar';
import { bibleModalAtom } from '../../../state/bibleModal';
import { ModalWide } from '../../../styles/Modal.css';
import { loadBibleFeature, warmBibleResources } from '../../../utils/biblePreload';
import { isDesktopUpdaterSupported } from '../../../utils/desktopUpdater';
import {
  closeNativeBibleWindow,
  listenNativeBibleWindowClose,
  openNativeBibleWindow,
} from '../../../utils/nativeBibleWindow';

const LazyBibleModal = lazy(async () => ({
  default: (await loadBibleFeature()).BibleModal,
}));

function BibleLoadingModal({ requestClose }: { requestClose: () => void }) {
  return (
    <Overlay open backdrop={<OverlayBackdrop onClick={requestClose} />}>
      <OverlayCenter>
        <Modal
          className={ModalWide}
          style={{ display: 'flex', flexDirection: 'column', minHeight: '92vh' }}
          variant="Background"
        >
          <Box
            alignItems="Start"
            justifyContent="SpaceBetween"
            gap="200"
            style={{
              padding: config.space.S300,
              borderBottom: '1px solid rgba(148, 163, 184, 0.18)',
            }}
          >
            <Box grow="Yes" direction="Column" gap="100">
              <Text size="H4">{'\u5723\u7ecf'}</Text>
              <Text size="T300" priority="300">
                {'\u6b63\u5728\u8f7d\u5165\u5723\u7ecf\u5185\u5bb9...'}
              </Text>
            </Box>
            <IconButton onClick={requestClose} size="300" radii="300">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
          <Box grow="Yes" alignItems="Center" justifyContent="Center">
            <Text size="L400">{'\u6b63\u5728\u8f7d\u5165...'}</Text>
          </Box>
        </Modal>
      </OverlayCenter>
    </Overlay>
  );
}

export function BibleTab() {
  const [opened, setOpen] = useAtom(bibleModalAtom);
  const desktop = isDesktopUpdaterSupported();

  const warmBibleFeature = useCallback(() => {
    void warmBibleResources().catch(() => undefined);
  }, []);

  const handleOpen = useCallback(() => {
    warmBibleFeature();
    setOpen(true);
    if (desktop) {
      void openNativeBibleWindow().catch(() => setOpen(false));
    }
  }, [desktop, setOpen, warmBibleFeature]);

  const handleClose = useCallback(() => {
    setOpen(false);
    if (desktop) {
      void closeNativeBibleWindow().catch(() => undefined);
    }
  }, [desktop, setOpen]);

  useEffect(() => {
    if (!desktop) return undefined;

    let mounted = true;
    let unlistenClose: (() => void) | undefined;

    void listenNativeBibleWindowClose(() => {
      if (mounted) {
        setOpen(false);
      }
    })
      .then((unlisten) => {
        if (!mounted) {
          unlisten();
          return;
        }
        unlistenClose = unlisten;
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
      unlistenClose?.();
    };
  }, [desktop, setOpen]);

  return (
    <SidebarItem active={opened}>
      <SidebarItemTooltip tooltip={'\u5723\u7ecf'}>
        {(triggerRef) => (
          <SidebarAvatar
            as="button"
            ref={triggerRef}
            outlined
            onMouseEnter={warmBibleFeature}
            onFocus={warmBibleFeature}
            onPointerDown={warmBibleFeature}
            onClick={handleOpen}
          >
            <Text size="H5">{'\u7ecf'}</Text>
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      <Suspense fallback={opened ? <BibleLoadingModal requestClose={handleClose} /> : null}>
        {opened && <LazyBibleModal open={opened} requestClose={handleClose} />}
      </Suspense>
    </SidebarItem>
  );
}
