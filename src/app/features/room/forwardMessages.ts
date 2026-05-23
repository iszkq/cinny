import { EventType, IContent, MatrixClient } from 'matrix-js-sdk';
import { MessageEvent } from '../../../types/matrix/room';
import { UNSTABLE_POLL_START_EVENT_TYPE } from '../../utils/polls';

export type ForwardableMessage = {
  eventId: string;
  eventType: string;
  content: IContent;
  senderId?: string;
  senderName: string;
  timestamp: number;
};

const cloneContent = (content: IContent): IContent => JSON.parse(JSON.stringify(content));

const sanitizeForwardContent = (content: IContent): IContent => {
  const forwardedContent = cloneContent(content);

  delete forwardedContent['m.relates_to'];
  delete forwardedContent['m.mentions'];

  return forwardedContent;
};

export const isForwardableMessage = (eventType: string, content: IContent): boolean => {
  if (eventType === MessageEvent.Sticker) {
    return typeof content.url === 'string' || typeof content.file?.url === 'string';
  }

  if (eventType === MessageEvent.PollStart || eventType === UNSTABLE_POLL_START_EVENT_TYPE) {
    return true;
  }

  if (eventType !== MessageEvent.RoomMessage) return false;
  if (typeof content.msgtype !== 'string') return false;

  return true;
};

export const forwardMessagesToRooms = async (
  mx: MatrixClient,
  roomIds: string[],
  messages: ForwardableMessage[]
): Promise<void> => {
  const sortedMessages = [...messages].sort((a, b) => a.timestamp - b.timestamp);

  for (const roomId of roomIds) {
    for (const message of sortedMessages) {
      const forwardedContent = sanitizeForwardContent(message.content);

      if (message.eventType === MessageEvent.Sticker) {
        // Stickers are sent as their own event type rather than m.room.message.
        // Re-sending the same payload lets us forward them across rooms.
        // eslint-disable-next-line no-await-in-loop
        await mx.sendEvent(roomId, EventType.Sticker, forwardedContent);
        continue;
      }

      if (
        message.eventType === MessageEvent.PollStart ||
        message.eventType === UNSTABLE_POLL_START_EVENT_TYPE
      ) {
        // eslint-disable-next-line no-await-in-loop
        await mx.sendEvent(roomId, MessageEvent.PollStart as any, forwardedContent);
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await mx.sendMessage(roomId, forwardedContent as never);
    }
  }
};
