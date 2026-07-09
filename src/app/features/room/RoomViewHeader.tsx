import React, { MouseEventHandler, forwardRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Avatar,
  Text,
  Overlay,
  OverlayCenter,
  OverlayBackdrop,
  IconButton,
  Icon,
  Icons,
  Tooltip,
  TooltipProvider,
  Menu,
  MenuItem,
  toRem,
  config,
  Line,
  PopOut,
  RectCords,
  Badge,
  Spinner,
} from 'folds';
import { EventType, MatrixError, Room } from 'matrix-js-sdk';
import { PageHeader } from '../../components/page';
import { RoomAvatar, RoomIcon } from '../../components/room-avatar';
import { UseStateProvider } from '../../components/UseStateProvider';
import { RoomTopicViewer } from '../../components/room-topic-viewer';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useIsDirectRoom, useRoom } from '../../hooks/useRoom';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { useSpaceOptionally } from '../../hooks/useSpace';
import { getCanonicalAliasOrRoomId, isRoomAlias, mxcUrlToHttp } from '../../utils/matrix';
import * as css from './RoomViewHeader.css';
import { useRoomUnread } from '../../state/hooks/unread';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import { markAsRead } from '../../utils/notifications';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { copyToClipboard } from '../../utils/dom';
import { LeaveRoomPrompt } from '../../components/leave-room-prompt';
import { useRoomAvatar, useRoomName, useRoomTopic } from '../../hooks/useRoomMeta';
import {
  isCompactScreenSize,
  isDesktopLikeScreenSize,
  useScreenSizeContext,
} from '../../hooks/useScreenSize';
import { stopPropagation } from '../../utils/keyboard';
import { getMatrixToRoom } from '../../plugins/matrix-to';
import { getViaServers } from '../../plugins/via-servers';
import { BackRouteHandler } from '../../components/BackRouteHandler';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useRoomPinnedEvents } from '../../hooks/useRoomPinnedEvents';
import { RoomPinMenu } from './room-pin-menu';
import { useOpenRoomSettings } from '../../state/hooks/roomSettings';
import { RoomNotificationModeSwitcher } from '../../components/RoomNotificationSwitcher';
import {
  getRoomNotificationMode,
  getRoomNotificationModeIcon,
  useRoomsNotificationPreferencesContext,
} from '../../hooks/useRoomsNotificationPreferences';
import { JumpToTime } from './jump-to-time';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { InviteUserPrompt } from '../../components/invite-user-prompt';
import { ContainerColor } from '../../styles/ContainerColor.css';
import { RoomSettingsPage } from '../../state/roomSettings';
import { RoomMessageSearchDialog } from '../message-search';
import { StartJitsiMeetButton, StartJitsiMeetPrompt } from '../../components/jitsi-meet';
import { createJitsiMeetInfo, makeJitsiMeetMessageContent } from '../../utils/jitsiMeet';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { useAgoraVoice } from '../agora-voice';
import { getAllVersionsRoomCreator } from '../../utils/room';

