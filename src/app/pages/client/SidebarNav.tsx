import React, { lazy, Suspense, useRef } from 'react';
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
  FavoritesTab,
} from './sidebar';
import { CreateTab } from './sidebar/CreateTab';
import { mobileOrTablet } from '../../utils/user-agent';

const ANDROID_APK_BUILD = import.meta.env.VITE_ANDROID_APP === 'true';
const LazyBibleTab = ANDROID_APK_BUILD
  ? undefined
  : lazy(async () => ({ default: (await import('./sidebar/BibleTab')).BibleTab }));

export function SidebarNav() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const mobileClient = mobileOrTablet();

  return (
    <Sidebar>
      <SidebarContent
        scrollable={
          <Scroll ref={scrollRef} variant="Background" size="0">
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
              {!mobileClient && LazyBibleTab && (
                <Suspense fallback={null}>
                  <LazyBibleTab />
                </Suspense>
              )}
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
