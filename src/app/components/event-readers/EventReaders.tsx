import React, { useMemo } from 'react';
import classNames from 'classnames';
import {
  Avatar,
  Box,
  Header,
  Icon,
  IconButton,
  Icons,
  MenuItem,
  Scroll,
  Text,
  as,
  config,
} from 'folds';
import { Room } from 'matrix-js-sdk';
import { useRoomEventReadersInfo } from '../../hooks/useRoomEventReaders';
import { getMemberDisplayName } from '../../utils/room';
import { getMxIdLocalPart } from '../../utils/matrix';
import * as css from './EventReaders.css';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { UserAvatar } from '../user-avatar';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useOpenUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { useSpaceOptionally } from '../../hooks/useSpace';
import { getMouseEventCords } from '../../utils/dom';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { Time } from '../message';

export type EventReadersProps = {
  room: Room;
  eventId: string;
  readerIds?: string[];
  requestClose: () => void;
};
export const EventReaders = as<'div', EventReadersProps>(
  ({ className, room, eventId, readerIds, requestClose, ...props }, ref) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const latestEventReaders = useRoomEventReadersInfo(room, eventId);
    const openProfile = useOpenUserRoomProfile();
    const space = useSpaceOptionally();
    const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
    const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

    const getName = (userId: string) =>
      getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId;
    const filteredReaders = useMemo(() => {
      if (!readerIds || readerIds.length === 0) return latestEventReaders;

      const allowedIds = new Set(readerIds);
      return latestEventReaders.filter((reader) => allowedIds.has(reader.userId));
    }, [latestEventReaders, readerIds]);

    return (
      <Box
        className={classNames(css.EventReaders, className)}
        direction="Column"
        {...props}
        ref={ref}
      >
        <Header className={css.Header} variant="Surface" size="600">
          <Box grow="Yes">
            <Text size="H3">{`\u5df2\u88ab${filteredReaders.length}\u4eba\u67e5\u770b`}</Text>
          </Box>
          <IconButton size="300" onClick={requestClose}>
            <Icon src={Icons.Cross} />
          </IconButton>
        </Header>
        <Box grow="Yes">
          <Scroll visibility="Hover" hideTrack size="300">
            <Box className={css.Content} direction="Column">
              {filteredReaders.map(({ userId: readerId, ts }) => {
                const name = getName(readerId);
                const avatarMxcUrl = room.getMember(readerId)?.getMxcAvatarUrl();
                const avatarUrl = avatarMxcUrl
                  ? mx.mxcUrlToHttp(
                      avatarMxcUrl,
                      100,
                      100,
                      'crop',
                      undefined,
                      false,
                      useAuthentication
                    )
                  : undefined;

                return (
                  <MenuItem
                    key={readerId}
                    className={css.ReaderItem}
                    style={{ padding: `0 ${config.space.S200}` }}
                    radii="400"
                    onClick={(event) => {
                      openProfile(
                        room.roomId,
                        space?.roomId,
                        readerId,
                        getMouseEventCords(event.nativeEvent),
                        'Bottom'
                      );
                    }}
                    before={
                      <Avatar size="200">
                        <UserAvatar
                          userId={readerId}
                          src={avatarUrl ?? undefined}
                          alt={name}
                          renderFallback={() => <Icon size="50" src={Icons.User} filled />}
                        />
                      </Avatar>
                    }
                  >
                    <Box className={css.ReaderMeta} direction="Column" gap="50">
                      <Text size="T400" truncate>
                        {name}
                      </Text>
                      {typeof ts === 'number' ? (
                        <Time
                          className={css.ReaderTime}
                          compact
                          ts={ts}
                          hour24Clock={hour24Clock}
                          dateFormatString={dateFormatString}
                        />
                      ) : (
                        <Text className={css.ReaderTime} size="T200" priority="300">
                          时间未知
                        </Text>
                      )}
                    </Box>
                  </MenuItem>
                );
              })}
            </Box>
          </Scroll>
        </Box>
      </Box>
    );
  }
);
