import { createContext, useContext, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { getRoomNavCategorizedRoomIds, RoomNavCategoriesAtom } from '../roomNavCategories';

const RoomNavCategoriesAtomContext = createContext<RoomNavCategoriesAtom | null>(null);
export const RoomNavCategoriesProvider = RoomNavCategoriesAtomContext.Provider;

export const useRoomNavCategoriesAtom = (): RoomNavCategoriesAtom => {
  const anAtom = useContext(RoomNavCategoriesAtomContext);

  if (!anAtom) {
    throw new Error('RoomNavCategoriesAtom is not provided!');
  }

  return anAtom;
};

export const useRoomNavCategorizedRoomIds = (scope: string): Set<string> => {
  const roomNavCategories = useAtomValue(useRoomNavCategoriesAtom());

  return useMemo(
    () => getRoomNavCategorizedRoomIds(roomNavCategories, scope),
    [roomNavCategories, scope]
  );
};
