import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, Icons } from 'folds';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  SidebarAvatar,
  SidebarItem,
  SidebarItemBadge,
  SidebarItemTooltip,
} from '../../../components/sidebar';
import { allInvitesAtom } from '../../../state/room-list/inviteList';
import {
  getInboxInvitesPath,
  getInboxNotificationsPath,
  getInboxPath,
  joinPathComponent,
} from '../../pathUtils';
import { useInboxSelected } from '../../../hooks/router/useInbox';
import { UnreadBadge } from '../../../components/unread-badge';
import { isCompactScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { useNavToActivePathAtom } from '../../../state/hooks/navToActivePath';
import { desktopPageNavCollapsedAtom } from '../../../state/desktopPageNav';

export function InboxTab() {
  const screenSize = useScreenSizeContext();
  const navigate = useNavigate();
  const setDesktopPageNavCollapsed = useSetAtom(desktopPageNavCollapsedAtom);
  const navToActivePath = useAtomValue(useNavToActivePathAtom());
  const inboxSelected = useInboxSelected();
  const allInvites = useAtomValue(allInvitesAtom);
  const inviteCount = allInvites.length;

  const handleInboxClick = () => {
    if (isCompactScreenSize(screenSize)) {
      navigate(getInboxPath());
      return;
    }
    setDesktopPageNavCollapsed(false);
    if (inboxSelected) {
      return;
    }
    const activePath = navToActivePath.get('inbox');
    if (activePath) {
      navigate(joinPathComponent(activePath));
      return;
    }

    const path = inviteCount > 0 ? getInboxInvitesPath() : getInboxNotificationsPath();
    navigate(path);
  };

  return (
    <SidebarItem active={inboxSelected}>
      <SidebarItemTooltip tooltip="Inbox">
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={handleInboxClick}>
            <Icon src={Icons.Inbox} filled={inboxSelected} />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      {inviteCount > 0 && (
        <SidebarItemBadge hasCount>
          <UnreadBadge highlight count={inviteCount} />
        </SidebarItemBadge>
      )}
    </SidebarItem>
  );
}
