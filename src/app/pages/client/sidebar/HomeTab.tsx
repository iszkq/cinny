import React, { MouseEventHandler, forwardRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Icon, Icons, Menu, MenuItem, PopOut, RectCords, Text, config, toRem } from 'folds';
import { useAtomValue, useSetAtom } from 'jotai';
import FocusTrap from 'focus-trap-react';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { roomToUnreadAtom } from '../../../state/room/roomToUnread';
import { getHomePath, joinPathComponent } from '../../pathUtils';
import { useRoomsUnread } from '../../../state/hooks/unread';
import {
  SidebarAvatar,
  SidebarItem,
  SidebarItemBadge,
  SidebarItemTooltip,
} from '../../../components/sidebar';
import { useHomeSelected } from '../../../hooks/router/useHomeSelected';
import { UnreadBadge } from '../../../components/unread-badge';
import { isDesktopLikeScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { useNavToActivePathAtom } from '../../../state/hooks/navToActivePath';
import { useHomeRooms } from '../home/useHomeRooms';
import { markAsRead } from '../../../utils/notifications';
import { stopPropagation } from '../../../utils/keyboard';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { desktopPageNavCollapsedAtom } from '../../../state/desktopPageNav';

type HomeMenuProps = {
  requestClose: () => void;
};
const HomeMenu = forwardRef<HTMLDivElement, HomeMenuProps>(({ requestClose }, ref) => {
  const orphanRooms = useHomeRooms();
  const [sendReadReceipts] = useSetting(settingsAtom, 'sendReadReceipts');
  const unread = useRoomsUnread(orphanRooms, roomToUnreadAtom);
  const mx = useMatrixClient();

  const handleMarkAsRead = () => {
    if (!unread) return;
    orphanRooms.forEach((rId) => markAsRead(mx, rId, !sendReadReceipts));
    requestClose();
  };

  return (
    <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem
          onClick={handleMarkAsRead}
          size="300"
          after={<Icon size="100" src={Icons.CheckTwice} />}
          radii="300"
          aria-disabled={!unread}
        >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            {'\u6807\u8bb0\u4e3a\u5df2\u8bfb'}
            </Text>
        </MenuItem>
      </Box>
    </Menu>
  );
});

export function HomeTab() {
  const navigate = useNavigate();
  const screenSize = useScreenSizeContext();
  const desktopLayout = isDesktopLikeScreenSize(screenSize);
  const desktopPageNavCollapsed = useAtomValue(desktopPageNavCollapsedAtom);
  const setDesktopPageNavCollapsed = useSetAtom(desktopPageNavCollapsedAtom);
  const navToActivePath = useAtomValue(useNavToActivePathAtom());

  const orphanRooms = useHomeRooms();
  const homeUnread = useRoomsUnread(orphanRooms, roomToUnreadAtom);
  const homeSelected = useHomeSelected();
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const handleHomeClick = () => {
    if (desktopLayout) {
      if (homeSelected) {
        setDesktopPageNavCollapsed(!desktopPageNavCollapsed);
        return;
      }
      setDesktopPageNavCollapsed(false);
      const activePath = navToActivePath.get('home');
      if (activePath) {
        navigate(joinPathComponent(activePath));
        return;
      }
    }

    navigate(getHomePath());
  };

  const handleContextMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    evt.preventDefault();
    const cords = evt.currentTarget.getBoundingClientRect();
    setMenuAnchor((currentState) => {
      if (currentState) return undefined;
      return cords;
    });
  };

  return (
    <SidebarItem active={homeSelected}>
    <SidebarItemTooltip tooltip="首页">
        {(triggerRef) => (
          <SidebarAvatar
            as="button"
            ref={triggerRef}
            outlined
            onClick={handleHomeClick}
            onContextMenu={handleContextMenu}
          >
            <Icon src={Icons.Home} filled={homeSelected} />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      {homeUnread && (
        <SidebarItemBadge hasCount={homeUnread.total > 0}>
          <UnreadBadge highlight={homeUnread.highlight > 0} count={homeUnread.total} />
        </SidebarItemBadge>
      )}
      {menuAnchor && (
        <PopOut
          anchor={menuAnchor}
          position="Right"
          align="Start"
          content={
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                returnFocusOnDeactivate: false,
                onDeactivate: () => setMenuAnchor(undefined),
                clickOutsideDeactivates: true,
                isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                escapeDeactivates: stopPropagation,
              }}
            >
              <HomeMenu requestClose={() => setMenuAnchor(undefined)} />
            </FocusTrap>
          }
        />
      )}
    </SidebarItem>
  );
}
