import { Direction, EventTimeline, MatrixClient } from 'matrix-js-sdk';
import { ImportRoomKeyProgressData } from 'matrix-js-sdk/lib/crypto-api';
import { decryptAllTimelineEvent } from './room';

type RestoreKeyBackupOptions = {
  progressCallback?: (progress: ImportRoomKeyProgressData) => void;
};

export const retryDecryptLoadedTimelines = async (mx: MatrixClient): Promise<void> => {
  const getFirstLinkedTimeline = (
    timeline: EventTimeline,
    direction: Direction
  ): EventTimeline => {
    const linkedTimeline = timeline.getNeighbouringTimeline(direction);
    if (!linkedTimeline) return timeline;
    return getFirstLinkedTimeline(linkedTimeline, direction);
  };

  const getLinkedTimelines = (timeline: EventTimeline): EventTimeline[] => {
    const firstTimeline = getFirstLinkedTimeline(timeline, Direction.Backward);
    const timelines: EventTimeline[] = [];

    for (
      let nextTimeline: EventTimeline | null = firstTimeline;
      nextTimeline;
      nextTimeline = nextTimeline.getNeighbouringTimeline(Direction.Forward)
    ) {
      timelines.push(nextTimeline);
    }

    return timelines;
  };

  await Promise.allSettled(
    mx
      .getRooms()
      .flatMap((room) => getLinkedTimelines(room.getUnfilteredTimelineSet().getLiveTimeline()))
      .map((timeline) => decryptAllTimelineEvent(mx, timeline))
  );
};

export const restoreKeyBackupAndDecrypt = async (
  mx: MatrixClient,
  options: RestoreKeyBackupOptions = {}
): Promise<void> => {
  const crypto = mx.getCrypto();
  if (!crypto) {
    throw new Error('Unexpected Error! Crypto module not found.');
  }

  await crypto.restoreKeyBackup({
    progressCallback: options.progressCallback,
  });

  await retryDecryptLoadedTimelines(mx);
};
