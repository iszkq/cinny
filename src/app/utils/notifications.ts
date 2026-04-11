import { MatrixClient, ReceiptType } from 'matrix-js-sdk';

export const ROOM_MARKED_AS_READ = 'cinny:room-marked-as-read';

type RoomMarkedAsReadDetail = {
  roomId: string;
};

const dispatchRoomMarkedAsRead = (roomId: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<RoomMarkedAsReadDetail>(ROOM_MARKED_AS_READ, {
      detail: { roomId },
    })
  );
};

export async function markAsRead(mx: MatrixClient, roomId: string, privateReceipt: boolean) {
  const room = mx.getRoom(roomId);
  if (!room) return;

  dispatchRoomMarkedAsRead(roomId);

  const timeline = room.getLiveTimeline().getEvents();
  const readEventId = room.getEventReadUpTo(mx.getUserId()!);

  const getLatestValidEvent = () => {
    for (let i = timeline.length - 1; i >= 0; i -= 1) {
      const latestEvent = timeline[i];
      if (latestEvent.getId() === readEventId) return null;
      if (!latestEvent.isSending()) return latestEvent;
    }
    return null;
  };
  if (timeline.length === 0) return;
  const latestEvent = getLatestValidEvent();
  if (latestEvent === null) return;

  await mx.sendReadReceipt(
    latestEvent,
    privateReceipt ? ReceiptType.ReadPrivate : ReceiptType.Read
  );
}
