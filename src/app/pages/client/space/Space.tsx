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
  Line,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Spinner,
  Text,
  color,
  config,
  toRem,
} from 'folds';
import { useVirtualizer } from '@tanstack/react-virtual';
import { JoinRule, Room } from 'matrix-js-sdk';
import { RoomJoinRulesEventContent } from 'matrix-js-sdk/lib/types';
import FocusTrap from 'focus-trap-react';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { mDirectAtom } from '../../../state/mDirectList';
import {
  NavCategory,
  NavCategoryHeader,
  NavItem,
  NavItemContent,
  NavLink,
} from '../../../components/nav';
import { getSpaceLobbyPath, getSpaceRoomPath } from '../../pathUtils';
import { getCanonicalAliasOrRoomId, isRoomAlias } from '../../../utils/matrix';
import { useSelectedRoom } from '../../../hooks/router/useSelectedRoom';
import { useSpaceLobbySelected } from '../../../hooks/router/useSelectedSpace';
import { useSpace } from '../../../hooks/useSpace';
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
import { useRoomName } from '../../../hooks/useRoomMeta';
import { useSpaceJoinedHierarchy } from '../../../hooks/useSpaceHierarchy';
import { allRoomsAtom } from '../../../state/room-list/roomList';
import { PageNav, PageNavContent, PageNavHeader } from '../../../components/page';
import { usePowerLevels } from '../../../hooks/usePowerLevels';
import { useRecursiveChildScopeFactory, useSpaceChildren } from '../../../state/hooks/roomList';
import { roomToParentsAtom } from '../../../state/room/roomToParents';
import { markAsRead } from '../../../utils/notifications';
import { useRoomsUnread } from '../../../state/hooks/unread';
import { UseStateProvider } from '../../../components/UseStateProvider';
import { LeaveSpacePrompt } from '../../../components/leave-space-prompt';
import { copyToClipboard } from '../../../utils/dom';
import { useClosedNavCategoriesAtom } from '../../../state/hooks/closedNavCategories';
import { useStateEvent } from '../../../hooks/useStateEvent';
import { Membership, StateEvent } from '../../../../types/matrix/room';
import { stopPropagation } from '../../../utils/keyboard';
import { getMatrixToRoom } from '../../../plugins/matrix-to';
import { getViaServers } from '../../../plugins/via-servers';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { useRoomNavCategorizedRoomIds } from '../../../state/hooks/roomNavCategories';
import {
  getRoomNotificationMode,
  useRoomsNotificationPreferencesContext,
} from '../../../hooks/useRoomsNotificationPreferences';
import { useOpenSpaceSettings } from '../../../state/hooks/spaceSettings';
import { useRoomNavigate } from '../../../hooks/useRoomNavigate';
import { useRoomCreators } from '../../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../../hooks/useRoomPermissions';
import { ContainerColor } from '../../../styles/ContainerColor.css';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { BreakWord } from '../../../styles/Text.css';
import { InviteUserPrompt } from '../../../components/invite-user-prompt';
import { useCallEmbed } from '../../../hooks/useCallEmbed';
import { CompactClientNavButton } from '../CompactClientNavButton';
import { isDesktopLikeScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { desktopPageNavCollapsedAtom } from '../../../state/desktopPageNav';

type SpaceMenuProps = {
  room: Room;
  requestClose: () => void;
};
const SpaceMenu = forwardRef<HTMLDivElement, SpaceMenuProps>(({ room, requestClose }, ref) => {
  const mx = useMatrixClient();
  const [sendReadReceipts] = useSetting(settingsAtom, 'sendReadReceipts');
  const [developerTools] = useSetting(settingsAtom, 'developerTools');
  const roomToParents = useAtomValue(roomToParentsAtom);
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const canInvite = permissions.action('invite', mx.getSafeUserId());
  const openSpaceSettings = useOpenSpaceSettings();
  const { navigateRoom } = useRoomNavigate();

  const [invitePrompt, setInvitePrompt] = useState(false);

  const allChild = useSpaceChildren(
    allRoomsAtom,
    room.roomId,
    useRecursiveChildScopeFactory(mx, roomToParents)
  );
  const unread = useRoomsUnread(allChild, roomToUnreadAtom);

  const handleMarkAsRead = () => {
    allChild.forEach((childRoomId) => markAsRead(mx, childRoomId, !sendReadReceipts));
    requestClose();
  };

  const handleCopyLink = () => {
    const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, room.roomId);
    const viaServers = isRoomAlias(roomIdOrAlias) ? undefined : getViaServers(room);
    copyToClipboard(getMatrixToRoom(roomIdOrAlias, viaServers));
    requestClose();
  };

  const handleInvite = () => {
    setInvitePrompt(true);
  };

  const handleRoomSettings = () => {
    openSpaceSettings(room.roomId);
    requestClose();
  };

  const handleOpenTimeline = () => {
    navigateRoom(room.roomId);
    requestClose();
  };

  return (
    <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        {invitePrompt && room && (
          <InviteUserPrompt
            room={room}
            requestClose={() => {
              setInvitePrompt(false);
              requestClose();
            }}
          />
        )}
        <MenuItem
          onClick={handleMarkAsRead}
          size="300"
          after={<Icon size="100" src={Icons.CheckTwice} />}
          radii="300"
          disabled={!unread}
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            {'\u6807\u8bb0\u4e3a\u5df2\u8bfb'}
          </Text>
        </MenuItem>
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem
          onClick={handleInvite}
          variant="Primary"
          fill="None"
          size="300"
          after={<Icon size="100" src={Icons.UserPlus} />}
          radii="300"
          aria-pressed={invitePrompt}
          disabled={!canInvite}
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            {'\u9080\u8bf7'}
          </Text>
        </MenuItem>
        <MenuItem
          onClick={handleCopyLink}
          size="300"
          after={<Icon size="100" src={Icons.Link} />}
          radii="300"
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            {'\u590d\u5236\u94fe\u63a5'}
          </Text>
        </MenuItem>
        <MenuItem
          onClick={handleRoomSettings}
          size="300"
          after={<Icon size="100" src={Icons.Setting} />}
          radii="300"
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            {'\u7a7a\u95f4\u8bbe\u7f6e'}
          </Text>
        </MenuItem>
        {developerTools && (
          <MenuItem
            onClick={handleOpenTimeline}
            size="300"
            after={<Icon size="100" src={Icons.Terminal} />}
            radii="300"
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              {'\u4e8b\u4ef6\u65f6\u95f4\u7ebf'}
            </Text>
          </MenuItem>
        )}
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <UseStateProvider initial={false}>
          {(promptLeave, setPromptLeave) => (
            <>
              <MenuItem
                onClick={() => setPromptLeave(true)}
                variant="Critical"
                fill="None"
                size="300"
                after={<Icon size="100" src={Icons.ArrowGoLeft} />}
                radii="300"
                aria-pressed={promptLeave}
              >
                <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                  {'\u9000\u51fa\u7a7a\u95f4'}
                </Text>
              </MenuItem>
              {promptLeave && (
                <LeaveSpacePrompt
                  roomId={room.roomId}
                  onDone={requestClose}
                  onCancel={() => setPromptLeave(false)}
                />
              )}
            </>
          )}
        </UseStateProvider>
      </Box>
    </Menu>
  );
});

