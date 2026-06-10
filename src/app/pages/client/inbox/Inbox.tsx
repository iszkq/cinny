import React from 'react';
import { Avatar, Box, Icon, IconButton, Icons, Text } from 'folds';
import { useAtomValue, useSetAtom } from 'jotai';
import { NavCategory, NavItem, NavItemContent, NavLink } from '../../../components/nav';
import { getInboxInvitesPath, getInboxNotificationsPath } from '../../pathUtils';
import {
  useInboxInvitesSelected,
  useInboxNotificationsSelected,
} from '../../../hooks/router/useInbox';
import { UnreadBadge } from '../../../components/unread-badge';
import { allInvitesAtom } from '../../../state/room-list/inviteList';
import { useNavToActivePathMapper } from '../../../hooks/useNavToActivePathMapper';
import { PageNav, PageNavContent, PageNavHeader } from '../../../components/page';
import { CompactClientNavButton } from '../CompactClientNavButton';
import { ScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { desktopPageNavCollapsedAtom } from '../../../state/desktopPageNav';

function InvitesNavItem() {
  const invitesSelected = useInboxInvitesSelected();
  const allInvites = useAtomValue(allInvitesAtom);
  const inviteCount = allInvites.length;

  return (
    <NavItem
      variant="Background"
      radii="400"
      highlight={inviteCount > 0}
      aria-selected={invitesSelected}
    >
      <NavLink to={getInboxInvitesPath()}>
        <NavItemContent>
          <Box as="span" grow="Yes" alignItems="Center" gap="200">
            <Avatar size="200" radii="400">
              <Icon src={Icons.Mail} size="100" filled={invitesSelected} />
            </Avatar>
            <Box as="span" grow="Yes">
              <Text as="span" size="Inherit" truncate>
                {'\u9080\u8bf7'}
              </Text>
            </Box>
            {inviteCount > 0 && <UnreadBadge highlight count={inviteCount} />}
          </Box>
        </NavItemContent>
      </NavLink>
    </NavItem>
  );
}

export function Inbox() {
  const screenSize = useScreenSizeContext();
  const desktop = screenSize === ScreenSize.Desktop;
  const setDesktopPageNavCollapsed = useSetAtom(desktopPageNavCollapsedAtom);
  useNavToActivePathMapper('inbox');
  const notificationsSelected = useInboxNotificationsSelected();

  return (
    <PageNav resizable>
      <PageNavHeader>
        <Box grow="Yes" alignItems="Center" gap="300">
          <Box shrink="No">
            {desktop ? (
              <IconButton
                aria-label={'\u6536\u8d77\u4fa7\u8fb9\u680f'}
                fill="None"
                onClick={() => setDesktopPageNavCollapsed(true)}
              >
                <Icon src={Icons.ArrowLeft} size="200" />
              </IconButton>
            ) : (
              <CompactClientNavButton />
            )}
          </Box>
          <Box grow="Yes">
            <Text size="H4" truncate>
              {'\u6536\u4ef6\u7bb1'}
            </Text>
          </Box>
        </Box>
      </PageNavHeader>

      <PageNavContent>
        <Box direction="Column" gap="300">
          <NavCategory>
            <NavItem variant="Background" radii="400" aria-selected={notificationsSelected}>
              <NavLink to={getInboxNotificationsPath()}>
                <NavItemContent>
                  <Box as="span" grow="Yes" alignItems="Center" gap="200">
                    <Avatar size="200" radii="400">
                      <Icon src={Icons.MessageUnread} size="100" filled={notificationsSelected} />
                    </Avatar>
                    <Box as="span" grow="Yes">
                      <Text as="span" size="Inherit" truncate>
                        {'\u901a\u77e5'}
                      </Text>
                    </Box>
                  </Box>
                </NavItemContent>
              </NavLink>
            </NavItem>
            <InvitesNavItem />
          </NavCategory>
        </Box>
      </PageNavContent>
    </PageNav>
  );
}
