import React, {
  MouseEventHandler,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Room } from 'matrix-js-sdk';
import {
  Avatar,
  Box,
  Icon,
  IconButton,
  Icons,
  Text,
  Menu,
  MenuItem,
  config,
  PopOut,
  toRem,
  Line,
  RectCords,
  Badge,
  Spinner,
} from 'folds';
import { useFocusWithin, useHover } from 'react-aria';
import FocusTrap from 'focus-trap-react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { NavItem, NavItemContent, NavItemOptions, NavLink } from '../../components/nav';
import { UnreadBadge, UnreadBadgeCenter } from '../../components/unread-badge';
import { RoomAvatar, RoomIcon } from '../../components/room-avatar';
import { getDirectRoomAvatarUrl, getRoomAvatarUrl } from '../../utils/room';
import { nameInitials } from '../../utils/common';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoomUnread } from '../../state/hooks/unread';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { usePowerLevels } from '../../hooks/usePowerLevels';
import { copyToClipboard } from '../../utils/dom';
import { markAsRead } from '../../utils/notifications';
import { UseStateProvider } from '../../components/UseStateProvider';
import { LeaveRoomPrompt } from '../../components/leave-room-prompt';
import { useRoomTypingMember } from '../../hooks/useRoomTypingMembers';
import { TypingIndicator } from '../../components/typing-indicator';
import { stopPropagation } from '../../utils/keyboard';
import { getMatrixToRoom } from '../../plugins/matrix-to';
import { getCanonicalAliasOrRoomId, isRoomAlias } from '../../utils/matrix';
import { getViaServers } from '../../plugins/via-servers';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { useOpenRoomSettings } from '../../state/hooks/roomSettings';
import { useSpaceOptionally } from '../../hooks/useSpace';
import {
  getRoomNotificationModeIcon,
  RoomNotificationMode,
} from '../../hooks/useRoomsNotificationPreferences';
import { RoomNotificationModeSwitcher } from '../../components/RoomNotificationSwitcher';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { InviteUserPrompt } from '../../components/invite-user-prompt';
import { useRoomName } from '../../hooks/useRoomMeta';
import { useCallMembers, useCallSession } from '../../hooks/useCall';
import { useCallEmbed, useCallStart } from '../../hooks/useCallEmbed';
import { callChatAtom } from '../../state/callEmbed';
import { useCallPreferencesAtom } from '../../state/hooks/callPreferences';
import { useAutoDiscoveryInfo } from '../../hooks/useAutoDiscoveryInfo';
import { livekitSupport } from '../../hooks/useLivekitSupport';
import { useRoomNavCategoriesAtom } from '../../state/hooks/roomNavCategories';
import { getRoomNavCustomCategories } from '../../state/roomNavCategories';

type RoomNavItemMenuProps = {
  room: Room;
  requestClose: () => void;
  notificationMode?: RoomNotificationMode;
  categoryScope: string;
};

