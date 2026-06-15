import React, {
  MouseEventHandler,
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  Avatar,
  Box,
  Button,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
  config,
  toRem,
} from 'folds';
import { useVirtualizer } from '@tanstack/react-virtual';
import FocusTrap from 'focus-trap-react';
import { useNavigate } from 'react-router-dom';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { factoryRoomIdByActivity } from '../../../utils/sort';
import {
  NavButton,
  NavCategory,
  NavCategoryHeader,
  NavEmptyCenter,
  NavEmptyLayout,
  NavItem,
  NavItemContent,
} from '../../../components/nav';
import { getDirectCreatePath, getDirectRoomPath } from '../../pathUtils';
import { getCanonicalAliasOrRoomId } from '../../../utils/matrix';
import { useSelectedRoom } from '../../../hooks/router/useSelectedRoom';
import { useVirtualizerScrollMargin, VirtualTile } from '../../../components/virtualizer';
import {
  RoomNavCategoryButton,
  RoomNavCreateCategoryItem,
  RoomNavCategorySections,
  RoomNavItem,
} from '../../../features/room-nav';
import { makeNavCategoryId } from '../../../state/closedNavCategories';
import { roomToUnreadAtom } from '../../../state/room/roomToUnread';
import { useCategoryHandler } from '../../../hooks/useCategoryHandler';
import { useNavToActivePathMapper } from '../../../hooks/useNavToActivePathMapper';
import { useDirectRooms } from './useDirectRooms';
import { PageNav, PageNavContent, PageNavHeader } from '../../../components/page';
import { useClosedNavCategoriesAtom } from '../../../state/hooks/closedNavCategories';
import { useRoomsUnread } from '../../../state/hooks/unread';
import { markAsRead } from '../../../utils/notifications';
import { stopPropagation } from '../../../utils/keyboard';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { useRoomNavCategorizedRoomIds } from '../../../state/hooks/roomNavCategories';
import {
  getRoomNotificationMode,
  useRoomsNotificationPreferencesContext,
} from '../../../hooks/useRoomsNotificationPreferences';
import { useDirectCreateSelected } from '../../../hooks/router/useDirectSelected';
import { CompactClientNavButton } from '../CompactClientNavButton';
import { isDesktopLikeScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { desktopPageNavCollapsedAtom } from '../../../state/desktopPageNav';

type DirectMenuProps = {
  requestClose: () => void;
};
const DirectMenu = forwardRef<HTMLDivElement, DirectMenuProps>(({ requestClose }, ref) => {
  const mx = useMatrixClient();
  const [sendReadReceipts] = useSetting(settingsAtom, 'sendReadReceipts');
  const orphanRooms = useDirectRooms();
  const unread = useRoomsUnread(orphanRooms, roomToUnreadAtom);

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

function DirectHeader() {
  const screenSize = useScreenSizeContext();
  const desktop = isDesktopLikeScreenSize(screenSize);
  const setDesktopPageNavCollapsed = useSetAtom(desktopPageNavCollapsedAtom);
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const cords = evt.currentTarget.getBoundingClientRect();
    setMenuAnchor((currentState) => {
      if (currentState) return undefined;
      return cords;
    });
  };
  const handleToggleCollapsed = () => {
    setMenuAnchor(undefined);
    setDesktopPageNavCollapsed(true);
  };

  return (
    <>
      <PageNavHeader>
        <Box alignItems="Center" grow="Yes" gap="300">
          <Box shrink="No">
            {desktop ? (
              <IconButton
                aria-label="Collapse section list"
                fill="None"
                onClick={handleToggleCollapsed}
              >
                <Icon src={Icons.ArrowLeft} size="200" />
              </IconButton>
            ) : (
              <CompactClientNavButton />
            )}
          </Box>
          <Box grow="Yes">
            <Text size="H4" truncate>
              {'\u79c1\u804a\u6d88\u606f'}
            </Text>
          </Box>
          <Box>
            <IconButton aria-pressed={!!menuAnchor} fill="None" onClick={handleOpenMenu}>
              <Icon src={Icons.VerticalDots} size="200" />
            </IconButton>
          </Box>
        </Box>
      </PageNavHeader>
      <PopOut
        anchor={menuAnchor}
        position="Bottom"
        align="End"
        offset={6}
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
    </>
  );
}

function DirectEmpty() {
  const navigate = useNavigate();

  return (
    <NavEmptyCenter>
      <NavEmptyLayout
        icon={<Icon size="600" src={Icons.Mention} />}
        title={
          <Text size="H5" align="Center">
            {'\u6682\u65e0\u79c1\u804a\u6d88\u606f'}
          </Text>
        }
        content={
          <Text size="T300" align="Center">
            {'\u4f60\u8fd8\u6ca1\u6709\u4efb\u4f55\u79c1\u804a\u4f1a\u8bdd\u3002'}
          </Text>
        }
        options={
          <Button variant="Secondary" size="300" onClick={() => navigate(getDirectCreatePath())}>
            <Text size="B300" truncate>
              {'\u53d1\u8d77\u79c1\u804a'}
            </Text>
          </Button>
        }
      />
    </NavEmptyCenter>
  );
}

const DEFAULT_CATEGORY_ID = makeNavCategoryId('direct', 'direct');
const ROOM_NAV_CATEGORY_SCOPE = 'direct';
export function Direct() {
  const mx = useMatrixClient();
  useNavToActivePathMapper('direct');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollMargin, virtualListRef } = useVirtualizerScrollMargin(scrollRef);
  const directs = useDirectRooms();
  const notificationPreferences = useRoomsNotificationPreferencesContext();
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const categorizedRoomIds = useRoomNavCategorizedRoomIds(ROOM_NAV_CATEGORY_SCOPE);
  const navigate = useNavigate();

  const createDirectSelected = useDirectCreateSelected();

  const selectedRoomId = useSelectedRoom();
  const noRoomToDisplay = directs.length === 0;
  const [closedCategories, setClosedCategories] = useAtom(useClosedNavCategoriesAtom());

  const defaultDirectIds = useMemo(
    () => Array.from(directs).filter((roomId) => !categorizedRoomIds.has(roomId)),
    [directs, categorizedRoomIds]
  );

  const sortedDirects = useMemo(() => {
    const items = Array.from(defaultDirectIds).sort(factoryRoomIdByActivity(mx));
    if (closedCategories.has(DEFAULT_CATEGORY_ID)) {
      return items.filter((rId) => roomToUnread.has(rId) || rId === selectedRoomId);
    }
    return items;
  }, [mx, defaultDirectIds, closedCategories, roomToUnread, selectedRoomId]);

  const getRoom = useCallback((roomId: string) => mx.getRoom(roomId) ?? undefined, [mx]);
  const getRoomLinkPath = useCallback(
    (roomId: string) => getDirectRoomPath(getCanonicalAliasOrRoomId(mx, roomId)),
    [mx]
  );
  const getNotificationMode = useCallback(
    (roomId: string) => getRoomNotificationMode(notificationPreferences, roomId),
    [notificationPreferences]
  );

  const virtualizer = useVirtualizer({
    count: sortedDirects.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 38,
    overscan: 10,
    scrollMargin,
  });

  const handleCategoryClick = useCategoryHandler(setClosedCategories, (categoryId) =>
    closedCategories.has(categoryId)
  );

  return (
    <PageNav resizable>
      <DirectHeader />
      {noRoomToDisplay ? (
        <DirectEmpty />
      ) : (
        <PageNavContent scrollRef={scrollRef}>
          <Box direction="Column" gap="300">
            <NavCategory>
              <NavItem variant="Background" radii="400" aria-selected={createDirectSelected}>
                <NavButton onClick={() => navigate(getDirectCreatePath())}>
                  <NavItemContent>
                    <Box as="span" grow="Yes" alignItems="Center" gap="200">
                      <Avatar size="200" radii="400">
                        <Icon src={Icons.Plus} size="100" />
                      </Avatar>
                      <Box as="span" grow="Yes">
                        <Text as="span" size="Inherit" truncate>
                          {'\u521b\u5efa\u804a\u5929'}
                        </Text>
                      </Box>
                    </Box>
                  </NavItemContent>
                </NavButton>
              </NavItem>
              <RoomNavCreateCategoryItem
                scope={ROOM_NAV_CATEGORY_SCOPE}
                label={'\u65b0\u5efa\u8054\u7cfb\u4eba\u5206\u7c7b'}
              />
            </NavCategory>
            <RoomNavCategorySections
              scope={ROOM_NAV_CATEGORY_SCOPE}
              roomIds={directs}
              selectedRoomId={selectedRoomId}
              getRoom={getRoom}
              getLinkPath={getRoomLinkPath}
              getNotificationMode={getNotificationMode}
              direct
            />
            {defaultDirectIds.length > 0 && (
              <NavCategory>
                <NavCategoryHeader>
                  <RoomNavCategoryButton
                    closed={closedCategories.has(DEFAULT_CATEGORY_ID)}
                    data-category-id={DEFAULT_CATEGORY_ID}
                    onClick={handleCategoryClick}
                  >
                    {'\u804a\u5929'}
                  </RoomNavCategoryButton>
                </NavCategoryHeader>
                <div
                  ref={virtualListRef}
                  style={{
                    position: 'relative',
                    height: virtualizer.getTotalSize(),
                  }}
                >
                  {virtualizer.getVirtualItems().map((vItem) => {
                    const roomId = sortedDirects[vItem.index];
                    const room = mx.getRoom(roomId);
                    if (!room) return null;
                    const selected = selectedRoomId === roomId;

                    return (
                      <VirtualTile
                        virtualItem={vItem}
                        key={vItem.index}
                        ref={virtualizer.measureElement}
                        style={{ top: vItem.start - scrollMargin }}
                      >
                        <RoomNavItem
                          room={room}
                          selected={selected}
                          showAvatar
                          direct
                          categoryScope={ROOM_NAV_CATEGORY_SCOPE}
                          linkPath={getDirectRoomPath(getCanonicalAliasOrRoomId(mx, roomId))}
                          notificationMode={getRoomNotificationMode(
                            notificationPreferences,
                            room.roomId
                          )}
                        />
                      </VirtualTile>
                    );
                  })}
                </div>
              </NavCategory>
            )}
          </Box>
        </PageNavContent>
      )}
    </PageNav>
  );
}
