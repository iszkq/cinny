import React, { useCallback } from 'react';
import { Text } from 'folds';
import { useAtom } from 'jotai';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '../../../components/sidebar';
import { BibleModal } from '../../../features/bible';
import { bibleModalAtom } from '../../../state/bibleModal';
import { isDesktopUpdaterSupported } from '../../../utils/desktopUpdater';
import { openNativeBibleWindow } from '../../../utils/nativeBibleWindow';

export function BibleTab() {
  const [opened, setOpen] = useAtom(bibleModalAtom);
  const desktop = isDesktopUpdaterSupported();

  const handleOpen = useCallback(() => {
    setOpen(true);
    if (desktop) {
      void openNativeBibleWindow().catch(() => undefined);
    }
  }, [desktop, setOpen]);

  const handleClose = useCallback(() => setOpen(false), [setOpen]);

  return (
    <SidebarItem active={opened}>
      <SidebarItemTooltip tooltip={'\u5723\u7ecf'}>
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={handleOpen}>
            <Text size="H5">{'\u7ecf'}</Text>
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      <BibleModal open={opened} requestClose={handleClose} />
    </SidebarItem>
  );
}