type RoomMenuProps = {
  room: Room;
  canStartVoiceTest?: boolean;
  onStartVoiceTest?: () => void;
  requestClose: () => void;
};
const RoomMenu = forwardRef<HTMLDivElement, RoomMenuProps>(
  ({ room, canStartVoiceTest, onStartVoiceTest, requestClose }, ref) => {
    const mx = useMatrixClient();
    const [sendReadReceipts] = useSetting(settingsAtom, 'sendReadReceipts');
    const unread = useRoomUnread(room.roomId, roomToUnreadAtom);
    const powerLevels = usePowerLevelsContext();
    const creators = useRoomCreators(room);

    const permissions = useRoomPermissions(creators, powerLevels);
    const canInvite = permissions.action('invite', mx.getSafeUserId());
    const notificationPreferences = useRoomsNotificationPreferencesContext();
    const notificationMode = getRoomNotificationMode(notificationPreferences, room.roomId);
    const { navigateRoom } = useRoomNavigate();

    const [invitePrompt, setInvitePrompt] = useState(false);

    const handleMarkAsRead = () => {
      markAsRead(mx, room.roomId, !sendReadReceipts);
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

    const openSettings = useOpenRoomSettings();
    const parentSpace = useSpaceOptionally();
    const handleOpenSettings = () => {
      openSettings(room.roomId, parentSpace?.roomId);
      requestClose();
    };

    const handleStartVoiceTest = () => {
      onStartVoiceTest?.();
      requestClose();
    };

    return (
      <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
        {invitePrompt && (
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
          {canStartVoiceTest && (
            <MenuItem
              onClick={handleStartVoiceTest}
              size="300"
              after={<Icon size="100" src={Icons.Phone} />}
              radii="300"
            >
              <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                语音自测
              </Text>
            </MenuItem>
          )}
          <MenuItem
            onClick={handleOpenSettings}
            size="300"
            after={<Icon size="100" src={Icons.Setting} />}
            radii="300"
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              {'\u623f\u95f4\u8bbe\u7f6e'}
            </Text>
          </MenuItem>
          <UseStateProvider initial={false}>
            {(promptJump, setPromptJump) => (
              <>
                <MenuItem
                  onClick={() => setPromptJump(true)}
                  size="300"
                  after={<Icon size="100" src={Icons.RecentClock} />}
                  radii="300"
                  aria-pressed={promptJump}
                >
                  <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                    {'\u8df3\u8f6c\u5230\u6307\u5b9a\u65f6\u95f4'}
                  </Text>
                </MenuItem>
                {promptJump && (
                  <JumpToTime
                    onSubmit={(eventId) => {
                      setPromptJump(false);
                      navigateRoom(room.roomId, eventId);
                      requestClose();
                    }}
                    onCancel={() => setPromptJump(false)}
                  />
                )}
              </>
            )}
          </UseStateProvider>
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

export function RoomViewHeader({ callView }: { callView?: boolean }) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const screenSize = useScreenSizeContext();
  const room = useRoom();
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const [pinMenuAnchor, setPinMenuAnchor] = useState<RectCords>();
  const [messageSearch, setMessageSearch] = useState(false);
  const [meetingPrompt, setMeetingPrompt] = useState(false);
  const direct = useIsDirectRoom();
  const agoraVoice = useAgoraVoice();
  const parentSpace = useSpaceOptionally();

  const pinnedEvents = useRoomPinnedEvents(room);
  const avatarMxc = useRoomAvatar(room, direct);
  const name = useRoomName(room);
  const topic = useRoomTopic(room);
  const avatarUrl = avatarMxc
    ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  const [peopleDrawer, setPeopleDrawer] = useSetting(settingsAtom, 'isPeopleDrawer');
  const desktopLayout = isDesktopLikeScreenSize(screenSize);
  const compact = isCompactScreenSize(screenSize) && !desktopLayout;
  let headerTitleSize: 'H3' | 'H4' | 'H5' = 'H3';
  if (compact) headerTitleSize = 'H4';
  else if (topic) headerTitleSize = 'H5';

  const handleSearchClick = () => {
    setMessageSearch(true);
  };

  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);
  const myUserId = mx.getSafeUserId();
  const canStartMeeting = permissions.event(EventType.RoomMessage, myUserId);
  const roomCreators = getAllVersionsRoomCreator(room);
  const parentSpaceCreators = parentSpace ? getAllVersionsRoomCreator(parentSpace) : undefined;
  const ownTestRoom =
    !direct && (roomCreators.has(myUserId) || !!parentSpaceCreators?.has(myUserId));
  const voiceEnabledRoom = direct || ownTestRoom;
  const canStartVoice = voiceEnabledRoom && canStartMeeting && agoraVoice.available;
  const [meetingState, startMeeting] = useAsyncCallback<undefined, MatrixError | Error, [string]>(
    async (title) => {
      const nextMeeting = createJitsiMeetInfo(title);
      const content = makeJitsiMeetMessageContent(nextMeeting);
      await mx.sendMessage(room.roomId, content as never);
      return undefined;
    }
  );
  const meetingSending = meetingState.status === AsyncStatus.Loading;
  const meetingError = meetingState.status === AsyncStatus.Error;

  const handleStartMeeting = () => {
    setMeetingPrompt(true);
  };

  const handleStartVoice = () => {
    agoraVoice
      .startCall(room, { allowSelfTarget: ownTestRoom, roomCall: ownTestRoom })
      .catch(() => undefined);
  };

  const handleStartVoiceTest = () => {
    agoraVoice.startSelfTest().catch(() => undefined);
  };

  const handleSubmitMeeting = (title: string) => {
    startMeeting(title)
      .then(() => setMeetingPrompt(false))
      .catch(() => undefined);
  };

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const handleOpenPinMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setPinMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const openSettings = useOpenRoomSettings();
  const handleMemberToggle = () => {
    if (callView) {
      openSettings(room.roomId, parentSpace?.roomId, RoomSettingsPage.MembersPage);
      return;
    }
    setPeopleDrawer(!peopleDrawer);
  };

  let voiceTooltip = '\u8bed\u97f3\u901a\u8bdd\u672a\u914d\u7f6e';
  if (canStartVoice) {
    voiceTooltip = '\u8bed\u97f3\u901a\u8bdd';
  } else if (agoraVoice.available) {
    voiceTooltip = '\u65e0\u6743\u9650\u53d1\u8d77\u8bed\u97f3\u901a\u8bdd';
  }

  let meetingTooltip = '\u65e0\u6743\u9650\u53d1\u8d77\u4f1a\u8bae';
  if (meetingError) {
    meetingTooltip = '\u53d1\u8d77\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5';
  } else if (canStartMeeting) {
    meetingTooltip = '\u4f1a\u8bae';
  }

  return (
    <>
      {messageSearch && (
        <RoomMessageSearchDialog
          room={room}
          direct={direct}
          requestClose={() => setMessageSearch(false)}
        />
      )}
      {meetingPrompt && (
        <StartJitsiMeetPrompt
          submitting={meetingSending}
          error={meetingError ? '\u53d1\u8d77\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5' : undefined}
          requestClose={() => setMeetingPrompt(false)}
          onSubmit={handleSubmitMeeting}
        />
      )}
      <PageHeader className={ContainerColor({ variant: 'Surface' })} balance={compact}>
        <Box grow="Yes" gap={compact ? '200' : '300'} style={{ minWidth: 0 }}>
          {compact && (
            <BackRouteHandler>
              {(onBack) => (
                <Box shrink="No" alignItems="Center">
                  <IconButton fill="None" onClick={onBack}>
                    <Icon src={Icons.ArrowLeft} />
                  </IconButton>
                </Box>
              )}
            </BackRouteHandler>
          )}
          <Box grow="Yes" alignItems="Center" gap={compact ? '200' : '300'} style={{ minWidth: 0 }}>
            {!compact && (
              <Avatar size="300">
                <RoomAvatar
                  roomId={room.roomId}
                  src={avatarUrl}
                  alt={name}
                  renderFallback={() => (
                    <RoomIcon size="200" joinRule={room.getJoinRule()} roomType={room.getType()} />
                  )}
                />
              </Avatar>
            )}
            <Box direction="Column" style={{ minWidth: 0 }}>
              <Text size={headerTitleSize} truncate>
                {name}
              </Text>
              {topic && (
                <UseStateProvider initial={false}>
                  {(viewTopic, setViewTopic) => (
                    <>
                      <Overlay open={viewTopic} backdrop={<OverlayBackdrop />}>
                        <OverlayCenter>
                          <FocusTrap
                            focusTrapOptions={{
                              initialFocus: false,
                              clickOutsideDeactivates: true,
                              onDeactivate: () => setViewTopic(false),
                              escapeDeactivates: stopPropagation,
                            }}
                          >
                            <RoomTopicViewer
                              name={name}
                              topic={topic}
                              requestClose={() => setViewTopic(false)}
                            />
                          </FocusTrap>
                        </OverlayCenter>
                      </Overlay>
                      <Text
                        as="button"
                        type="button"
                        onClick={() => setViewTopic(true)}
                        className={css.HeaderTopic}
                        size="T200"
                        priority="300"
                        truncate
                      >
                        {topic}
                      </Text>
                    </>
                  )}
                </UseStateProvider>
              )}
            </Box>
          </Box>

          <Box shrink="No">
            {!callView && voiceEnabledRoom && (
              <TooltipProvider
                position="Bottom"
                offset={4}
                tooltip={
                  <Tooltip>
                    <Text>{voiceTooltip}</Text>
                  </Tooltip>
                }
              >
                {(triggerRef) => (
                  <IconButton
                    fill="None"
                    ref={triggerRef}
                    onClick={handleStartVoice}
                    disabled={!canStartVoice}
                    aria-pressed={agoraVoice.activeRoomId === room.roomId}
                  >
                    <Icon
                      size="400"
                      src={Icons.Phone}
                      filled={agoraVoice.activeRoomId === room.roomId}
                    />
                  </IconButton>
                )}
              </TooltipProvider>
            )}
            {!callView && (
              <TooltipProvider
                position="Bottom"
                offset={4}
                tooltip={
                  <Tooltip>
                    <Text>{meetingTooltip}</Text>
                  </Tooltip>
                }
              >
                {(triggerRef) => (
                  <StartJitsiMeetButton
                    ref={triggerRef}
                    sending={meetingSending}
                    disabled={!canStartMeeting}
                    onStart={handleStartMeeting}
                  />
                )}
              </TooltipProvider>
            )}
            <TooltipProvider
              position="Bottom"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>{'\u641c\u7d22'}</Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton fill="None" ref={triggerRef} onClick={handleSearchClick}>
                  <Icon size="400" src={Icons.Search} />
                </IconButton>
              )}
            </TooltipProvider>
            <TooltipProvider
              position="Bottom"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>{'\u7f6e\u9876\u6d88\u606f'}</Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton
                  fill="None"
                  style={{ position: 'relative' }}
                  onClick={handleOpenPinMenu}
                  ref={triggerRef}
                  aria-pressed={!!pinMenuAnchor}
                >
                  {pinnedEvents.length > 0 && (
                    <Badge
                      style={{
                        position: 'absolute',
                        left: toRem(3),
                        top: toRem(3),
                      }}
                      variant="Secondary"
                      size="400"
                      fill="Solid"
                      radii="Pill"
                    >
                      <Text as="span" size="L400">
                        {pinnedEvents.length}
                      </Text>
                    </Badge>
                  )}
                  <Icon size="400" src={Icons.Pin} filled={!!pinMenuAnchor} />
                </IconButton>
              )}
            </TooltipProvider>
            <PopOut
              anchor={pinMenuAnchor}
              position="Bottom"
              content={
                <FocusTrap
                  focusTrapOptions={{
                    initialFocus: false,
                    returnFocusOnDeactivate: false,
                    onDeactivate: () => setPinMenuAnchor(undefined),
                    clickOutsideDeactivates: true,
                    isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                    isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                    escapeDeactivates: stopPropagation,
                  }}
                >
                  <RoomPinMenu room={room} requestClose={() => setPinMenuAnchor(undefined)} />
                </FocusTrap>
              }
            />

            {desktopLayout && (
              <TooltipProvider
                position="Bottom"
                offset={4}
                tooltip={
                  <Tooltip>
                    {callView ? (
                      <Text>{'\u6210\u5458'}</Text>
                    ) : (
                      <Text>
                        {peopleDrawer ? '\u9690\u85cf\u6210\u5458' : '\u663e\u793a\u6210\u5458'}
                      </Text>
                    )}
                  </Tooltip>
                }
              >
                {(triggerRef) => (
                  <IconButton fill="None" ref={triggerRef} onClick={handleMemberToggle}>
                    <Icon size="400" src={Icons.User} />
                  </IconButton>
                )}
              </TooltipProvider>
            )}

            <TooltipProvider
              position="Bottom"
              align="End"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>{'\u66f4\u591a\u9009\u9879'}</Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton
                  fill="None"
                  onClick={handleOpenMenu}
                  ref={triggerRef}
                  aria-pressed={!!menuAnchor}
                >
                  <Icon size="400" src={Icons.VerticalDots} filled={!!menuAnchor} />
                </IconButton>
              )}
            </TooltipProvider>
            <PopOut
              anchor={menuAnchor}
              position="Bottom"
              align="End"
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
                  <RoomMenu
                    room={room}
                    canStartVoiceTest={agoraVoice.available}
                    onStartVoiceTest={handleStartVoiceTest}
                    requestClose={() => setMenuAnchor(undefined)}
                  />
                </FocusTrap>
              }
            />
          </Box>
        </Box>
      </PageHeader>
    </>
  );
}
