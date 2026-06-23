import React, { Suspense, lazy, useCallback } from 'react';
import { Text } from 'folds';
import { useAtom } from 'jotai';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '../../../components/sidebar';
import { bibleModalAtom } from '../../../state/bibleModal';
import { isDesktopUpdaterSupported } from '../../../utils/desktopUpdater';
import { openNativeBibleWindow } from '../../../utils/nativeBibleWindow';

const loadBibleFeature = () => import('../../../features/bible');
const LazyBibleModal = lazy(async () => ({
  default: (await loadBibleFeature()).BibleModal,
}));

export function BibleTab() {
  const [opened, setOpen] = useAtom(bibleModalAtom);
  const desktop = isDesktopUpdaterSupported();

  const warmBibleFeature = useCallback(() => {
    void loadBibleFeature();
  }, []);

  const handleOpen = useCallback(() => {
    warmBibleFeature();
    setOpen(true);
    if (desktop) {
      void openNativeBibleWindow().catch(() => undefined);
    }
  }, [desktop, setOpen, warmBibleFeature]);

  const handleClose = useCallback(() => setOpen(false), [setOpen]);

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
            onClick={handleOpen}
          >
            <Text size="H5">{'\u7ecf'}</Text>
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      <Suspense fallback={null}>
        {opened && <LazyBibleModal open={opened} requestClose={handleClose} />}
      </Suspense>
    </SidebarItem>
  );
}
