export const ROOM_FOLLOW_LATEST = 'cinny.room_follow_latest';
export const ROOM_COMPOSER_ACTION = 'cinny.room_composer_action';
export const ROOM_COMPOSER_VIEWPORT_CHANGE = 'cinny.room_composer_viewport_change';

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

export const dispatchRoomComposerViewportChange = (roomId: string) => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<{ roomId: string }>(ROOM_COMPOSER_VIEWPORT_CHANGE, {
      detail: { roomId },
    })
  );
};
