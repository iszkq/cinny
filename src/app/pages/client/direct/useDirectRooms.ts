import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useFavoritesRoomId } from '../../../hooks/useFavoritesRoom';
import { mDirectAtom } from '../../../state/mDirectList';
import { allRoomsAtom } from '../../../state/room-list/roomList';
import { useDirects } from '../../../state/hooks/roomList';

export const useDirectRooms = () => {
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);
  const favoritesRoomId = useFavoritesRoomId();
  const directs = useDirects(mx, allRoomsAtom, mDirects);

  return useMemo(
    () => directs.filter((roomId) => roomId !== favoritesRoomId),
    [directs, favoritesRoomId]
  );
};
