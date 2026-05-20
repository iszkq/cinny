import produce from 'immer';
import { atom, useSetAtom } from 'jotai';
import {
  IRoomTimelineData,
  MatrixClient,
  MatrixEvent,
  Room,
  RoomEvent,
  SyncState,
} from 'matrix-js-sdk';
import { ReceiptContent, ReceiptType } from 'matrix-js-sdk/lib/@types/read_receipts';
import { useCallback, useEffect } from 'react';
import {
  Membership,
  NotificationType,
  RoomToUnread,
  UnreadInfo,
  Unread,
  StateEvent,
} from '../../../types/matrix/room';
import {
  getRoomFullyReadEventId,
  getAllParents,
  getNotificationType,
  getUnreadInfo,
  getUnreadInfos,
  isNotificationEvent,
  roomHaveNotification,
  roomHaveUnread,
} from '../../utils/room';
import { ROOM_MARKED_AS_READ } from '../../utils/notifications';
import { roomToParentsAtom } from './roomToParents';
import { useStateEventCallback } from '../../hooks/useStateEventCallback';
import { useSyncState } from '../../hooks/useSyncState';
import { useRoomsNotificationPreferencesContext } from '../../hooks/useRoomsNotificationPreferences';

export type RoomToUnreadAction =
  | {
      type: 'RESET';
      unreadInfos: UnreadInfo[];
    }
  | {
      type: 'PUT';
      unreadInfo: UnreadInfo;
    }
  | {
      type: 'DELETE';
      roomId: string;
    };

export const unreadInfoToUnread = (unreadInfo: UnreadInfo): Unread => ({
  highlight: unreadInfo.highlight,
  total: unreadInfo.total,
  from: null,
});

const FULLY_READ_EVENT_TYPE = 'm.fully_read';

const putUnreadInfo = (
  roomToUnread: RoomToUnread,
  allParents: Set<string>,
  unreadInfo: UnreadInfo
) => {
  const oldUnread = roomToUnread.get(unreadInfo.roomId) ?? { highlight: 0, total: 0, from: null };
  roomToUnread.set(unreadInfo.roomId, unreadInfoToUnread(unreadInfo));

  const newH = unreadInfo.highlight - oldUnread.highlight;
  const newT = unreadInfo.total - oldUnread.total;

  allParents.forEach((parentId) => {
    const oldParentUnread = roomToUnread.get(parentId) ?? { highlight: 0, total: 0, from: null };
    roomToUnread.set(parentId, {
      highlight: (oldParentUnread.highlight += newH),
      total: (oldParentUnread.total += newT),
      from: new Set([...(oldParentUnread.from ?? []), unreadInfo.roomId]),
    });
  });
};

const deleteUnreadInfo = (roomToUnread: RoomToUnread, allParents: Set<string>, roomId: string) => {
  const oldUnread = roomToUnread.get(roomId);
  if (!oldUnread) return;
  roomToUnread.delete(roomId);

  allParents.forEach((parentId) => {
    const oldParentUnread = roomToUnread.get(parentId);
    if (!oldParentUnread) return;
    const newFrom = new Set([...(oldParentUnread.from ?? roomId)]);
    newFrom.delete(roomId);
    if (newFrom.size === 0) {
      roomToUnread.delete(parentId);
      return;
    }
    roomToUnread.set(parentId, {
      highlight: oldParentUnread.highlight - oldUnread.highlight,
      total: oldParentUnread.total - oldUnread.total,
      from: newFrom,
    });
  });
};

export const unreadEqual = (u1: Unread, u2: Unread): boolean => {
  const countEqual = u1.highlight === u2.highlight && u1.total === u2.total;

  if (!countEqual) return false;

  const f1 = u1.from;
  const f2 = u2.from;
  if (f1 === null && f2 === null) return true;
  if (f1 === null || f2 === null) return false;

  if (f1.size !== f2.size) return false;

  let fromEqual = true;
  f1?.forEach((item) => {
    if (!f2?.has(item)) {
      fromEqual = false;
    }
  });

  return fromEqual;
};

const baseRoomToUnread = atom<RoomToUnread>(new Map());
export const roomToUnreadAtom = atom<RoomToUnread, [RoomToUnreadAction], undefined>(
  (get) => get(baseRoomToUnread),
  (get, set, action) => {
    if (action.type === 'RESET') {
      const draftRoomToUnread: RoomToUnread = new Map();
      action.unreadInfos.forEach((unreadInfo) => {
        putUnreadInfo(
          draftRoomToUnread,
          getAllParents(get(roomToParentsAtom), unreadInfo.roomId),
          unreadInfo
        );
      });
      set(baseRoomToUnread, draftRoomToUnread);
      return;
    }
    if (action.type === 'PUT') {
      const { unreadInfo } = action;
      const currentUnread = get(baseRoomToUnread).get(unreadInfo.roomId);
      if (currentUnread && unreadEqual(currentUnread, unreadInfoToUnread(unreadInfo))) {
        // Do not update if unread data has not changes
        // like total & highlight
        return;
      }
      set(
        baseRoomToUnread,
        produce(get(baseRoomToUnread), (draftRoomToUnread) =>
          putUnreadInfo(
            draftRoomToUnread,
            getAllParents(get(roomToParentsAtom), unreadInfo.roomId),
            unreadInfo
          )
        )
      );
      return;
    }
    if (action.type === 'DELETE' && get(baseRoomToUnread).has(action.roomId)) {
      set(
        baseRoomToUnread,
        produce(get(baseRoomToUnread), (draftRoomToUnread) =>
          deleteUnreadInfo(
            draftRoomToUnread,
            getAllParents(get(roomToParentsAtom), action.roomId),
            action.roomId
          )
        )
      );
    }
  }
);

