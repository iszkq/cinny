import React, { MouseEventHandler, forwardRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Icon, Icons, Menu, MenuItem, PopOut, RectCords, Text, config, toRem } from 'folds';
import FocusTrap from 'focus-trap-react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { roomToUnreadAtom } from '../../../state/room/roomToUnread';
import { getDirectPath, joinPathComponent } from '../../pathUtils';
import { useRoomsUnread } from '../../../state/hooks/unread';
import {
  SidebarAvatar,
  SidebarItem,
  SidebarItemBadge,
  SidebarItemTooltip,
} from '../../../components/sidebar';
import { useDirectSelected } from '../../../hooks/router/useDirectSelected';
import { UnreadBadge } from '../../../components/unread-badge';
import { isDesktopLikeScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { useNavToActivePathAtom } from '../../../state/hooks/navToActivePath';
import { useDirectRooms } from '../direct/useDirectRooms';
import { markAsRead } from '../../../utils/notifications';
import { stopPropagation } from '../../../utils/keyboard';
import { settingsAtom } from '../../../state/settings';
import { useSetting } from '../../../state/hooks/settings';
import { desktopPageNavCollapsedAtom } from '../../../state/desktopPageNav';

type DirectMenuProps = {
  requestClose: () => void;
};
const DirectMenu = forwardRef<HTMLDivElement, DirectMenuProps>(({ requestClose }, ref) => {
  const orphanRooms = useDirectRooms();
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

export function DirectTab() {
  const navigate = useNavigate();
  const screenSize = useScreenSizeContext();
  const desktopLayout = isDesktopLikeScreenSize(screenSize);
  const desktopPageNavCollapsed = useAtomValue(desktopPageNavCollapsedAtom);
  const setDesktopPageNavCollapsed = useSetAtom(desktopPageNavCollapsedAtom);
  const navToActivePath = useAtomValue(useNavToActivePathAtom());

  const directs = useDirectRooms();
  const directUnread = useRoomsUnread(directs, roomToUnreadAtom);
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const directSelected = useDirectSelected();

  const handleDirectClick = () => {
    if (desktopLayout) {
      if (directSelected) {
        setDesktopPageNavCollapsed(!desktopPageNavCollapsed);
        return;
      }
      setDesktopPageNavCollapsed(false);
      const activePath = navToActivePath.get('direct');
      if (activePath) {
        navigate(joinPathComponent(activePath));
        return;
      }
    }

    navigate(getDirectPath());
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
    <SidebarItem active={directSelected}>
    <SidebarItemTooltip tooltip="私聊消息">
        {(triggerRef) => (
          <SidebarAvatar
            as="button"
            ref={triggerRef}
            outlined
            onClick={handleDirectClick}
            onContextMenu={handleContextMenu}
          >
            <Icon src={Icons.User} filled={directSelected} />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      {directUnread && (
        <SidebarItemBadge hasCount={directUnread.total > 0}>
          <UnreadBadge highlight={directUnread.highlight > 0} count={directUnread.total} />
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
              <DirectMenu requestClose={() => setMenuAnchor(undefined)} />
            </FocusTrap>
          }
        />
      )}
    </SidebarItem>
  );
}
