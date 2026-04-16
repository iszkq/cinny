import { MatrixClient, MatrixEvent, ReceiptType } from 'matrix-js-sdk';
import { getRoomFullyReadEventId, setOptimisticRoomReadMarker } from './room';

export const ROOM_MARKED_AS_READ = 'cinny:room-marked-as-read';
const FULLY_READ_EVENT_TYPE = 'm.fully_read';

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

const getLatestValidEvent = (timeline: MatrixEvent[]) => {
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    const latestEvent = timeline[i];
    if (!latestEvent.isSending()) return latestEvent;
  }
  return null;
};

export async function markAsRead(mx: MatrixClient, roomId: string, privateReceipt: boolean) {
  const room = mx.getRoom(roomId);
  if (!room) return;

  const userId = mx.getUserId();
  if (!userId) return;

  const timeline = room.getLiveTimeline().getEvents();
  const publicReadEventId = room.getEventReadUpTo(userId);
  const fullyReadEventId = getRoomFullyReadEventId(room);
  if (timeline.length === 0) return;
  const latestEvent = getLatestValidEvent(timeline);
  if (latestEvent === null) return;
  const latestEventId = latestEvent.getId();
  if (!latestEventId) return;

  const fullyReadUpToDate = latestEventId === fullyReadEventId;
  const publicReadUpToDate = latestEventId === publicReadEventId;

  if (
    (privateReceipt && fullyReadUpToDate) ||
    (!privateReceipt && fullyReadUpToDate && publicReadUpToDate)
  ) {
    setOptimisticRoomReadMarker(roomId, latestEventId, userId);
    dispatchRoomMarkedAsRead(roomId);
    return;
  }

  if (privateReceipt) {
    setOptimisticRoomReadMarker(roomId, latestEventId, userId);
    dispatchRoomMarkedAsRead(roomId);
    return;
  }

  try {
    await mx.setRoomReadMarkers(roomId, latestEventId, latestEvent);
  } catch (error) {
    await Promise.all([
      mx.setRoomAccountData(roomId, FULLY_READ_EVENT_TYPE, { event_id: latestEventId }),
      mx.sendReadReceipt(latestEvent, ReceiptType.Read),
    ]);
  }

  setOptimisticRoomReadMarker(roomId, latestEventId, userId);
  dispatchRoomMarkedAsRead(roomId);
}
