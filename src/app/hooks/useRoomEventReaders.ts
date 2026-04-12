import { Room, RoomEvent, RoomEventHandlerMap } from 'matrix-js-sdk';
import { useEffect, useState } from 'react';

export type RoomEventReaderInfo = {
  userId: string;
  ts?: number;
};

type ReceiptWithTs = {
  data?: {
    ts?: number;
  };
  ts?: number;
};

const getReceiptTimestamp = (room: Room, userId: string): number | undefined => {
  const receipt = room.getReadReceiptForUserId(userId) as ReceiptWithTs | null;
  if (typeof receipt?.data?.ts === 'number') return receipt.data.ts;
  if (typeof receipt?.ts === 'number') return receipt.ts;

  const unthreadedReceipt = room.getLastUnthreadedReceiptFor(userId) as ReceiptWithTs | undefined;
  if (typeof unthreadedReceipt?.data?.ts === 'number') return unthreadedReceipt.data.ts;
  if (typeof unthreadedReceipt?.ts === 'number') return unthreadedReceipt.ts;

  return undefined;
};

export const getRoomEventReaderIds = (room: Room, evtId?: string) => {
  if (!evtId) return [];

  // if eventId is locally generated
  // we don't have read receipt for it yet
  if (!evtId.startsWith('$')) return [];

  const liveEvents = room.getLiveTimeline().getEvents();
  const userIds: string[] = [];

  for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
    userIds.splice(userIds.length, 0, ...room.getUsersReadUpTo(liveEvents[i]));
    if (liveEvents[i].getId() === evtId) break;
  }

  return [...new Set(userIds)];
};

export const getRoomEventReadersInfo = (room: Room, evtId?: string): RoomEventReaderInfo[] =>
  getRoomEventReaderIds(room, evtId)
    .map((userId, index) => ({
      userId,
      ts: getReceiptTimestamp(room, userId),
      index,
    }))
    .sort((a, b) => {
      if (typeof a.ts === 'number' && typeof b.ts === 'number') {
        return b.ts - a.ts;
      }
      if (typeof a.ts === 'number') return -1;
      if (typeof b.ts === 'number') return 1;
      return a.index - b.index;
    })
    .map(({ index, ...reader }) => reader);

export const useRoomEventReaders = (room: Room, eventId?: string): string[] => {
  const [readers, setReaders] = useState<string[]>(() =>
    getRoomEventReadersInfo(room, eventId).map((reader) => reader.userId)
  );

  useEffect(() => {
    setReaders(getRoomEventReadersInfo(room, eventId).map((reader) => reader.userId));

    const handleReceipt: RoomEventHandlerMap[RoomEvent.Receipt] = (event, r) => {
      if (r.roomId !== room.roomId) return;
      setReaders(getRoomEventReadersInfo(room, eventId).map((reader) => reader.userId));
    };

    const handleLocalEcho: RoomEventHandlerMap[RoomEvent.LocalEchoUpdated] = (
      event,
      r,
      oldEventId
    ) => {
      // update members on local event id replaced
      // with server generated id
      if (r.roomId !== room.roomId || !oldEventId) return;
      if (oldEventId.startsWith('$')) return;
      if (oldEventId !== eventId) return;

      setReaders(getRoomEventReadersInfo(room, event.getId()).map((reader) => reader.userId));
    };

    room.on(RoomEvent.Receipt, handleReceipt);
    room.on(RoomEvent.LocalEchoUpdated, handleLocalEcho);
    return () => {
      room.removeListener(RoomEvent.Receipt, handleReceipt);
      room.removeListener(RoomEvent.LocalEchoUpdated, handleLocalEcho);
    };
  }, [room, eventId]);

  return readers;
};

export const useRoomEventReadersInfo = (
  room: Room,
  eventId?: string
): RoomEventReaderInfo[] => {
  const [readers, setReaders] = useState<RoomEventReaderInfo[]>(() =>
    getRoomEventReadersInfo(room, eventId)
  );

  useEffect(() => {
    setReaders(getRoomEventReadersInfo(room, eventId));

    const handleReceipt: RoomEventHandlerMap[RoomEvent.Receipt] = (event, r) => {
      if (r.roomId !== room.roomId) return;
      setReaders(getRoomEventReadersInfo(room, eventId));
    };

    const handleLocalEcho: RoomEventHandlerMap[RoomEvent.LocalEchoUpdated] = (
      event,
      r,
      oldEventId
    ) => {
      if (r.roomId !== room.roomId || !oldEventId) return;
      if (oldEventId.startsWith('$')) return;
      if (oldEventId !== eventId) return;

      setReaders(getRoomEventReadersInfo(room, event.getId()));
    };

    room.on(RoomEvent.Receipt, handleReceipt);
    room.on(RoomEvent.LocalEchoUpdated, handleLocalEcho);
    return () => {
      room.removeListener(RoomEvent.Receipt, handleReceipt);
      room.removeListener(RoomEvent.LocalEchoUpdated, handleLocalEcho);
    };
  }, [room, eventId]);

  return readers;
};
