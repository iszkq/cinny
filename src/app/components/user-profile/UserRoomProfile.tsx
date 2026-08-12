import { Box, Button, Spinner, config, Icon, Icons, Text, color } from 'folds';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EventType,
  IContent,
  ICreateRoomStateEvent,
  MsgType,
  Preset,
  Visibility,
} from 'matrix-js-sdk';
import { UserHero, UserHeroName } from './UserHero';
import {
  addRoomIdToMDirect,
  getDMRoomFor,
  getMxIdLocalPart,
  getMxIdServer,
  mxcUrlToHttp,
} from '../../utils/matrix';
import { sanitizeText } from '../../utils/sanitize';
import { getMemberAvatarMxc, getMemberDisplayName, getMentionContent } from '../../utils/room';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { usePowerLevels } from '../../hooks/usePowerLevels';
import { useRoom } from '../../hooks/useRoom';
import { useUserPresence } from '../../hooks/useUserPresence';
import { IgnoredUserAlert, MutualRoomsChip, OptionsChip, ServerChip, ShareChip } from './UserChips';
import { useCloseUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { PowerChip } from './PowerChip';
import { UserInviteAlert, UserBanAlert, UserModeration, UserKickAlert } from './UserModeration';
import { useIgnoredUsers } from '../../hooks/useIgnoredUsers';
import { useMembership } from '../../hooks/useMembership';
import { Membership } from '../../../types/matrix/room';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { useMemberPowerCompare } from '../../hooks/useMemberPowerCompare';
import { CreatorChip } from './CreatorChip';
import { getDirectRoomPath } from '../../pages/pathUtils';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { createRoomEncryptionState } from '../create-room';
import { useDirectRooms } from '../../pages/client/direct/useDirectRooms';

type UserRoomProfileProps = {
  userId: string;
};
export function UserRoomProfile({ userId }: UserRoomProfileProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const navigate = useNavigate();
  const closeUserRoomProfile = useCloseUserRoomProfile();
  const ignoredUsers = useIgnoredUsers();
  const ignored = ignoredUsers.includes(userId);

  const room = useRoom();
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const { hasMorePower } = useMemberPowerCompare(creators, powerLevels);

  const myUserId = mx.getSafeUserId();
  const creator = creators.has(userId);
  const canMessage = permissions.event(EventType.RoomMessage, myUserId);

  const canKickUser = permissions.action('kick', myUserId) && hasMorePower(myUserId, userId);
  const canBanUser = permissions.action('ban', myUserId) && hasMorePower(myUserId, userId);
  const canUnban = permissions.action('ban', myUserId);
  const canInvite = permissions.action('invite', myUserId);

  const member = room.getMember(userId);
  const membership = useMembership(room, userId);

  const server = getMxIdServer(userId);
  const displayName = getMemberDisplayName(room, userId);
  const mentionName = displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarMxc = getMemberAvatarMxc(room, userId);
  const avatarUrl =
    (avatarMxc && mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop')) ?? undefined;
  const avatarOriginalUrl =
    (avatarMxc && mxcUrlToHttp(mx, avatarMxc, useAuthentication)) ?? undefined;

  const presence = useUserPresence(userId);

  const directs = useDirectRooms();
  const [messageState, openMessage] = useAsyncCallback<string, Error, []>(
    React.useCallback(async () => {
      const existingRoom = getDMRoomFor(mx, userId);
      if (existingRoom) {
        if (!directs.includes(existingRoom.roomId)) {
          await addRoomIdToMDirect(mx, existingRoom.roomId, userId);
        }
        return existingRoom.roomId;
      }

      const initialState: ICreateRoomStateEvent[] = [createRoomEncryptionState()];
      const result = await mx.createRoom({
        is_direct: true,
        invite: [userId],
        visibility: Visibility.Private,
        preset: Preset.TrustedPrivateChat,
        initial_state: initialState,
      });
      await addRoomIdToMDirect(mx, result.room_id, userId);
      return result.room_id;
    }, [directs, mx, userId])
  );

  const handleMessage = () => {
    openMessage()
      .then((roomId) => {
        // Keep the router context mounted until navigation is committed. On
        // mobile WebViews, closing the profile FocusTrap first can swallow the
        // route update that originated from this tap.
        navigate(getDirectRoomPath(roomId));
        closeUserRoomProfile();
      })
      .catch(() => undefined);
  };

  const [mentionState, sendMention] = useAsyncCallback<undefined, Error, []>(async () => {
    const mentionLabel = `@${mentionName}`;
    const content: IContent = {
      msgtype: MsgType.Text,
      body: mentionLabel,
      format: 'org.matrix.custom.html',
      formatted_body: `<a href="https://matrix.to/#/${encodeURIComponent(userId)}">${sanitizeText(
        mentionLabel
      )}</a>`,
      'm.mentions': getMentionContent([userId], false),
    };

    await mx.sendMessage(room.roomId, content as never);
  });

  const handleMention = () => {
    sendMention()
      .then(() => {
        closeUserRoomProfile();
      })
      .catch(() => undefined);
  };

  const mentionSending = mentionState.status === AsyncStatus.Loading;
  const mentionError = mentionState.status === AsyncStatus.Error ? mentionState.error : undefined;
  const messageOpening = messageState.status === AsyncStatus.Loading;
  const messageError = messageState.status === AsyncStatus.Error ? messageState.error : undefined;

  return (
    <Box direction="Column">
      <UserHero
        userId={userId}
        displayName={displayName}
        avatarUrl={avatarUrl}
        avatarOriginalUrl={avatarOriginalUrl}
        presence={presence && presence.lastActiveTs !== 0 ? presence : undefined}
      />
      <Box direction="Column" gap="500" style={{ padding: config.space.S400 }}>
        <Box direction="Column" gap="400">
          <Box gap="400" alignItems="Start">
            <UserHeroName displayName={displayName} userId={userId} />
            {userId !== myUserId && (
              <Box shrink="No" gap="200" wrap="Wrap">
                {canMessage && (
                  <Button
                    size="300"
                    variant="Secondary"
                    fill="Soft"
                    radii="300"
                    before={
                      mentionSending ? (
                        <Spinner size="50" />
                      ) : (
                        <Icon size="50" src={Icons.Mention} />
                      )
                    }
                    onClick={handleMention}
                    disabled={mentionSending}
                  >
                    <Text size="B300">{`@${mentionName}`}</Text>
                  </Button>
                )}
                <Button
                  size="300"
                  variant="Primary"
                  fill="Solid"
                  radii="300"
                  before={
                    messageOpening ? (
                      <Spinner size="50" />
                    ) : (
                      <Icon size="50" src={Icons.Message} filled />
                    )
                  }
                  onClick={handleMessage}
                  disabled={messageOpening}
                >
                  <Text size="B300">消息</Text>
                </Button>
              </Box>
            )}
          </Box>
          <Box alignItems="Center" gap="200" wrap="Wrap">
            {server && <ServerChip server={server} />}
            <ShareChip userId={userId} />
            {creator ? <CreatorChip /> : <PowerChip userId={userId} />}
            {userId !== myUserId && <MutualRoomsChip userId={userId} />}
            {userId !== myUserId && <OptionsChip userId={userId} />}
          </Box>
          {mentionError && (
            <Text size="T200" style={{ color: color.Critical.Main }}>
              {mentionError instanceof Error ? mentionError.message : '发送失败，请重试。'}
            </Text>
          )}
          {messageError && (
            <Text size="T200" style={{ color: color.Critical.Main }}>
              {messageError instanceof Error
                ? messageError.message
                : '\u65e0\u6cd5\u6253\u5f00\u79c1\u804a\uff0c\u8bf7\u91cd\u8bd5\u3002'}
            </Text>
          )}
        </Box>
        {ignored && <IgnoredUserAlert />}
        {member && membership === Membership.Ban && (
          <UserBanAlert
            userId={userId}
            reason={member.events.member?.getContent().reason}
            canUnban={canUnban}
            bannedBy={member.events.member?.getSender()}
            ts={member.events.member?.getTs()}
          />
        )}
        {member &&
          membership === Membership.Leave &&
          member.events.member &&
          member.events.member.getSender() !== userId && (
            <UserKickAlert
              reason={member.events.member?.getContent().reason}
              kickedBy={member.events.member?.getSender()}
              ts={member.events.member?.getTs()}
            />
          )}
        {member && membership === Membership.Invite && (
          <UserInviteAlert
            userId={userId}
            reason={member.events.member?.getContent().reason}
            canKick={canKickUser}
            invitedBy={member.events.member?.getSender()}
            ts={member.events.member?.getTs()}
          />
        )}
        <UserModeration
          userId={userId}
          canInvite={canInvite && membership === Membership.Leave}
          canKick={canKickUser && membership === Membership.Join}
          canBan={canBanUser && membership !== Membership.Ban}
        />
      </Box>
    </Box>
  );
}
