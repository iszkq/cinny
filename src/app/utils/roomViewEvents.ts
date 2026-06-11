export const ROOM_FOLLOW_LATEST = 'cinny.room_follow_latest';

export const dispatchRoomFollowLatest = (roomId: string) => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<{ roomId: string }>(ROOM_FOLLOW_LATEST, {
      detail: { roomId },
    })
  );
};
