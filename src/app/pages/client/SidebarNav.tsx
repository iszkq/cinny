import React, { lazy, Suspense, useRef, useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { desktopSidebarWidthAtom } from '../../state/desktopPageNav';
import { SidebarLabelsContext } from '../../components/sidebar/SidebarItem';
import { ResizeHandle } from '../../components/sidebar/Sidebar.css';
import { Scroll, config, toRem, Icon, Icons, Text, color } from 'folds';

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
import { ThemeMode } from './sidebar/ThemeMode';
import { CreateTab } from './sidebar/CreateTab';
import { mobileOrTablet } from '../../utils/user-agent';

const ANDROID_APK_BUILD = import.meta.env.VITE_ANDROID_APP === 'true';
const LazyBibleTab = ANDROID_APK_BUILD
  ? undefined
  : lazy(async () => ({ default: (await import('./sidebar/BibleTab')).BibleTab }));

type SidebarNavProps = {
  compactDrawer?: boolean;
  fullPage?: boolean;
  toolsExpanded?: boolean;
  requestOpenSettings?: () => void;
  requestOpenDeviceSettings?: () => void;
};

export function SidebarNav({
  compactDrawer = false,
  fullPage = false,
  toolsExpanded = false,
  requestOpenSettings,
  requestOpenDeviceSettings,
}: SidebarNavProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsVisible = fullPage ? toolsExpanded : toolsOpen;
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{if(fullPage && toolsExpanded)scrollRef.current?.scrollTo({top:0});},[fullPage,toolsExpanded]);
  const mobileClient = mobileOrTablet();
  const expanded = fullPage || (!compactDrawer && !mobileClient);
  const [savedWidth, setWidth] = useAtom(desktopSidebarWidthAtom);
  const clampWidth = (value: number) =>
    Math.min(320, Math.max(144, Number.isFinite(value) ? value : 184));
  const width = clampWidth(savedWidth);
  const drag = useRef<{ x: number; width: number }>();

  const extraTools = (<> {toolsVisible && (
                <div id="sidebar-extra-tools">
                  <SidebarStackSeparator />
                  <SidebarStack>
                    <ExploreTab />
                    <CreateTab />
                    {!mobileClient && LazyBibleTab && (
                      <Suspense fallback={null}>
                        <LazyBibleTab />
                      </Suspense>
                    )}
                    <FavoritesTab />
                    <SearchTab />
                    <UnverifiedTab requestOpenSettings={requestOpenDeviceSettings} />
                    <InboxTab />
                  </SidebarStack>
                </div>
              )} </>);

  return (
    <SidebarLabelsContext.Provider value={expanded}>
      <Sidebar
        data-labels={expanded}
        data-full-space-page={fullPage}
        style={
          fullPage
            ? {width:'100%',flexGrow:1,minHeight:0,paddingBottom:'var(--safe-area-bottom, env(safe-area-inset-bottom, 0px))'}
            : compactDrawer
            ? {
                width: `calc(${toRem(76)} + var(--safe-area-left, 0px))`,
                paddingTop: `calc(${config.space.S200} + var(--safe-area-top, 0px))`,
                paddingBottom: `calc(${config.space.S200} + var(--safe-area-bottom, 0px))`,
                paddingLeft: 'var(--safe-area-left, 0px)',
              }
            : { width: expanded ? width : 76, flexShrink: 0, position: 'relative' }
        }
      >
        <SidebarContent
          scrollable={
            <Scroll ref={scrollRef} variant="Background" size="0">
              {fullPage && extraTools}
              <SidebarStack>
                <HomeTab />
                {!fullPage && <DirectTab />}
              </SidebarStack>
              <SpaceTabs scrollRef={scrollRef} />
              {!fullPage && extraTools}
            </Scroll>
          }
          sticky={fullPage ? undefined :
            <>
              <SidebarStackSeparator />
              <button
                type="button"
                aria-label={toolsOpen ? '收起更多功能' : '展开更多功能'}
                aria-expanded={toolsOpen}
                aria-controls="sidebar-extra-tools"
                onClick={() => setToolsOpen(!toolsOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  margin: '4px 8px',
                  minHeight: fullPage ? 52 : 34,
                  border: 0,
                  borderRadius: 8,
                  background: 'transparent',
                  color: color.Background.OnContainer,
                  cursor: 'pointer',
                }}
              >
                <Icon size="100" src={toolsOpen ? Icons.ChevronBottom : Icons.ChevronTop} />
                {expanded && <Text size={fullPage ? "T400" : "T200"}>{toolsOpen ? '收起功能' : '更多功能'}</Text>}
              </button>
              <SidebarStack>
                <SettingsTab requestOpenSettings={requestOpenSettings} />
                {expanded && <ThemeMode />}
              </SidebarStack>
            </>
          }
        />
        {expanded && !fullPage && (
          <div
            className={ResizeHandle}
            role="separator"
            aria-label="调整左侧导航宽度"
            aria-orientation="vertical"
            aria-valuemin={144}
            aria-valuemax={320}
            aria-valuenow={width}
            tabIndex={0}
            onPointerDown={(e) => {
              e.preventDefault();
              drag.current = { x: e.clientX, width };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (drag.current)
                setWidth(clampWidth(drag.current.width + e.clientX - drag.current.x));
            }}
            onPointerUp={(e) => {
              drag.current = undefined;
              e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={() => {
              drag.current = undefined;
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                setWidth(clampWidth(width + (e.key === 'ArrowRight' ? 16 : -16)));
              }
            }}
          />
        )}
      </Sidebar>
    </SidebarLabelsContext.Provider>
  );
}
