import { createContext, useContext } from 'react';
import { RoomNavCategoriesAtom } from '../roomNavCategories';

const RoomNavCategoriesAtomContext = createContext<RoomNavCategoriesAtom | null>(null);
export const RoomNavCategoriesProvider = RoomNavCategoriesAtomContext.Provider;

export const useRoomNavCategoriesAtom = (): RoomNavCategoriesAtom => {
  const anAtom = useContext(RoomNavCategoriesAtomContext);

  if (!anAtom) {
    throw new Error('RoomNavCategoriesAtom is not provided!');
  }

  return anAtom;
};
