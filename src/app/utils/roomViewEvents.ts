export const ROOM_FOLLOW_LATEST = 'cinny.room_follow_latest';
export const ROOM_COMPOSER_ACTION = 'cinny.room_composer_action';

export type RoomComposerAction = 'poll' | 'note';

export const dispatchRoomFollowLatest = (roomId: string) => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<{ roomId: string }>(ROOM_FOLLOW_LATEST, {
      detail: { roomId },
    })
  );
};

export const dispatchRoomComposerAction = (roomId: string, action: RoomComposerAction) => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<{ roomId: string; action: RoomComposerAction }>(ROOM_COMPOSER_ACTION, {
      detail: { roomId, action },
    })
  );
};
