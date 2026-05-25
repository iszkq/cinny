import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useFavoritesRoomIds } from '../../../hooks/useFavoritesRoom';
import { mDirectAtom } from '../../../state/mDirectList';
import { roomToParentsAtom } from '../../../state/room/roomToParents';
import { allRoomsAtom } from '../../../state/room-list/roomList';
import { useOrphanRooms } from '../../../state/hooks/roomList';

export const useHomeRooms = () => {
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);
  const roomToParents = useAtomValue(roomToParentsAtom);
  const favoritesRoomIds = useFavoritesRoomIds();
  const rooms = useOrphanRooms(mx, allRoomsAtom, mDirects, roomToParents);
  const favoritesRoomIdSet = useMemo(() => new Set(favoritesRoomIds), [favoritesRoomIds]);

  return useMemo(
    () => rooms.filter((roomId) => !favoritesRoomIdSet.has(roomId)),
    [rooms, favoritesRoomIdSet]
  );
};
