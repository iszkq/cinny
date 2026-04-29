import React, { useRef } from 'react';
import { Scroll } from 'folds';

import {
  Sidebar,
  SidebarContent,
  SidebarStackSeparator,
  SidebarStack,
} from '../../components/sidebar';
import {
  DirectTab,
  HomeTab,
  SpaceTabs,
  InboxTab,
  ExploreTab,
  SettingsTab,
  UnverifiedTab,
  SearchTab,
  BibleTab,
  FavoritesTab,
} from './sidebar';
import { CreateTab } from './sidebar/CreateTab';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';

export function SidebarNav() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const screenSize = useScreenSizeContext();
  const mobile = screenSize === ScreenSize.Mobile;

  return (
    <Sidebar>
      <SidebarContent
        scrollable={
          <Scroll
            ref={scrollRef}
            variant="Background"
            size="0"
            direction={mobile ? 'Horizontal' : 'Vertical'}
          >
            <SidebarStack>
              <HomeTab />
              <DirectTab />
            </SidebarStack>
            <SpaceTabs scrollRef={scrollRef} />
            <SidebarStackSeparator />
            <SidebarStack>
              <ExploreTab />
              <CreateTab />
            </SidebarStack>
          </Scroll>
        }
        sticky={
          <>
            <SidebarStackSeparator />
            <SidebarStack>
              <BibleTab />
              <FavoritesTab />
              <SearchTab />
              <UnverifiedTab />
              <InboxTab />
              <SettingsTab />
            </SidebarStack>
          </>
        }
      />
    </Sidebar>
  );
}