const RoomNavItemMenu = forwardRef<HTMLDivElement, RoomNavItemMenuProps>(
  ({ room, requestClose, notificationMode, categoryScope }, ref) => {
    const mx = useMatrixClient();
    const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
    const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
    const powerLevels = usePowerLevels(room);
    const creators = useRoomCreators(room);

    const permissions = useRoomPermissions(creators, powerLevels);
    const canInvite = permissions.action('invite', mx.getSafeUserId());
    const openRoomSettings = useOpenRoomSettings();
    const space = useSpaceOptionally();
    const roomNavCategoriesAtom = useRoomNavCategoriesAtom();
    const roomNavCategories = useAtomValue(roomNavCategoriesAtom);
    const setRoomNavCategories = useSetAtom(roomNavCategoriesAtom);

    const [invitePrompt, setInvitePrompt] = useState(false);
    const [menuContainer, setMenuContainer] = useState<HTMLDivElement | null>(null);
    const menuContainerRef = useRef<HTMLDivElement | null>(null);
    const categoryMenuRef = useRef<HTMLDivElement>(null);
    const [categoryMenuAnchor, setCategoryMenuAnchor] = useState<RectCords>();
    const favorite = roomNavCategories.favorites.includes(room.roomId);
    const customCategories = useMemo(
      () => getRoomNavCustomCategories(roomNavCategories, categoryScope),
      [roomNavCategories, categoryScope]
    );

    const handleMenuRef = useCallback(
      (node: HTMLDivElement | null) => {
        if (menuContainerRef.current !== node) {
          menuContainerRef.current = node;
          setMenuContainer(node);
        }

        if (typeof ref === 'function') {
          ref(node);
          return;
        }
        if (ref) {
          const refObject = ref as React.MutableRefObject<HTMLDivElement | null>;
          refObject.current = node;
        }
      },
      [ref]
    );

    useEffect(() => {
      if (!categoryMenuAnchor) return undefined;

      const handleCategoryMenuPointerDown = (evt: PointerEvent) => {
        const { target } = evt;
        if (!(target instanceof Node)) return;

        if (categoryMenuRef.current?.contains(target)) return;
        if (target instanceof Element && target.closest('[data-category-menu-trigger="true"]')) {
          return;
        }

        if (menuContainer?.contains(target)) {
          setCategoryMenuAnchor(undefined);
          return;
        }

        requestClose();
      };

      document.addEventListener('pointerdown', handleCategoryMenuPointerDown, true);

      return () => {
        document.removeEventListener('pointerdown', handleCategoryMenuPointerDown, true);
      };
    }, [categoryMenuAnchor, menuContainer, requestClose]);

    const handleMarkAsRead = () => {
      markAsRead(mx, room.roomId, hideActivity);
      requestClose();
    };

    const handleInvite = () => {
      setInvitePrompt(true);
    };

    const handleCopyLink = () => {
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, room.roomId);
      const viaServers = isRoomAlias(roomIdOrAlias) ? undefined : getViaServers(room);
      copyToClipboard(getMatrixToRoom(roomIdOrAlias, viaServers));
      requestClose();
    };

    const handleRoomSettings = () => {
      openRoomSettings(room.roomId, space?.roomId);
      requestClose();
    };

    const handleToggleFavorite = () => {
      setRoomNavCategories({
        type: favorite ? 'REMOVE_FAVORITE' : 'ADD_FAVORITE',
        roomId: room.roomId,
      });
      requestClose();
    };

    const handleToggleCategory = (categoryId: string, included: boolean) => {
      setRoomNavCategories({
        type: included ? 'REMOVE_FROM_CATEGORY' : 'ADD_TO_CATEGORY',
        categoryId,
        roomId: room.roomId,
      });
      requestClose();
    };

    const handleOpenCategoryMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
      const cords = evt.currentTarget.getBoundingClientRect();
      setCategoryMenuAnchor((currentState) => (currentState ? undefined : cords));
    };

    return (
      <Menu ref={handleMenuRef} style={{ maxWidth: toRem(220), width: '100vw' }}>
        {invitePrompt && room && (
          <InviteUserPrompt
            room={room}
            requestClose={() => {
              setInvitePrompt(false);
              requestClose();
            }}
          />
        )}
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
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
          <RoomNotificationModeSwitcher roomId={room.roomId} value={notificationMode}>
            {(handleOpen, opened, changing) => (
              <MenuItem
                size="300"
                after={
                  changing ? (
                    <Spinner size="100" variant="Secondary" />
                  ) : (
                    <Icon size="100" src={getRoomNotificationModeIcon(notificationMode)} />
                  )
                }
                radii="300"
                aria-pressed={opened}
                onClick={handleOpen}
              >
                <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                  {'\u901a\u77e5\u63d0\u9192'}
                </Text>
              </MenuItem>
            )}
          </RoomNotificationModeSwitcher>
        </Box>
        <Line variant="Surface" size="300" />
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <PopOut
            anchor={categoryMenuAnchor}
            position="Right"
            align="Start"
            offset={4}
            container={menuContainer ?? undefined}
            style={{ pointerEvents: 'none' }}
            content={
              <Menu
                ref={categoryMenuRef}
                style={{
                  maxWidth: toRem(220),
                  width: '100vw',
                  maxHeight: toRem(320),
                  overflowY: 'auto',
                  pointerEvents: 'auto',
                }}
              >
                <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                  <MenuItem
                    onClick={handleToggleFavorite}
                    size="300"
                    after={<Icon size="100" src={favorite ? Icons.Check : Icons.Star} />}
                    radii="300"
                  >
                    <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                      {'\u6536\u85cf'}
                    </Text>
                  </MenuItem>
                </Box>
                {customCategories.length > 0 && (
                  <>
                    <Line variant="Surface" size="300" />
                    <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                      {customCategories.map((category) => {
                        const included = category.roomIds.includes(room.roomId);

                        return (
                          <MenuItem
                            key={category.id}
                            onClick={() => handleToggleCategory(category.id, included)}
                            size="300"
                            after={
                              <Icon size="100" src={included ? Icons.Check : Icons.Category} />
                            }
                            radii="300"
                          >
                            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                              {category.name}
                            </Text>
                          </MenuItem>
                        );
                      })}
                    </Box>
                  </>
                )}
              </Menu>
            }
          >
            <MenuItem
              onClick={handleOpenCategoryMenu}
              size="300"
              after={<Icon size="100" src={Icons.ChevronRight} />}
              radii="300"
              aria-pressed={!!categoryMenuAnchor}
              data-category-menu-trigger="true"
            >
              <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                选择分类
              </Text>
            </MenuItem>
          </PopOut>
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
              {'\u623f\u95f4\u8bbe\u7f6e'}
            </Text>
          </MenuItem>
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
                    {'\u9000\u51fa\u623f\u95f4'}
                  </Text>
                </MenuItem>
                {promptLeave && (
                  <LeaveRoomPrompt
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
  }
);

function CallChatToggle() {
  const [chat, setChat] = useAtom(callChatAtom);

  return (
    <IconButton
      onClick={() => setChat(!chat)}
      aria-pressed={chat}
      aria-label="切换聊天"
      variant="Background"
      fill="None"
      size="300"
      radii="300"
    >
      <Icon size="50" src={Icons.Message} filled={chat} />
    </IconButton>
  );
}

type RoomNavItemProps = {
  room: Room;
  selected: boolean;
  linkPath: string;
  categoryScope: string;
  notificationMode?: RoomNotificationMode;
  showAvatar?: boolean;
  direct?: boolean;
};
export function RoomNavItem({
  room,
  selected,
  showAvatar,
  direct,
  categoryScope,
  notificationMode,
  linkPath,
}: RoomNavItemProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [hover, setHover] = useState(false);
  const { hoverProps } = useHover({ onHoverChange: setHover });
  const { focusWithinProps } = useFocusWithin({ onFocusWithinChange: setHover });
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
  const typingMember = useRoomTypingMember(room.roomId).filter(
    (receipt) => receipt.userId !== mx.getUserId()
  );

  const roomName = useRoomName(room);

  const handleContextMenu: MouseEventHandler<HTMLElement> = (evt) => {
    evt.preventDefault();
    setMenuAnchor({
      x: evt.clientX,
      y: evt.clientY,
      width: 0,
      height: 0,
    });
  };

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const optionsVisible = hover || !!menuAnchor;
  const callSession = useCallSession(room);
  const callMembers = useCallMembers(room, callSession);
  const startCall = useCallStart(direct);
  const callEmbed = useCallEmbed();
  const callPref = useAtomValue(useCallPreferencesAtom());
  const autoDiscoveryInfo = useAutoDiscoveryInfo();

  const handleStartCall: MouseEventHandler<HTMLAnchorElement> = (evt) => {
    // Do not join if no livekit support or call is not started by others
    if (!livekitSupport(autoDiscoveryInfo) && callMembers.length === 0) {
      return;
    }

    // Do not join if already in call
    if (callEmbed) {
      return;
    }
    // Start call in second click
    if (selected) {
      evt.preventDefault();
      startCall(room, callPref);
    }
  };

  return (
    <NavItem
      variant="Background"
      radii="400"
      highlight={unread !== undefined}
      aria-selected={selected}
      data-hover={!!menuAnchor}
      onContextMenu={handleContextMenu}
      {...hoverProps}
      {...focusWithinProps}
    >
      <NavLink to={linkPath} onClick={room.isCallRoom() ? handleStartCall : undefined}>
        <NavItemContent>
          <Box as="span" grow="Yes" alignItems="Center" gap="200">
            <Avatar size="200" radii="400">
              {showAvatar ? (
                <RoomAvatar
                  roomId={room.roomId}
                  src={
                    direct
                      ? getDirectRoomAvatarUrl(mx, room, 96, useAuthentication)
                      : getRoomAvatarUrl(mx, room, 96, useAuthentication)
                  }
                  alt={roomName}
                  renderFallback={() => (
                    <Text as="span" size="H6">
                      {nameInitials(roomName)}
                    </Text>
                  )}
                />
              ) : (
                <RoomIcon
                  style={{
                    opacity: unread ? config.opacity.P500 : config.opacity.P300,
                  }}
                  filled={selected}
                  size="100"
                  joinRule={room.getJoinRule()}
                  roomType={room.getType()}
                />
              )}
            </Avatar>
            <Box as="span" grow="Yes">
              <Text priority={unread ? '500' : '300'} as="span" size="Inherit" truncate>
                {roomName}
              </Text>
            </Box>
            {!optionsVisible && !unread && !selected && typingMember.length > 0 && (
              <Badge size="300" variant="Secondary" fill="Soft" radii="Pill" outlined>
                <TypingIndicator size="300" disableAnimation />
              </Badge>
            )}
            {!optionsVisible && unread && (
              <UnreadBadgeCenter>
                <UnreadBadge highlight={unread.highlight > 0} count={unread.total} />
              </UnreadBadgeCenter>
            )}
            {!optionsVisible && notificationMode !== RoomNotificationMode.Unset && (
              <Icon
                size="50"
                src={getRoomNotificationModeIcon(notificationMode)}
                aria-label={notificationMode}
              />
            )}
            {room.isCallRoom() && callMembers.length > 0 && (
              <Badge variant="Critical" fill="Solid" size="400">
                <Text as="span" size="L400" truncate>
                  {`${callMembers.length} \u4eba\u5728\u7ebf`}
                </Text>
              </Badge>
            )}
          </Box>
        </NavItemContent>
      </NavLink>
      {optionsVisible && (
        <NavItemOptions>
          {selected && (callEmbed?.roomId === room.roomId || room.isCallRoom()) && (
            <CallChatToggle />
          )}
          <PopOut
            id={`menu-${room.roomId}`}
            aria-expanded={!!menuAnchor}
            anchor={menuAnchor}
            offset={menuAnchor?.width === 0 ? 0 : undefined}
            alignOffset={menuAnchor?.width === 0 ? 0 : -5}
            position="Bottom"
            align={menuAnchor?.width === 0 ? 'Start' : 'End'}
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
                <RoomNavItemMenu
                  room={room}
                  requestClose={() => setMenuAnchor(undefined)}
                  notificationMode={notificationMode}
                  categoryScope={categoryScope}
                />
              </FocusTrap>
            }
          >
            <IconButton
              onClick={handleOpenMenu}
              aria-pressed={!!menuAnchor}
              aria-controls={`menu-${room.roomId}`}
              aria-label="更多选项"
              variant="Background"
              fill="None"
              size="300"
              radii="300"
            >
              <Icon size="50" src={Icons.VerticalDots} />
            </IconButton>
          </PopOut>
        </NavItemOptions>
      )}
    </NavItem>
  );
}
