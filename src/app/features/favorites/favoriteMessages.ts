import { EventType, IContent, MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import { MessageEvent } from '../../../types/matrix/room';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../utils/room';
import { getMxIdLocalPart } from '../../utils/matrix';
import {
  OUTGOING_POLL_START_EVENT_TYPE,
  UNSTABLE_POLL_START_EVENT_TYPE,
} from '../../utils/polls';
import { isForwardableMessage } from '../room/forwardMessages';
import {
  CINNY_FAVORITE_CONTENT_KEY,
  FavoriteMessageContent,
  FavoriteMessageMetadata,
  getFavoriteMessageMetadataFromEvent,
} from './types';

const cloneContent = (content: IContent): IContent => JSON.parse(JSON.stringify(content));

const sanitizeFavoriteContent = (content: IContent): FavoriteMessageContent => {
  const favoriteContent = cloneContent(content) as FavoriteMessageContent;

  delete favoriteContent['m.relates_to'];
  delete favoriteContent['m.mentions'];

  return favoriteContent;
};

export const getFavoriteEventsBySource = (
  room: Room | undefined,
  sourceRoomId: string,
  sourceEventId: string
): MatrixEvent[] => {
  if (!room || !sourceEventId) return [];

  return room
    .getLiveTimeline()
    .getEvents()
    .filter((event) => {
      if (event.isRedacted()) return false;

      const metadata = getFavoriteMessageMetadataFromEvent(event);
      return (
        metadata?.sourceRoomId === sourceRoomId && metadata.sourceEventId === sourceEventId
      );
    });
};

export const favoriteMessageToRoom = async (
  mx: MatrixClient,
  targetRoomId: string,
  sourceRoom: Room,
  mEvent: MatrixEvent
): Promise<string | undefined> => {
  const eventType = mEvent.getType();
  const content = mEvent.getContent();
  const sourceEventId = mEvent.getId() ?? '';

  if (!isForwardableMessage(eventType, content)) {
    throw new Error('Unsupported favorite message type.');
  }

  const targetRoom = mx.getRoom(targetRoomId) ?? undefined;
  const existingFavorite = getFavoriteEventsBySource(
    targetRoom,
    sourceRoom.roomId,
    sourceEventId
  )[0];
  if (existingFavorite) {
    return existingFavorite.getId() ?? undefined;
  }

  const senderId = mEvent.getSender();
  const senderName =
    (senderId && getMemberDisplayName(sourceRoom, senderId)) ??
    (senderId && getMxIdLocalPart(senderId)) ??
    senderId ??
    '\u672a\u77e5\u7528\u6237';

  const favoriteContent = sanitizeFavoriteContent(content);
  const metadata: FavoriteMessageMetadata = {
    version: 1,
    sourceRoomId: sourceRoom.roomId,
    sourceRoomName: sourceRoom.name ?? sourceRoom.roomId,
    sourceRoomAvatarMxc: sourceRoom.getMxcAvatarUrl() ?? undefined,
    sourceEventId,
    sourceSenderId: senderId ?? undefined,
    sourceSenderName: senderName,
    sourceSenderAvatarMxc: senderId ? getMemberAvatarMxc(sourceRoom, senderId) : undefined,
    sourceTimestamp: mEvent.getTs(),
    favoritedAt: Date.now(),
  };

  favoriteContent[CINNY_FAVORITE_CONTENT_KEY] = metadata;

  if (eventType === MessageEvent.Sticker) {
    const response = await mx.sendEvent(targetRoomId, EventType.Sticker, favoriteContent);
    return response?.event_id;
  }

  if (eventType === MessageEvent.PollStart || eventType === UNSTABLE_POLL_START_EVENT_TYPE) {
    const response = await mx.sendEvent(targetRoomId, OUTGOING_POLL_START_EVENT_TYPE, favoriteContent);
    return response?.event_id;
  }

  const response = await mx.sendMessage(targetRoomId, favoriteContent as never);
  return response?.event_id;
};

export const removeFavoriteMessage = async (
  mx: MatrixClient,
  roomId: string,
  eventId: string
): Promise<void> => {
  if (!eventId) throw new Error('Missing favorite event id.');

  await mx.redactEvent(roomId, eventId);
};