export const useBindRoomToUnreadAtom = (mx: MatrixClient, unreadAtom: typeof roomToUnreadAtom) => {
  const setUnreadAtom = useSetAtom(unreadAtom);
  const roomsNotificationPreferences = useRoomsNotificationPreferencesContext();
  const resetUnreadState = useCallback(() => {
    setUnreadAtom({
      type: 'RESET',
      unreadInfos: getUnreadInfos(mx),
    });
  }, [mx, setUnreadAtom]);

  const syncRoomUnread = useCallback(
    (room: Room) => {
      if (room.isSpaceRoom() || room.getMyMembership() !== Membership.Join) {
        setUnreadAtom({
          type: 'DELETE',
          roomId: room.roomId,
        });
        return;
      }

      if (getNotificationType(mx, room.roomId) === NotificationType.Mute) {
        setUnreadAtom({
          type: 'DELETE',
          roomId: room.roomId,
        });
        return;
      }

      const hasUnread = roomHaveUnread(mx, room);
      const unreadInfo = getUnreadInfo(mx, room);

      if ((roomHaveNotification(room) || hasUnread) && (unreadInfo.total > 0 || hasUnread)) {
        setUnreadAtom({ type: 'PUT', unreadInfo });
        return;
      }

      setUnreadAtom({
        type: 'DELETE',
        roomId: room.roomId,
      });
    },
    [mx, setUnreadAtom]
  );

  useEffect(() => {
    resetUnreadState();
  }, [resetUnreadState]);

  useSyncState(
    mx,
    useCallback(
      (state, prevState) => {
        if (
          (state === SyncState.Prepared ||
            state === SyncState.Catchup ||
            state === SyncState.Syncing) &&
          state !== prevState
        ) {
          resetUnreadState();
        }
      },
      [resetUnreadState]
    )
  );

  useEffect(() => {
    const handleTimelineEvent = (
      mEvent: MatrixEvent,
      room: Room | undefined,
      toStartOfTimeline: boolean | undefined,
      removed: boolean,
      data: IRoomTimelineData
    ) => {
      if (!room || !data?.liveEvent || room.isSpaceRoom() || !isNotificationEvent(mEvent)) return;

      try {
        syncRoomUnread(room);
      } catch {
        // Unread bookkeeping must never interrupt sync event processing.
      }
    };
    mx.on(RoomEvent.Timeline, handleTimelineEvent);
    return () => {
      mx.removeListener(RoomEvent.Timeline, handleTimelineEvent);
    };
  }, [mx, syncRoomUnread]);

  useEffect(() => {
    const handleReceipt = (mEvent: MatrixEvent, room: Room) => {
      const myUserId = mx.getUserId();
      if (!myUserId) return;
      if (room.isSpaceRoom()) return;
      const content = mEvent.getContent<ReceiptContent>();

      const isMyReceipt = Object.keys(content).find((eventId) =>
        (Object.keys(content[eventId]) as ReceiptType[]).find(
          (receiptType) => content[eventId][receiptType][myUserId]
        )
      );
      if (isMyReceipt) {
        syncRoomUnread(room);
      }
    };
    mx.on(RoomEvent.Receipt, handleReceipt);
    return () => {
      mx.removeListener(RoomEvent.Receipt, handleReceipt);
    };
  }, [mx, syncRoomUnread]);

  useEffect(() => {
    const handleRoomAccountData = (_mEvent: MatrixEvent, room: Room) => {
      if (_mEvent.getType() !== FULLY_READ_EVENT_TYPE) return;
      if (room.isSpaceRoom() || !getRoomFullyReadEventId(room)) return;

      syncRoomUnread(room);
    };

    mx.on(RoomEvent.AccountData, handleRoomAccountData);
    return () => {
      mx.removeListener(RoomEvent.AccountData, handleRoomAccountData);
    };
  }, [mx, syncRoomUnread]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleOptimisticRead = (evt: Event) => {
      const customEvent = evt as CustomEvent<{ roomId?: string }>;
      const roomId = customEvent.detail?.roomId;
      if (!roomId) return;
      const room = mx.getRoom(roomId);
      if (!room) {
        setUnreadAtom({ type: 'DELETE', roomId });
        return;
      }

      syncRoomUnread(room);
    };

    window.addEventListener(ROOM_MARKED_AS_READ, handleOptimisticRead);
    return () => {
      window.removeEventListener(ROOM_MARKED_AS_READ, handleOptimisticRead);
    };
  }, [mx, setUnreadAtom, syncRoomUnread]);

  useEffect(() => {
    resetUnreadState();
  }, [resetUnreadState, roomsNotificationPreferences]);

  useEffect(() => {
    const handleMembershipChange = (room: Room, membership: string) => {
      if (membership !== Membership.Join) {
        setUnreadAtom({
          type: 'DELETE',
          roomId: room.roomId,
        });
      }
    };
    mx.on(RoomEvent.MyMembership, handleMembershipChange);
    return () => {
      mx.removeListener(RoomEvent.MyMembership, handleMembershipChange);
    };
  }, [mx, setUnreadAtom]);

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === StateEvent.SpaceChild) {
          resetUnreadState();
        }
      },
      [resetUnreadState]
    )
  );
};
