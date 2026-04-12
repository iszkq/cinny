import { useMemo } from 'react';
import { Room } from 'matrix-js-sdk';
import { AccountDataEvent, CinnyFavoritesContent } from '../../types/matrix/accountData';
import { getFavoritesRoomIdFromAccountData } from '../features/favorites/types';
import { useAccountData } from './useAccountData';
import { useMatrixClient } from './useMatrixClient';

export const useFavoritesRoomId = (): string | undefined => {
  const favoritesEvent = useAccountData(AccountDataEvent.CinnyFavorites);

  return getFavoritesRoomIdFromAccountData(
    favoritesEvent?.getContent<CinnyFavoritesContent>()
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
