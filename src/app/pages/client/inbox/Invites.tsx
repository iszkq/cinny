import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  Icon,
  IconButton,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Spinner,
  Text,
  color,
  config,
} from 'folds';
import { useAtomValue } from 'jotai';
import { RoomTopicEventContent } from 'matrix-js-sdk/lib/types';
import FocusTrap from 'focus-trap-react';
import { MatrixClient, MatrixError, Room } from 'matrix-js-sdk';
import {
  Page,
  PageContent,
  PageContentCenter,
  PageHeader,
  PageHero,
  PageHeroSection,
} from '../../../components/page';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { allInvitesAtom } from '../../../state/room-list/inviteList';
import { SequenceCard } from '../../../components/sequence-card';
import {
  bannedInRooms,
  getCommonRooms,
  getDirectRoomAvatarUrl,
  getMemberDisplayName,
  getRoomAvatarUrl,
  getStateEvent,
  isDirectInvite,
  isSpace,
} from '../../../utils/room';
import { nameInitials } from '../../../utils/common';
import { RoomAvatar } from '../../../components/room-avatar';
import {
  addRoomIdToMDirect,
  getMxIdLocalPart,
  guessDmRoomUserId,
  rateLimitedActions,
} from '../../../utils/matrix';
import { Time } from '../../../components/message';
import { useElementSizeObserver } from '../../../hooks/useElementSizeObserver';
import { onEnterOrSpace, stopPropagation } from '../../../utils/keyboard';
import { RoomTopicViewer } from '../../../components/room-topic-viewer';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useRoomNavigate } from '../../../hooks/useRoomNavigate';
import { isCompactScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { StateEvent } from '../../../../types/matrix/room';
import { testBadWords } from '../../../plugins/bad-words';
import { allRoomsAtom } from '../../../state/room-list/roomList';
import { useIgnoredUsers } from '../../../hooks/useIgnoredUsers';
import { useReportRoomSupported } from '../../../hooks/useReportRoomSupported';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';

const COMPACT_CARD_WIDTH = 548;
const GLASS_CARD_STYLE = {
  background: 'rgba(255, 255, 255, 0.58)',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  boxShadow: '0 16px 42px rgba(15, 23, 42, 0.06)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
} as const;
const GLASS_EMPTY_STYLE = {
  ...GLASS_CARD_STYLE,
  padding: config.space.S400,
  borderRadius: config.radii.R400,
  minHeight: '320px',
} as const;

type InviteData = {
  room: Room;
  roomId: string;
  roomName: string;
  roomAvatar?: string;
  roomTopic?: string;
  roomAlias?: string;

  senderId: string;
  senderName: string;
  inviteTs?: number;
  reason?: string;

  isSpace: boolean;
  isDirect: boolean;
  isEncrypted: boolean;
};

const makeInviteData = (mx: MatrixClient, room: Room, useAuthentication: boolean): InviteData => {
  const userId = mx.getSafeUserId();
  const direct = isDirectInvite(room, userId);

  const roomAvatar = direct
    ? getDirectRoomAvatarUrl(mx, room, 96, useAuthentication)
    : getRoomAvatarUrl(mx, room, 96, useAuthentication);
  const roomName = room.name || room.getCanonicalAlias() || room.roomId;
  const roomTopic =
    getStateEvent(room, StateEvent.RoomTopic)?.getContent<RoomTopicEventContent>()?.topic ??
    undefined;

  const member = room.getMember(userId);
  const memberEvent = member?.events.member;

  const content = memberEvent?.getContent();
  const senderId = memberEvent?.getSender();

  const senderName = senderId
    ? getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? senderId
    : undefined;
  const inviteTs = memberEvent?.getTs();
  const reason =
    content && 'reason' in content && typeof content.reason === 'string'
      ? content.reason
      : undefined;

  return {
    room,
    roomId: room.roomId,
    roomAvatar,
    roomName,
    roomTopic,
    roomAlias: room.getCanonicalAlias() ?? undefined,

    senderId: senderId ?? '\u672a\u77e5',
    senderName: senderName ?? '\u672a\u77e5',
    inviteTs,
    reason,

    isSpace: isSpace(room),
    isDirect: direct,
    isEncrypted: !!getStateEvent(room, StateEvent.RoomEncryption),
  };
};

const hasBadWords = (invite: InviteData): boolean =>
  testBadWords(invite.roomName) ||
  testBadWords(invite.roomTopic ?? '') ||
  testBadWords(invite.senderName) ||
  testBadWords(invite.senderId) ||
  testBadWords(invite.reason || '');

type NavigateHandler = (roomId: string, space: boolean) => void;

type InviteCardProps = {
  invite: InviteData;
  compact?: boolean;
  hour24Clock: boolean;
  dateFormatString: string;
  onNavigate: NavigateHandler;
  hideAvatar: boolean;
};
function InviteCard({
  invite,
  compact,
  hour24Clock,
  dateFormatString,
  onNavigate,
  hideAvatar,
}: InviteCardProps) {
  const mx = useMatrixClient();
  const userId = mx.getSafeUserId();

  const [viewTopic, setViewTopic] = useState(false);
  const closeTopic = () => setViewTopic(false);
  const openTopic = () => setViewTopic(true);

  const [joinState, join] = useAsyncCallback<void, MatrixError, []>(
    useCallback(async () => {
      const dmUserId = isDirectInvite(invite.room, userId)
        ? guessDmRoomUserId(invite.room, userId)
        : undefined;

      await mx.joinRoom(invite.roomId);
      if (dmUserId) {
        await addRoomIdToMDirect(mx, invite.roomId, dmUserId);
      }
      onNavigate(invite.roomId, invite.isSpace);
    }, [mx, invite, userId, onNavigate])
  );
  const [leaveState, leave] = useAsyncCallback<Record<string, never>, MatrixError, []>(
    useCallback(() => mx.leave(invite.roomId), [mx, invite])
  );

  const joining =
    joinState.status === AsyncStatus.Loading || joinState.status === AsyncStatus.Success;
  const leaving =
    leaveState.status === AsyncStatus.Loading || leaveState.status === AsyncStatus.Success;

  return (
    <SequenceCard
      variant="Background"
      direction="Column"
      gap="300"
      style={{ ...GLASS_CARD_STYLE, padding: config.space.S400 }}
    >
      {(invite.isEncrypted || invite.isDirect || invite.isSpace) && (
        <Box gap="200" alignItems="Center">
          {invite.isEncrypted && (
            <Box shrink="No" alignItems="Center" justifyContent="Center">
              <Badge variant="Success" fill="Solid" size="400" radii="300">
                <Text size="L400">{'\u5df2\u52a0\u5bc6'}</Text>
              </Badge>
            </Box>
          )}
          {invite.isDirect && (
            <Box shrink="No" alignItems="Center" justifyContent="Center">
              <Badge variant="Primary" fill="Solid" size="400" radii="300">
                <Text size="L400">{'\u79c1\u804a'}</Text>
              </Badge>
            </Box>
          )}
          {invite.isSpace && (
            <Box shrink="No" alignItems="Center" justifyContent="Center">
              <Badge variant="Secondary" fill="Soft" size="400" radii="300">
                <Text size="L400">{'\u7a7a\u95f4'}</Text>
              </Badge>
            </Box>
          )}
        </Box>
      )}
      <Box gap="300">
        <Avatar size="300">
          <RoomAvatar
            roomId={invite.roomId}
            src={hideAvatar ? undefined : invite.roomAvatar}
            alt={invite.roomName}
            renderFallback={() => (
              <Text as="span" size="H6">
                {nameInitials(hideAvatar && invite.roomAvatar ? undefined : invite.roomName)}
              </Text>
            )}
          />
        </Avatar>
        <Box direction={compact ? 'Column' : 'Row'} grow="Yes" gap="200">
          <Box grow="Yes" direction="Column" gap="200">
            <Box direction="Column">
              <Text size="T300" truncate>
                <b>{invite.roomName}</b>
              </Text>
              {invite.roomTopic && (
                <Text
                  size="T200"
                  onClick={openTopic}
                  onKeyDown={onEnterOrSpace(openTopic)}
                  tabIndex={0}
                  truncate
                >
                  {invite.roomTopic}
                </Text>
              )}
              <Overlay open={viewTopic} backdrop={<OverlayBackdrop />}>
                <OverlayCenter>
                  <FocusTrap
                    focusTrapOptions={{
                      initialFocus: false,
                      clickOutsideDeactivates: true,
                      onDeactivate: closeTopic,
                      escapeDeactivates: stopPropagation,
                    }}
                  >
                    <RoomTopicViewer
                      name={invite.roomName}
                      topic={invite.roomTopic ?? ''}
                      requestClose={closeTopic}
                    />
                  </FocusTrap>
                </OverlayCenter>
              </Overlay>
            </Box>
            {joinState.status === AsyncStatus.Error && (
              <Text size="T200" style={{ color: color.Critical.Main }}>
                {joinState.error.message}
              </Text>
            )}
            {leaveState.status === AsyncStatus.Error && (
              <Text size="T200" style={{ color: color.Critical.Main }}>
                {leaveState.error.message}
              </Text>
            )}
          </Box>
          <Box gap="200" shrink="No" alignItems="Center">
            <Button
              onClick={leave}
              size="300"
              variant="Secondary"
              radii="300"
              fill="Soft"
              disabled={joining || leaving}
              before={leaving ? <Spinner variant="Secondary" size="100" /> : undefined}
            >
              <Text size="B300">{'\u62d2\u7edd'}</Text>
            </Button>
            <Button
              onClick={join}
              size="300"
              variant="Success"
              fill="Soft"
              radii="300"
              outlined
              disabled={joining || leaving}
              before={joining ? <Spinner variant="Success" fill="Soft" size="100" /> : undefined}
            >
              <Text size="B300">{'\u63a5\u53d7'}</Text>
            </Button>
          </Box>
        </Box>
      </Box>
      <Box direction="Column">
        <Box gap="200" alignItems="Baseline">
          <Box grow="Yes">
            <Text size="T200" priority="300">
              {'\u6765\u81ea\uff1a'}
              <b>{invite.senderId}</b>
            </Text>
          </Box>
          {typeof invite.inviteTs === 'number' && invite.inviteTs !== 0 && (
            <Box shrink="No">
              <Time
                size="T200"
                ts={invite.inviteTs}
                hour24Clock={hour24Clock}
                dateFormatString={dateFormatString}
                priority="300"
              />
            </Box>
          )}
        </Box>
        {invite.reason && (
          <Text size="T200" priority="300">
            {'\u539f\u56e0\uff1a'}
            {invite.reason}
          </Text>
        )}
      </Box>
    </SequenceCard>
  );
}

enum InviteFilter {
  Known,
  Unknown,
  Spam,
}
type InviteFiltersProps = {
  filter: InviteFilter;
  onFilter: (filter: InviteFilter) => void;
  knownInvites: InviteData[];
  unknownInvites: InviteData[];
  spamInvites: InviteData[];
};
function InviteFilters({
  filter,
  onFilter,
  knownInvites,
  unknownInvites,
  spamInvites,
}: InviteFiltersProps) {
  const isKnown = filter === InviteFilter.Known;
  const isUnknown = filter === InviteFilter.Unknown;
  const isSpam = filter === InviteFilter.Spam;

  return (
    <Box gap="200">
      <Chip
        variant={isKnown ? 'Success' : 'Surface'}
        aria-selected={isKnown}
        outlined={!isKnown}
        onClick={() => onFilter(InviteFilter.Known)}
        before={isKnown && <Icon size="100" src={Icons.Check} />}
        after={
          knownInvites.length > 0 && (
            <Badge variant={isKnown ? 'Success' : 'Secondary'} fill="Solid" radii="Pill">
              <Text size="L400">{knownInvites.length}</Text>
            </Badge>
          )
        }
      >
        <Text size="T200">{'\u719f\u4eba'}</Text>
      </Chip>
      <Chip
        variant={isUnknown ? 'Warning' : 'Surface'}
        aria-selected={isUnknown}
        outlined={!isUnknown}
        onClick={() => onFilter(InviteFilter.Unknown)}
        before={isUnknown && <Icon size="100" src={Icons.Check} />}
        after={
          unknownInvites.length > 0 && (
            <Badge variant={isUnknown ? 'Warning' : 'Secondary'} fill="Solid" radii="Pill">
              <Text size="L400">{unknownInvites.length}</Text>
            </Badge>
          )
        }
      >
        <Text size="T200">{'\u964c\u751f\u4eba'}</Text>
      </Chip>
      <Chip
        variant={isSpam ? 'Critical' : 'Surface'}
        aria-selected={isSpam}
        outlined={!isSpam}
        onClick={() => onFilter(InviteFilter.Spam)}
        before={isSpam && <Icon size="100" src={Icons.Check} />}
        after={
          spamInvites.length > 0 && (
            <Badge variant={isSpam ? 'Critical' : 'Secondary'} fill="Solid" radii="Pill">
              <Text size="L400">{spamInvites.length}</Text>
            </Badge>
          )
        }
      >
        <Text size="T200">{'\u5783\u573e'}</Text>
      </Chip>
    </Box>
  );
}

type KnownInvitesProps = {
  invites: InviteData[];
  handleNavigate: NavigateHandler;
  compact: boolean;
  hour24Clock: boolean;
  dateFormatString: string;
};
function KnownInvites({
  invites,
  handleNavigate,
  compact,
  hour24Clock,
  dateFormatString,
}: KnownInvitesProps) {
  return (
    <Box direction="Column" gap="200">
      <Text size="H4">{'\u719f\u4eba'}</Text>
      {invites.length > 0 ? (
        <Box direction="Column" gap="100">
          {invites.map((invite) => (
            <InviteCard
              key={invite.roomId}
              invite={invite}
              compact={compact}
              hour24Clock={hour24Clock}
              dateFormatString={dateFormatString}
              onNavigate={handleNavigate}
              hideAvatar={false}
            />
          ))}
        </Box>
      ) : (
        <Box
          direction="Column"
          alignItems="Center"
          justifyContent="Center"
          gap="200"
          style={GLASS_EMPTY_STYLE}
        >
          <PageHeroSection>
            <PageHero
              icon={<Icon size="600" src={Icons.Mail} />}
              title={'\u6682\u65e0\u9080\u8bf7'}
              subTitle={
                '\u5f53\u4f60\u7684\u540c\u623f\u6210\u5458\u5411\u4f60\u53d1\u51fa\u9080\u8bf7\u65f6\uff0c\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002'
              }
            />
          </PageHeroSection>
        </Box>
      )}
    </Box>
  );
}

type UnknownInvitesProps = {
  invites: InviteData[];
  handleNavigate: NavigateHandler;
  compact: boolean;
  hour24Clock: boolean;
  dateFormatString: string;
};
function UnknownInvites({
  invites,
  handleNavigate,
  compact,
  hour24Clock,
  dateFormatString,
}: UnknownInvitesProps) {
  const mx = useMatrixClient();

  const [declineAllStatus, declineAll] = useAsyncCallback(
    useCallback(async () => {
      const roomIds = invites.map((invite) => invite.roomId);

      await rateLimitedActions(roomIds, (roomId) => mx.leave(roomId));
    }, [mx, invites])
  );

  const declining = declineAllStatus.status === AsyncStatus.Loading;

  return (
    <Box direction="Column" gap="200">
      <Box gap="200" justifyContent="SpaceBetween" alignItems="Center">
        <Text size="H4">{'\u964c\u751f\u4eba'}</Text>
        <Box>
          {invites.length > 0 && (
            <Chip
              variant="SurfaceVariant"
              onClick={declineAll}
              before={declining && <Spinner size="50" variant="Secondary" fill="Soft" />}
              disabled={declining}
              radii="Pill"
            >
              <Text size="T200">{'\u5168\u90e8\u62d2\u7edd'}</Text>
            </Chip>
          )}
        </Box>
      </Box>
      {invites.length > 0 ? (
        <Box direction="Column" gap="100">
          {invites.map((invite) => (
            <InviteCard
              key={invite.roomId}
              invite={invite}
              compact={compact}
              hour24Clock={hour24Clock}
              dateFormatString={dateFormatString}
              onNavigate={handleNavigate}
              hideAvatar
            />
          ))}
        </Box>
      ) : (
        <Box
          direction="Column"
          alignItems="Center"
          justifyContent="Center"
          gap="200"
          style={GLASS_EMPTY_STYLE}
        >
          <PageHeroSection>
            <PageHero
              icon={<Icon size="600" src={Icons.Info} />}
              title={'\u6682\u65e0\u9080\u8bf7'}
              subTitle={'\u6765\u81ea\u672a\u540c\u623f\u7528\u6237\u7684\u9080\u8bf7\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002'}
            />
          </PageHeroSection>
        </Box>
      )}
    </Box>
  );
}

type SpamInvitesProps = {
  invites: InviteData[];
  handleNavigate: NavigateHandler;
  compact: boolean;
  hour24Clock: boolean;
  dateFormatString: string;
};
function SpamInvites({
  invites,
  handleNavigate,
  compact,
  hour24Clock,
  dateFormatString,
}: SpamInvitesProps) {
  const mx = useMatrixClient();
  const [showInvites, setShowInvites] = useState(false);

  const reportRoomSupported = useReportRoomSupported();

  const [declineAllStatus, declineAll] = useAsyncCallback(
    useCallback(async () => {
      const roomIds = invites.map((invite) => invite.roomId);

      await rateLimitedActions(roomIds, (roomId) => mx.leave(roomId));
    }, [mx, invites])
  );

  const [reportAllStatus, reportAll] = useAsyncCallback(
    useCallback(async () => {
      const roomIds = invites.map((invite) => invite.roomId);

      await rateLimitedActions(roomIds, (roomId) => mx.reportRoom(roomId, 'Spam Invite'));
    }, [mx, invites])
  );

  const ignoredUsers = useIgnoredUsers();
  const unignoredUsers = Array.from(new Set(invites.map((invite) => invite.senderId))).filter(
    (user) => !ignoredUsers.includes(user)
  );
  const [blockAllStatus, blockAll] = useAsyncCallback(
    useCallback(
      () => mx.setIgnoredUsers([...ignoredUsers, ...unignoredUsers]),
      [mx, ignoredUsers, unignoredUsers]
    )
  );

  const declining = declineAllStatus.status === AsyncStatus.Loading;
  const reporting = reportAllStatus.status === AsyncStatus.Loading;
  const blocking = blockAllStatus.status === AsyncStatus.Loading;
  const loading = blocking || reporting || declining;

  return (
    <Box direction="Column" gap="200">
      <Text size="H4">{'\u5783\u573e'}</Text>
      {invites.length > 0 ? (
        <Box direction="Column" gap="100">
          <SequenceCard
            variant="Background"
            direction="Column"
            gap="300"
            style={{ ...GLASS_CARD_STYLE, padding: `${config.space.S400} ${config.space.S400} 0` }}
          >
            <PageHeroSection>
              <PageHero
                icon={<Icon size="600" src={Icons.Warning} />}
                title={`${invites.length} \u6761\u5783\u573e\u9080\u8bf7`}
                subTitle={'\u4e0b\u65b9\u90e8\u5206\u9080\u8bf7\u53ef\u80fd\u5305\u542b\u6076\u610f\u5185\u5bb9\uff0c\u6216\u6765\u81ea\u5df2\u88ab\u5c4f\u853d\u7684\u7528\u6237\u3002'}
              >
                <Box direction="Row" gap="200" justifyContent="Center" wrap="Wrap">
                  <Button
                    size="300"
                    variant="Critical"
                    fill="Solid"
                    radii="300"
                    onClick={declineAll}
                    before={declining && <Spinner size="100" variant="Critical" fill="Solid" />}
                    disabled={loading}
                  >
                    <Text size="B300" truncate>
                      {'\u5168\u90e8\u62d2\u7edd'}
                    </Text>
                  </Button>
                  {reportRoomSupported && reportAllStatus.status !== AsyncStatus.Success && (
                    <Button
                      size="300"
                      variant="Secondary"
                      fill="Solid"
                      radii="300"
                      onClick={reportAll}
                      before={reporting && <Spinner size="100" variant="Secondary" fill="Solid" />}
                      disabled={loading}
                    >
                      <Text size="B300" truncate>
                        {'\u5168\u90e8\u4e3e\u62a5'}
                      </Text>
                    </Button>
                  )}
                  {unignoredUsers.length > 0 && (
                    <Button
                      size="300"
                      variant="Secondary"
                      fill="Solid"
                      radii="300"
                      disabled={loading}
                      onClick={blockAll}
                      before={blocking && <Spinner size="100" variant="Secondary" fill="Solid" />}
                    >
                      <Text size="B300" truncate>
                        {'\u5168\u90e8\u62c9\u9ed1'}
                      </Text>
                    </Button>
                  )}
                </Box>

                <span data-spacing-node />

                <Button
                  size="300"
                  variant="Secondary"
                  fill="Soft"
                  radii="Pill"
                  before={
                    <Icon size="100" src={showInvites ? Icons.ChevronTop : Icons.ChevronBottom} />
                  }
                  onClick={() => setShowInvites(!showInvites)}
                >
                  <Text size="B300">
                    {showInvites ? '\u6536\u8d77\u5168\u90e8' : '\u67e5\u770b\u5168\u90e8'}
                  </Text>
                </Button>
              </PageHero>
            </PageHeroSection>
          </SequenceCard>
          {showInvites &&
            invites.map((invite) => (
              <InviteCard
                key={invite.roomId}
                invite={invite}
                compact={compact}
                hour24Clock={hour24Clock}
                dateFormatString={dateFormatString}
                onNavigate={handleNavigate}
                hideAvatar
              />
            ))}
        </Box>
      ) : (
        <Box
          direction="Column"
          alignItems="Center"
          justifyContent="Center"
          gap="200"
          style={GLASS_EMPTY_STYLE}
        >
          <PageHeroSection>
            <PageHero
              icon={<Icon size="600" src={Icons.Warning} />}
              title={'\u6682\u65e0\u5783\u573e\u9080\u8bf7'}
              subTitle={'\u88ab\u8bc6\u522b\u4e3a\u5783\u573e\u7684\u9080\u8bf7\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002'}
            />
          </PageHeroSection>
        </Box>
      )}
    </Box>
  );
}

export function Invites() {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const { navigateRoom, navigateSpace } = useRoomNavigate();
  const allRooms = useAtomValue(allRoomsAtom);
  const allInviteIds = useAtomValue(allInvitesAtom);

  const [filter, setFilter] = useState(InviteFilter.Known);

  const invitesData = allInviteIds
    .map((inviteId) => mx.getRoom(inviteId))
    .filter((inviteRoom) => !!inviteRoom)
    .map((inviteRoom) => makeInviteData(mx, inviteRoom, useAuthentication));

  const [knownInvites, unknownInvites, spamInvites] = useMemo(() => {
    const known: InviteData[] = [];
    const unknown: InviteData[] = [];
    const spam: InviteData[] = [];
    invitesData.forEach((invite) => {
      if (hasBadWords(invite) || bannedInRooms(mx, allRooms, invite.senderId)) {
        spam.push(invite);
        return;
      }

      if (getCommonRooms(mx, allRooms, invite.senderId).length === 0) {
        unknown.push(invite);
        return;
      }

      known.push(invite);
    });

    return [known, unknown, spam];
  }, [mx, allRooms, invitesData]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [compactCards, setCompactCards] = useState(document.body.clientWidth <= COMPACT_CARD_WIDTH);
  useElementSizeObserver(
    useCallback(() => containerRef.current, []),
    useCallback((width) => setCompactCards(width <= COMPACT_CARD_WIDTH), [])
  );
  const screenSize = useScreenSizeContext();
  const compactScreen = isCompactScreenSize(screenSize);

  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const handleNavigate = (roomId: string, space: boolean) => {
    if (space) {
      navigateSpace(roomId);
      return;
    }
    navigateRoom(roomId);
  };

  return (
    <Page>
      <PageHeader balance>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" basis="No" />
          <Box alignItems="Center" gap="200">
            {!compactScreen && <Icon size="400" src={Icons.Mail} />}
            <Text size="H3" truncate>
              {'\u9080\u8bf7'}
            </Text>
          </Box>
          <Box grow="Yes" basis="No" />
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <PageContentCenter>
              <Box ref={containerRef} direction="Column" gap="600">
                <Box direction="Column" gap="100">
                  <span data-spacing-node />
                  <Text size="L400">{'\u7b5b\u9009'}</Text>
                  <InviteFilters
                    filter={filter}
                    onFilter={setFilter}
                    knownInvites={knownInvites}
                    unknownInvites={unknownInvites}
                    spamInvites={spamInvites}
                  />
                </Box>
                {filter === InviteFilter.Known && (
                  <KnownInvites
                    invites={knownInvites}
                    compact={compactCards}
                    hour24Clock={hour24Clock}
                    dateFormatString={dateFormatString}
                    handleNavigate={handleNavigate}
                  />
                )}

                {filter === InviteFilter.Unknown && (
                  <UnknownInvites
                    invites={unknownInvites}
                    compact={compactCards}
                    hour24Clock={hour24Clock}
                    dateFormatString={dateFormatString}
                    handleNavigate={handleNavigate}
                  />
                )}

                {filter === InviteFilter.Spam && (
                  <SpamInvites
                    invites={spamInvites}
                    compact={compactCards}
                    hour24Clock={hour24Clock}
                    dateFormatString={dateFormatString}
                    handleNavigate={handleNavigate}
                  />
                )}
              </Box>
            </PageContentCenter>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
