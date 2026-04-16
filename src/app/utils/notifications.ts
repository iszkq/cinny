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

const getPrivateReceiptPublicAnchor = (
  roomId: string,
  timeline: MatrixEvent[],
  userId: string,
  publicReadEventId?: string | null
) => {
  if (!publicReadEventId) return undefined;

  const publicReadIndex = timeline.findIndex((event) => event.getId() === publicReadEventId);
  if (publicReadIndex === -1) return undefined;

  for (let i = publicReadIndex; i >= 0; i -= 1) {
    const event = timeline[i];
    if (event.isSending()) continue;
    if (event.getSender() === userId) return event;
  }

  for (let i = 0; i <= publicReadIndex; i += 1) {
    const event = timeline[i];
    if (!event.isSending()) return event;
  }

  return timeline.find((event) => !event.isSending() && event.getRoomId() === roomId);
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

  const publicReceiptAnchor = privateReceipt
    ? getPrivateReceiptPublicAnchor(roomId, timeline, userId, publicReadEventId)
    : undefined;
  const publicReceiptEvent = privateReceipt
    ? publicReceiptAnchor && publicReceiptAnchor.getId() !== publicReadEventId
      ? publicReceiptAnchor
      : undefined
    : latestEvent;

  const fullyReadUpToDate = latestEventId === fullyReadEventId;
  const publicReadUpToDate = latestEventId === publicReadEventId;
  const publicReadHidden =
    !privateReceipt ||
    !publicReadEventId ||
    !publicReceiptAnchor ||
    publicReceiptAnchor.getId() === publicReadEventId;

  if (
    (privateReceipt && fullyReadUpToDate && publicReadHidden) ||
    (!privateReceipt && fullyReadUpToDate && publicReadUpToDate)
  ) {
    return;
  }

  try {
    await mx.setRoomReadMarkers(
      roomId,
      latestEventId,
      publicReceiptEvent,
      privateReceipt ? latestEvent : undefined
    );
  } catch (error) {
    const requests: Promise<unknown>[] = [
      mx.setRoomAccountData(roomId, FULLY_READ_EVENT_TYPE, { event_id: latestEventId }),
    ];

    if (privateReceipt) {
      if (publicReceiptEvent && publicReceiptEvent.getId() !== publicReadEventId) {
        requests.push(mx.sendReadReceipt(publicReceiptEvent, ReceiptType.Read));
      }
      requests.push(mx.sendReadReceipt(latestEvent, ReceiptType.ReadPrivate));
    } else {
      requests.push(mx.sendReadReceipt(latestEvent, ReceiptType.Read));
    }

    await Promise.all(requests);
  }

  setOptimisticRoomReadMarker(roomId, latestEventId);
  dispatchRoomMarkedAsRead(roomId);
}
