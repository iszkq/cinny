import React, { RefObject, useRef } from 'react';
import { Badge, Box, color, Header, Scroll, Text, toRem } from 'folds';
import { useCallEmbed, useCallJoined, useCallEmbedPlacementSync } from '../../hooks/useCallEmbed';
import { ContainerColor } from '../../styles/ContainerColor.css';
import { PrescreenControls } from './PrescreenControls';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import { useRoom } from '../../hooks/useRoom';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { StateEvent } from '../../../types/matrix/room';
import { useCallMembers, useCallSession } from '../../hooks/useCall';
import { CallMemberRenderer } from './CallMemberCard';
import * as css from './styles.css';
import { CallControls } from './CallControls';
import { useLivekitSupport } from '../../hooks/useLivekitSupport';

function LivekitServerMissingMessage() {
  return (
    <Text style={{ margin: 'auto', color: color.Critical.Main }} size="L400" align="Center">
      {
        '\u4f60\u7684 Homeserver \u6682\u4e0d\u652f\u6301\u901a\u8bdd\uff0c\u4f46\u4f60\u4ecd\u53ef\u4ee5\u52a0\u5165\u5176\u4ed6\u4eba\u5df2\u53d1\u8d77\u7684\u901a\u8bdd\u3002'
      }
    </Text>
  );
}

function JoinMessage({
  hasParticipant,
  livekitSupported,
}: {
  hasParticipant?: boolean;
  livekitSupported?: boolean;
}) {
  if (hasParticipant) return null;

  if (livekitSupported === false) {
    return <LivekitServerMissingMessage />;
  }

  return (
    <Text style={{ margin: 'auto' }} size="L400" align="Center">
      {'\u8bed\u97f3\u804a\u5929\u8fd8\u6ca1\u6709\u4eba\uff0c\u5feb\u6765\u7b2c\u4e00\u4e2a\u52a0\u5165\u5427\uff01'}
    </Text>
  );
}

function NoPermissionMessage() {
  return (
    <Text style={{ margin: 'auto' }} size="L400" align="Center">
      {'\u4f60\u6ca1\u6709\u52a0\u5165\u6743\u9650\uff01'}
    </Text>
  );
}

function AlreadyInCallMessage() {
  return (
    <Text style={{ margin: 'auto', color: color.Warning.Main }} size="L400" align="Center">
      {
        '\u4f60\u5df2\u5728\u5176\u4ed6\u901a\u8bdd\u4e2d\uff0c\u8bf7\u5148\u7ed3\u675f\u5f53\u524d\u901a\u8bdd\u518d\u52a0\u5165\u3002'
      }
    </Text>
  );
}

function CallPrescreen() {
  const mx = useMatrixClient();
  const room = useRoom();
  const livekitSupported = useLivekitSupport();

  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const hasPermission = permissions.event(StateEvent.GroupCallMemberPrefix, mx.getSafeUserId());

  const callSession = useCallSession(room);
  const callMembers = useCallMembers(room, callSession);
  const hasParticipant = callMembers.length > 0;

  const callEmbed = useCallEmbed();
  const inOtherCall = callEmbed && callEmbed.roomId !== room.roomId;

  const canJoin = hasPermission && (livekitSupported || hasParticipant);

  return (
    <Scroll variant="Surface" hideTrack>
      <Box className={css.CallViewContent} alignItems="Center" justifyContent="Center">
        <Box style={{ maxWidth: toRem(382), width: '100%' }} direction="Column" gap="100">
          {hasParticipant && (
            <Header size="300">
              <Box grow="Yes" alignItems="Center">
                <Text size="L400">{'\u53c2\u4e0e\u8005'}</Text>
              </Box>
              <Badge variant="Critical" fill="Solid" size="400">
                <Text as="span" size="L400" truncate>
                  {`${callMembers.length} \u4eba\u5728\u7ebf`}
                </Text>
              </Badge>
            </Header>
          )}
          <CallMemberRenderer members={callMembers} />
          <PrescreenControls canJoin={canJoin} />
          <Box className={css.PrescreenMessage} alignItems="Center">
            {!inOtherCall &&
              (hasPermission ? (
                <JoinMessage hasParticipant={hasParticipant} livekitSupported={livekitSupported} />
              ) : (
                <NoPermissionMessage />
              ))}
            {inOtherCall && <AlreadyInCallMessage />}
          </Box>
        </Box>
      </Box>
    </Scroll>
  );
}

type CallJoinedProps = {
  containerRef: RefObject<HTMLDivElement>;
  joined: boolean;
};
function CallJoined({ joined, containerRef }: CallJoinedProps) {
  const callEmbed = useCallEmbed();

  return (
    <Box grow="Yes" direction="Column">
      <Box grow="Yes" ref={containerRef} />
      {callEmbed && joined && <CallControls callEmbed={callEmbed} />}
    </Box>
  );
}

export function CallView() {
  const room = useRoom();
  const callContainerRef = useRef<HTMLDivElement>(null);
  useCallEmbedPlacementSync(callContainerRef);

  const callEmbed = useCallEmbed();
  const callJoined = useCallJoined(callEmbed);

  const currentJoined = callEmbed?.roomId === room.roomId && callJoined;

  return (
    <Box
      className={ContainerColor({ variant: 'Surface' })}
      style={{ minWidth: toRem(280) }}
      grow="Yes"
    >
      {!currentJoined && <CallPrescreen />}
      <CallJoined joined={currentJoined} containerRef={callContainerRef} />
    </Box>
  );
}
