import { useMemo } from 'react';
import { Room } from 'matrix-js-sdk';
import { AccountDataEvent, CinnyFavoritesContent } from '../../types/matrix/accountData';
import {
  FAVORITES_ROOM_NAME,
} from '../features/favorites/favoritesRoom';
import {
  getAllFavoritesRoomIdsFromAccountData,
  getFavoritesRoomIdFromAccountData,
} from '../features/favorites/types';
import { useAccountData } from './useAccountData';
import { useMatrixClient } from './useMatrixClient';

const useFavoritesContent = (): CinnyFavoritesContent | undefined =>
  useAccountData(AccountDataEvent.CinnyFavorites)?.getContent<CinnyFavoritesContent>();

export const useFavoritesRoomId = (): string | undefined => {
  const favoritesContent = useFavoritesContent();

  return getFavoritesRoomIdFromAccountData(favoritesContent);
};

export const useFavoritesRoomIds = (): string[] => {
  const favoritesContent = useFavoritesContent();

  return useMemo(
    () => getAllFavoritesRoomIdsFromAccountData(favoritesContent),
    [favoritesContent]
  );
};

export const useFavoritesRoom = (): Room | undefined => {
  const mx = useMatrixClient();
  const favoritesRoomId = useFavoritesRoomId();

  return useMemo(() => {
    if (!favoritesRoomId) return undefined;
    return mx.getRoom(favoritesRoomId) ?? undefined;
  }, [mx, favoritesRoomId]);
};

export const useFavoritesRooms = (): Room[] => {
  const mx = useMatrixClient();
  const favoritesRoomIds = useFavoritesRoomIds();

  return useMemo(() => {
    const knownRoomIds = new Set(favoritesRoomIds);
    const rooms = favoritesRoomIds
      .map((roomId) => mx.getRoom(roomId) ?? undefined)
      .filter((room): room is Room => !!room && room.getMyMembership() === 'join');

    mx.getRooms().forEach((room) => {
      if (knownRoomIds.has(room.roomId)) return;
      if (room.getMyMembership() !== 'join') return;
      if (room.name !== FAVORITES_ROOM_NAME) return;

      rooms.push(room);
    });

    return rooms;
  }, [mx, favoritesRoomIds]);
};
