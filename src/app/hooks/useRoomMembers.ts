import { MatrixClient, MatrixEvent, RoomMember, RoomMemberEvent } from 'matrix-js-sdk';
import { useEffect, useState } from 'react';

const ROOM_MEMBERS_RETRY_DELAY_MS = 20 * 1000;

export const useRoomMembers = (mx: MatrixClient, roomId: string): RoomMember[] => {
  const [members, setMembers] = useState<RoomMember[]>([]);

  useEffect(() => {
    const room = mx.getRoom(roomId);
    let loadingMembers = true;
    let disposed = false;
    let retryTimerId: number | undefined;

    const updateMemberList = (event?: MatrixEvent) => {
      if (!room || disposed || (event && event.getRoomId() !== roomId)) return;
      if (loadingMembers) return;
      setMembers(room.getMembers());
    };

    const clearRetryTimer = () => {
      if (typeof retryTimerId === 'number') {
        window.clearTimeout(retryTimerId);
        retryTimerId = undefined;
      }
    };

    const loadMembers = () => {
      if (!room || disposed) return;

      loadingMembers = true;
      clearRetryTimer();

      room
        .loadMembersIfNeeded()
        .then(() => {
          loadingMembers = false;
          if (disposed) return;
          updateMemberList();
        })
        .catch(() => {
          loadingMembers = false;
          if (disposed) return;
          updateMemberList();
          retryTimerId = window.setTimeout(() => {
            loadMembers();
          }, ROOM_MEMBERS_RETRY_DELAY_MS);
        });
    };

    if (room) {
      setMembers(room.getMembers());
      loadMembers();
    }

    mx.on(RoomMemberEvent.Membership, updateMemberList);
    mx.on(RoomMemberEvent.PowerLevel, updateMemberList);
    window.addEventListener('online', loadMembers);
    return () => {
      disposed = true;
      clearRetryTimer();
      mx.removeListener(RoomMemberEvent.Membership, updateMemberList);
      mx.removeListener(RoomMemberEvent.PowerLevel, updateMemberList);
      window.removeEventListener('online', loadMembers);
    };
  }, [mx, roomId]);

  return members;
};