function SpaceHeader() {
  const space = useSpace();
  const screenSize = useScreenSizeContext();
  const desktop = isDesktopLikeScreenSize(screenSize);
  const setDesktopPageNavCollapsed = useSetAtom(desktopPageNavCollapsedAtom);
  const spaceName = useRoomName(space);
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const joinRules = useStateEvent(
    space,
    StateEvent.RoomJoinRules
  )?.getContent<RoomJoinRulesEventContent>();

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
          <Box grow="Yes" alignItems="Center" gap="100">
            <Text size="H4" truncate>
              {spaceName}
            </Text>
            {joinRules?.join_rule !== JoinRule.Public && <Icon src={Icons.Lock} size="50" />}
          </Box>
          <Box shrink="No">
            <IconButton aria-pressed={!!menuAnchor} fill="None" onClick={handleOpenMenu}>
              <Icon src={Icons.VerticalDots} size="200" />
            </IconButton>
          </Box>
        </Box>
      </PageNavHeader>
      {menuAnchor && (
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
              <SpaceMenu room={space} requestClose={() => setMenuAnchor(undefined)} />
            </FocusTrap>
          }
        />
      )}
    </>
  );
}

type SpaceTombstoneProps = { roomId: string; replacementRoomId: string };
export function SpaceTombstone({ roomId, replacementRoomId }: SpaceTombstoneProps) {
  const mx = useMatrixClient();
  const { navigateSpace } = useRoomNavigate();

  const [joinState, handleJoin] = useAsyncCallback(
    useCallback(() => {
      const currentRoom = mx.getRoom(roomId);
      const via = currentRoom ? getViaServers(currentRoom) : [];
      return mx.joinRoom(replacementRoomId, {
        viaServers: via,
      });
    }, [mx, roomId, replacementRoomId])
  );
  const replacementRoom = mx.getRoom(replacementRoomId);

  const handleOpen = () => {
    if (replacementRoom) navigateSpace(replacementRoom.roomId);
    if (joinState.status === AsyncStatus.Success) navigateSpace(joinState.data.roomId);
  };

  return (
    <Box
      style={{
        padding: config.space.S200,
        borderRadius: config.radii.R400,
        borderWidth: config.borderWidth.B300,
      }}
      className={ContainerColor({ variant: 'Surface' })}
      direction="Column"
      gap="300"
    >
      <Box direction="Column" grow="Yes" gap="100">
        <Text size="L400">{'\u7a7a\u95f4\u5df2\u5347\u7ea7'}</Text>
        <Text size="T200">
          {
            '\u8be5\u7a7a\u95f4\u5df2\u88ab\u66ff\u6362\uff0c\u4e0d\u518d\u5904\u4e8e\u6d3b\u8dc3\u72b6\u6001\u3002'
          }
        </Text>
        {joinState.status === AsyncStatus.Error && (
          <Text className={BreakWord} style={{ color: color.Critical.Main }} size="T200">
            {joinState.error instanceof Error
              ? joinState.error.message
              : '\u52a0\u5165\u65b0\u7a7a\u95f4\u5931\u8d25\u3002'}
          </Text>
        )}
      </Box>
      <Box direction="Column" shrink="No">
        {replacementRoom?.getMyMembership() === Membership.Join ||
        joinState.status === AsyncStatus.Success ? (
          <Button onClick={handleOpen} size="300" variant="Success" fill="Solid" radii="300">
            <Text size="B300">{'\u6253\u5f00\u65b0\u7a7a\u95f4'}</Text>
          </Button>
        ) : (
          <Button
            onClick={handleJoin}
            size="300"
            variant="Primary"
            fill="Solid"
            radii="300"
            before={
              joinState.status === AsyncStatus.Loading && (
                <Spinner size="100" variant="Primary" fill="Solid" />
              )
            }
            disabled={joinState.status === AsyncStatus.Loading}
          >
            <Text size="B300">{'\u52a0\u5165\u65b0\u7a7a\u95f4'}</Text>
          </Button>
        )}
      </Box>
    </Box>
  );
}

