import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useFavoritesRoomIds } from '../../../hooks/useFavoritesRoom';
import { mDirectAtom } from '../../../state/mDirectList';
import { allRoomsAtom } from '../../../state/room-list/roomList';
import { useDirects } from '../../../state/hooks/roomList';

export const useDirectRooms = () => {
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);
  const favoritesRoomIds = useFavoritesRoomIds();
  const directs = useDirects(mx, allRoomsAtom, mDirects);
  const favoritesRoomIdSet = useMemo(() => new Set(favoritesRoomIds), [favoritesRoomIds]);

  return useMemo(
    () => directs.filter((roomId) => !favoritesRoomIdSet.has(roomId)),
    [directs, favoritesRoomIdSet]
  );
};
