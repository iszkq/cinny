import React from 'react';
import { Icon, Icons } from 'folds';
import { useNavigate } from 'react-router-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '../../../components/sidebar';
import { useExploreSelected } from '../../../hooks/router/useExploreSelected';
import {
  getExploreFeaturedPath,
  getExplorePath,
  getExploreServerPath,
  joinPathComponent,
} from '../../pathUtils';
import { useClientConfig } from '../../../hooks/useClientConfig';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { getMxIdServer } from '../../../utils/matrix';
import { isDesktopLikeScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { useNavToActivePathAtom } from '../../../state/hooks/navToActivePath';
import { desktopPageNavCollapsedAtom } from '../../../state/desktopPageNav';

export function ExploreTab() {
  const mx = useMatrixClient();
  const screenSize = useScreenSizeContext();
  const desktopLayout = isDesktopLikeScreenSize(screenSize);
  const clientConfig = useClientConfig();
  const navigate = useNavigate();
  const desktopPageNavCollapsed = useAtomValue(desktopPageNavCollapsedAtom);
  const setDesktopPageNavCollapsed = useSetAtom(desktopPageNavCollapsedAtom);
  const navToActivePath = useAtomValue(useNavToActivePathAtom());

  const exploreSelected = useExploreSelected();

  const handleExploreClick = () => {
    if (!desktopLayout) {
      navigate(getExplorePath());
      return;
    }

    if (exploreSelected) {
      setDesktopPageNavCollapsed(!desktopPageNavCollapsed);
      return;
    }
    setDesktopPageNavCollapsed(false);

    const activePath = navToActivePath.get('explore');
    if (activePath) {
      navigate(joinPathComponent(activePath));
      return;
    }

    if (clientConfig.featuredCommunities?.openAsDefault) {
      navigate(getExploreFeaturedPath());
      return;
    }
    const userId = mx.getUserId();
    const userServer = userId ? getMxIdServer(userId) : undefined;
    if (userServer) {
      navigate(getExploreServerPath(userServer));
      return;
    }
    navigate(getExplorePath());
  };

  return (
    <SidebarItem active={exploreSelected}>
      <SidebarItemTooltip tooltip="社区探索">
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={handleExploreClick}>
            <Icon src={Icons.Explore} filled={exploreSelected} />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}
