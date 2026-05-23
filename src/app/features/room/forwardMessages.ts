import { EventType, IContent, MatrixClient } from 'matrix-js-sdk';
import { MessageEvent } from '../../../types/matrix/room';
import {
  combinePollSummaries,
  attachPollSummarySnapshot,
  createPollSummarySnapshot,
  getCachedPollRelationEvents,
  getPersistedPollSummarySnapshot,
  getPollSummarySnapshot,
  OUTGOING_POLL_START_EVENT_TYPE,
  parsePollData,
  pollSummaryFromSnapshot,
  primePollRelationEventsCache,
  summarizePoll,
  UNSTABLE_POLL_START_EVENT_TYPE,
} from '../../utils/polls';

export type ForwardableMessage = {
  eventId: string;
  roomId: string;
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

const createForwardedPollContent = (
  mx: MatrixClient,
  message: ForwardableMessage,
  forwardedContent: IContent
): IContent => {
  const sourceRoom = mx.getRoom(message.roomId);
  const poll = parsePollData(message.content);
  const optionIds = poll?.options.map((option) => option.id) ?? [];

  if (!sourceRoom || !poll) {
    return forwardedContent;
  }

  const embeddedSnapshot = getPollSummarySnapshot(message.content);
  const persistedSnapshot = getPersistedPollSummarySnapshot(message.roomId, message.eventId);
  const snapshotSummary = (() => {
    const embeddedSummary =
      embeddedSnapshot && optionIds.length > 0
        ? pollSummaryFromSnapshot(embeddedSnapshot, optionIds)
        : undefined;
    const persistedSummary =
      persistedSnapshot && optionIds.length > 0
        ? pollSummaryFromSnapshot(persistedSnapshot, optionIds)
        : undefined;

    if (embeddedSummary && persistedSummary) {
      return combinePollSummaries(embeddedSummary, persistedSummary);
    }

    return persistedSummary ?? embeddedSummary;
  })();
  const cachedEvents = primePollRelationEventsCache(sourceRoom, message.eventId);
  const liveSummary = summarizePoll(
    sourceRoom,
    message.eventId,
    poll,
    mx.getUserId() ?? undefined,
    getCachedPollRelationEvents(sourceRoom.roomId, message.eventId).length > 0
      ? getCachedPollRelationEvents(sourceRoom.roomId, message.eventId)
      : cachedEvents
  );
  const summary =
    snapshotSummary && getPollSummarySnapshot(message.content)
      ? combinePollSummaries(snapshotSummary, liveSummary)
      : snapshotSummary && cachedEvents.length === 0
        ? combinePollSummaries(snapshotSummary, liveSummary)
        : liveSummary;

  return attachPollSummarySnapshot(
    forwardedContent,
    createPollSummarySnapshot(summary, false)
  );
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
        const forwardedPollContent = createForwardedPollContent(mx, message, forwardedContent);
        // eslint-disable-next-line no-await-in-loop
        await mx.sendEvent(roomId, OUTGOING_POLL_START_EVENT_TYPE, forwardedPollContent);
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await mx.sendMessage(roomId, forwardedContent as never);
    }
  }
};
