import React, { lazy, Suspense, useRef } from 'react';
import { Scroll, config, toRem } from 'folds';

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

type SidebarNavProps = {
  compactDrawer?: boolean;
  requestOpenSettings?: () => void;
  requestOpenDeviceSettings?: () => void;
};

export function SidebarNav({
  compactDrawer = false,
  requestOpenSettings,
  requestOpenDeviceSettings,
}: SidebarNavProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const mobileClient = mobileOrTablet();

  return (
    <Sidebar
      style={
        compactDrawer
          ? {
              width: `calc(${toRem(76)} + var(--safe-area-left, 0px))`,
              paddingTop: `calc(${config.space.S200} + var(--safe-area-top, 0px))`,
              paddingBottom: `calc(${config.space.S200} + var(--safe-area-bottom, 0px))`,
              paddingLeft: 'var(--safe-area-left, 0px)',
            }
          : undefined
      }
    >
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
              <UnverifiedTab requestOpenSettings={requestOpenDeviceSettings} />
              <InboxTab />
              <SettingsTab requestOpenSettings={requestOpenSettings} />
            </SidebarStack>
          </>
        }
      />
    </Sidebar>
  );
}
