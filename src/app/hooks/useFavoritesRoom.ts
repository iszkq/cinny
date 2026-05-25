import { useMemo } from 'react';
import { Room } from 'matrix-js-sdk';
import { AccountDataEvent, CinnyFavoritesContent } from '../../types/matrix/accountData';
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
