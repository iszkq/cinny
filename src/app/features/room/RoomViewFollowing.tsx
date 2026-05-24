import React, { useState } from 'react';
import {
  Avatar,
  Box,
  Icon,
  Icons,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
  as,
  config,
} from 'folds';
import { Room } from 'matrix-js-sdk';
import classNames from 'classnames';
import FocusTrap from 'focus-trap-react';

import { getMemberDisplayName } from '../../utils/room';
import { getMxIdLocalPart } from '../../utils/matrix';
import * as css from './RoomViewFollowing.css';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useRoomLatestRenderedEvent } from '../../hooks/useRoomLatestRenderedEvent';
import { useRoomEventReaders } from '../../hooks/useRoomEventReaders';
import { EventReaders } from '../../components/event-readers';
import { UserAvatar } from '../../components/user-avatar';
import { stopPropagation } from '../../utils/keyboard';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';

const MIN_VISIBLE_READERS = 1;
const MAX_VISIBLE_READERS = 50;

export function RoomViewFollowingPlaceholder() {
  return <div className={css.RoomViewFollowingPlaceholder} />;
}

export type RoomViewFollowingProps = {
  room: Room;
};
export const RoomViewFollowing = as<'div', RoomViewFollowingProps>(
  ({ className, room, ...props }, ref) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const [readReceiptAvatarCount] = useSetting(settingsAtom, 'readReceiptAvatarCount');
    const [open, setOpen] = useState(false);
    const latestEvent = useRoomLatestRenderedEvent(room);
    const latestEventReaders = useRoomEventReaders(room, latestEvent?.getId()).filter(
      (readerId) => readerId !== mx.getUserId()
    );
    const visibleReaderCount = Math.max(
      Math.min(readReceiptAvatarCount, MAX_VISIBLE_READERS),
      MIN_VISIBLE_READERS
    );
    const visibleReaders = latestEventReaders.slice(0, visibleReaderCount);
    const overflowCount = Math.max(latestEventReaders.length - visibleReaders.length, 0);

    if (latestEventReaders.length === 0) {
      return null;
    }

    const eventId = latestEvent?.getId();
    const getName = (readerId: string) =>
      getMemberDisplayName(room, readerId) ?? getMxIdLocalPart(readerId) ?? readerId;

    return (
      <>
        {eventId && (
          <Overlay open={open} backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  onDeactivate: () => setOpen(false),
                  clickOutsideDeactivates: true,
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Modal variant="Surface" size="300">
                  <EventReaders room={room} eventId={eventId} requestClose={() => setOpen(false)} />
                </Modal>
              </FocusTrap>
            </OverlayCenter>
          </Overlay>
        )}
        <Box
          as="button"
          onClick={() => setOpen(true)}
          className={classNames(
            css.RoomViewFollowing({ clickable: true }),
            className
          )}
          alignItems="Center"
          justifyContent="End"
          gap="200"
          {...props}
          ref={ref}
        >
          {latestEventReaders.length > 0 && (
            <>
              <Icon style={{ opacity: config.opacity.P300 }} size="100" src={Icons.CheckTwice} />
              <Box className={css.ReadersSummary} alignItems="Center" gap="100">
                {overflowCount > 0 && (
                  <Text className={css.ReaderOverflow} size="T200">
                    {`+${overflowCount}`}
                  </Text>
                )}
                <Box className={css.ReaderAvatarStack} alignItems="Center">
                  {visibleReaders.map((readerId) => {
                    const avatarMxcUrl = room.getMember(readerId)?.getMxcAvatarUrl();
                    const avatarUrl = avatarMxcUrl
                      ? mx.mxcUrlToHttp(
                          avatarMxcUrl,
                          48,
                          48,
                          'crop',
                          undefined,
                          false,
                          useAuthentication
                        )
                      : undefined;

                    return (
                      <Avatar
                        key={readerId}
                        className={css.ReaderAvatar}
                        size="200"
                        title={getName(readerId)}
                      >
                        <UserAvatar
                          userId={readerId}
                          src={avatarUrl ?? undefined}
                          alt={getName(readerId)}
                          renderFallback={() => <Icon size="50" src={Icons.User} filled />}
                        />
                      </Avatar>
                    );
                  })}
                </Box>
              </Box>
            </>
          )}
        </Box>
      </>
    );
  }
);