export function Space() {
  const mx = useMatrixClient();
  const space = useSpace();
  useNavToActivePathMapper(space.roomId);
  const spaceIdOrAlias = getCanonicalAliasOrRoomId(mx, space.roomId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollMargin, virtualListRef } = useVirtualizerScrollMargin(scrollRef);
  const mDirects = useAtomValue(mDirectAtom);
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const categorizedRoomIds = useRoomNavCategorizedRoomIds(space.roomId);
  const allRooms = useAtomValue(allRoomsAtom);
  const allJoinedRooms = useMemo(() => new Set(allRooms), [allRooms]);
  const notificationPreferences = useRoomsNotificationPreferencesContext();

  const tombstoneEvent = useStateEvent(space, StateEvent.RoomTombstone);
  const selectedRoomId = useSelectedRoom();
  const lobbySelected = useSpaceLobbySelected(spaceIdOrAlias);
  const callEmbed = useCallEmbed();

  const [closedCategories, setClosedCategories] = useAtom(useClosedNavCategoriesAtom());

  const getRoom = useCallback(
    (rId: string): Room | undefined => {
      if (allJoinedRooms.has(rId)) {
        return mx.getRoom(rId) ?? undefined;
      }
      return undefined;
    },
    [mx, allJoinedRooms]
  );

  const hierarchy = useSpaceJoinedHierarchy(
    space.roomId,
    getRoom,
    useCallback(
      (parentId, roomId) => {
        if (!closedCategories.has(makeNavCategoryId(space.roomId, parentId))) {
          return false;
        }
        const showRoomAnyway =
          roomToUnread.has(roomId) || roomId === selectedRoomId || callEmbed?.roomId === roomId;
        return !showRoomAnyway;
      },
      [space.roomId, closedCategories, roomToUnread, selectedRoomId, callEmbed]
    ),
    useCallback(
      (sId) => closedCategories.has(makeNavCategoryId(space.roomId, sId)),
      [closedCategories, space.roomId]
    )
  );

  const categoryRoomIds = useMemo(
    () =>
      hierarchy
        .map((item) => item.roomId)
        .filter((roomId) => {
          const room = mx.getRoom(roomId);
          return !!room && !room.isSpaceRoom();
        }),
    [hierarchy, mx]
  );

  const defaultHierarchy = useMemo(() => {
    const visibleParentIds = new Set<string>();

    hierarchy.forEach((item) => {
      const room = mx.getRoom(item.roomId);
      if (!room || room.isSpaceRoom() || categorizedRoomIds.has(item.roomId)) return;
      if (item.parentId) {
        visibleParentIds.add(item.parentId);
      }
    });

    return hierarchy.filter((item) => {
      const room = mx.getRoom(item.roomId);
      if (!room) return false;

      if (room.isSpaceRoom()) {
        const categoryId = makeNavCategoryId(space.roomId, item.roomId);
        return closedCategories.has(categoryId) || visibleParentIds.has(item.roomId);
      }

      return !categorizedRoomIds.has(item.roomId);
    });
  }, [mx, hierarchy, categorizedRoomIds, closedCategories, space.roomId]);

  const virtualizer = useVirtualizer({
    count: defaultHierarchy.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 0,
    overscan: 10,
    scrollMargin,
  });

  const handleCategoryClick = useCategoryHandler(setClosedCategories, (categoryId) =>
    closedCategories.has(categoryId)
  );

  const getToLink = (roomId: string) =>
    getSpaceRoomPath(spaceIdOrAlias, getCanonicalAliasOrRoomId(mx, roomId));

  const getNotificationMode = useCallback(
    (roomId: string) => getRoomNotificationMode(notificationPreferences, roomId),
    [notificationPreferences]
  );

  return (
    <PageNav resizable>
      <SpaceHeader />
      <PageNavContent scrollRef={scrollRef}>
        <Box direction="Column" gap="300">
          {tombstoneEvent && (
            <SpaceTombstone
              roomId={space.roomId}
              replacementRoomId={tombstoneEvent.getContent().replacement_room}
            />
          )}
          <NavCategory>
            <NavItem variant="Background" radii="400" aria-selected={lobbySelected}>
              <NavLink to={getSpaceLobbyPath(getCanonicalAliasOrRoomId(mx, space.roomId))}>
                <NavItemContent>
                  <Box as="span" grow="Yes" alignItems="Center" gap="200">
                    <Avatar size="200" radii="400">
                      <Icon src={Icons.Flag} size="100" filled={lobbySelected} />
                    </Avatar>
                    <Box as="span" grow="Yes">
                      <Text as="span" size="Inherit" truncate>
                        {'\u5927\u5385'}
                      </Text>
                    </Box>
                  </Box>
                </NavItemContent>
              </NavLink>
            </NavItem>
            <RoomNavCreateCategoryItem
              scope={space.roomId}
              label={'\u65b0\u5efa\u623f\u95f4\u5206\u7c7b'}
            />
          </NavCategory>
          <RoomNavCategorySections
            scope={space.roomId}
            roomIds={categoryRoomIds}
            selectedRoomId={selectedRoomId}
            getRoom={getRoom}
            getLinkPath={getToLink}
            getNotificationMode={getNotificationMode}
            direct={(roomId) => mDirects.has(roomId)}
          />
          <NavCategory
            ref={virtualListRef}
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((vItem) => {
              const { roomId } = defaultHierarchy[vItem.index] ?? {};
              const room = mx.getRoom(roomId);
              if (!room) return null;

              if (room.isSpaceRoom()) {
                const categoryId = makeNavCategoryId(space.roomId, roomId);

                return (
                  <VirtualTile
                    virtualItem={vItem}
                    key={vItem.index}
                    ref={virtualizer.measureElement}
                    style={{ top: vItem.start - scrollMargin }}
                  >
                    <div style={{ paddingTop: vItem.index === 0 ? undefined : config.space.S400 }}>
                      <NavCategoryHeader>
                        <RoomNavCategoryButton
                          data-category-id={categoryId}
                          onClick={handleCategoryClick}
                          closed={closedCategories.has(categoryId)}
                        >
                          {roomId === space.roomId ? '\u623f\u95f4' : room?.name}
                        </RoomNavCategoryButton>
                      </NavCategoryHeader>
                    </div>
                  </VirtualTile>
                );
              }

              return (
                <VirtualTile
                  virtualItem={vItem}
                  key={vItem.index}
                  ref={virtualizer.measureElement}
                  style={{ top: vItem.start - scrollMargin }}
                >
                  <RoomNavItem
                    room={room}
                    selected={selectedRoomId === roomId}
                    showAvatar
                    direct={mDirects.has(roomId)}
                    categoryScope={space.roomId}
                    linkPath={getToLink(roomId)}
                    notificationMode={getRoomNotificationMode(notificationPreferences, room.roomId)}
                  />
                </VirtualTile>
              );
            })}
          </NavCategory>
        </Box>
      </PageNavContent>
    </PageNav>
  );
}
