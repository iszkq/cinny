import { EventType, IContent, MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import { MessageEvent } from '../../../types/matrix/room';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../utils/room';
import { getMxIdLocalPart } from '../../utils/matrix';
import { isForwardableMessage } from '../room/forwardMessages';
import { CINNY_FAVORITE_CONTENT_KEY, FavoriteMessageContent, FavoriteMessageMetadata } from './types';

const cloneContent = (content: IContent): IContent => JSON.parse(JSON.stringify(content));

const sanitizeFavoriteContent = (content: IContent): FavoriteMessageContent => {
  const favoriteContent = cloneContent(content) as FavoriteMessageContent;

  delete favoriteContent['m.relates_to'];
  delete favoriteContent['m.mentions'];

  return favoriteContent;
};

export const favoriteMessageToRoom = async (
  mx: MatrixClient,
  targetRoomId: string,
  sourceRoom: Room,
  mEvent: MatrixEvent
): Promise<void> => {
  const eventType = mEvent.getType();
  const content = mEvent.getContent();

  if (!isForwardableMessage(eventType, content)) {
    throw new Error('Unsupported favorite message type.');
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
    sourceEventId: mEvent.getId() ?? '',
    sourceSenderId: senderId ?? undefined,
    sourceSenderName: senderName,
    sourceSenderAvatarMxc: senderId ? getMemberAvatarMxc(sourceRoom, senderId) : undefined,
    sourceTimestamp: mEvent.getTs(),
    favoritedAt: Date.now(),
  };

  favoriteContent[CINNY_FAVORITE_CONTENT_KEY] = metadata;

  if (eventType === MessageEvent.Sticker) {
    await mx.sendEvent(targetRoomId, EventType.Sticker, favoriteContent);
    return;
  }

  await mx.sendMessage(targetRoomId, favoriteContent as never);
};

export const removeFavoriteMessage = async (
  mx: MatrixClient,
  roomId: string,
  eventId: string
): Promise<void> => {
  if (!eventId) throw new Error('Missing favorite event id.');

  await mx.redactEvent(roomId, eventId);
};
