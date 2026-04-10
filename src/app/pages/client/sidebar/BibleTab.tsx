import React from 'react';
import { Text } from 'folds';
import { useAtom } from 'jotai';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '../../../components/sidebar';
import { BibleModal } from '../../../features/bible';
import { bibleModalAtom } from '../../../state/bibleModal';

export function BibleTab() {
  const [opened, setOpen] = useAtom(bibleModalAtom);

  return (
    <SidebarItem active={opened}>
      <SidebarItemTooltip tooltip={'\u5723\u7ecf'}>
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={() => setOpen(true)}>
            <Text size="H5">{'\u7ecf'}</Text>
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      <BibleModal open={opened} requestClose={() => setOpen(false)} />
    </SidebarItem>
  );
}
