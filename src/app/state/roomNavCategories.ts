import { WritableAtom, atom } from 'jotai';
import produce from 'immer';
import {
  atomWithLocalStorage,
  getLocalStorageItem,
  setLocalStorageItem,
} from './utils/atomWithLocalStorage';

const ROOM_NAV_CATEGORIES = 'roomNavCategories';

export const FAVORITE_ROOM_NAV_CATEGORY_ID = 'favorites';

export type RoomNavCustomCategory = {
  id: string;
  name: string;
  roomIds: string[];
};

export type RoomNavCategories = {
  favorites: string[];
  categories: RoomNavCustomCategory[];
};

type RoomNavCategoryPayload = {
  id: string;
  name: string;
  roomIds?: string[];
};

type RoomNavCategoriesAction =
  | {
      type: 'ADD_FAVORITE';
      roomId: string;
    }
  | {
      type: 'REMOVE_FAVORITE';
      roomId: string;
    }
  | {
      type: 'CREATE_CATEGORY';
      category: RoomNavCategoryPayload;
      roomId?: string;
    }
  | {
      type: 'ADD_TO_CATEGORY';
      categoryId: string;
      roomId: string;
    }
  | {
      type: 'REMOVE_FROM_CATEGORY';
      categoryId: string;
      roomId: string;
    };

export type RoomNavCategoriesAtom = WritableAtom<
  RoomNavCategories,
  [RoomNavCategoriesAction],
  undefined
>;

const DEFAULT_ROOM_NAV_CATEGORIES: RoomNavCategories = {
  favorites: [],
  categories: [],
};

const unique = (items: string[]): string[] => Array.from(new Set(items));

const normalizeRoomNavCategories = (value: Partial<RoomNavCategories>): RoomNavCategories => ({
  favorites: unique(Array.isArray(value.favorites) ? value.favorites : []),
  categories: (Array.isArray(value.categories) ? value.categories : [])
    .filter((category) => category && typeof category.id === 'string')
    .map((category) => ({
      id: category.id,
      name:
        typeof category.name === 'string' && category.name.trim()
          ? category.name.trim()
          : '\u672a\u547d\u540d\u5206\u7c7b',
      roomIds: unique(Array.isArray(category.roomIds) ? category.roomIds : []),
    })),
});

export const makeRoomNavCategoriesAtom = (userId: string): RoomNavCategoriesAtom => {
  const storeKey = `${ROOM_NAV_CATEGORIES}${userId}`;

  const baseRoomNavCategoriesAtom = atomWithLocalStorage<RoomNavCategories>(
    storeKey,
    (key) => normalizeRoomNavCategories(getLocalStorageItem(key, DEFAULT_ROOM_NAV_CATEGORIES)),
    (key, value) => setLocalStorageItem(key, normalizeRoomNavCategories(value))
  );

  const roomNavCategoriesAtom = atom<RoomNavCategories, [RoomNavCategoriesAction], undefined>(
    (get) => get(baseRoomNavCategoriesAtom),
    (get, set, action): undefined => {
      set(
        baseRoomNavCategoriesAtom,
        produce(get(baseRoomNavCategoriesAtom), (draft) => {
          if (action.type === 'ADD_FAVORITE') {
            if (!draft.favorites.includes(action.roomId)) {
              draft.favorites.push(action.roomId);
            }
            return;
          }

          if (action.type === 'REMOVE_FAVORITE') {
            const favoriteIndex = draft.favorites.indexOf(action.roomId);
            if (favoriteIndex !== -1) {
              draft.favorites.splice(favoriteIndex, 1);
            }
            return;
          }

          if (action.type === 'CREATE_CATEGORY') {
            const name = action.category.name.trim();
            if (!name || draft.categories.some((category) => category.id === action.category.id)) {
              return;
            }

            draft.categories.push({
              id: action.category.id,
              name,
              roomIds: unique(
                action.roomId
                  ? [...(action.category.roomIds ?? []), action.roomId]
                  : action.category.roomIds ?? []
              ),
            });
            return;
          }

          const category = draft.categories.find((item) => item.id === action.categoryId);
          if (!category) return;

          if (action.type === 'ADD_TO_CATEGORY') {
            if (!category.roomIds.includes(action.roomId)) {
              category.roomIds.push(action.roomId);
            }
            return;
          }

          if (action.type === 'REMOVE_FROM_CATEGORY') {
            const roomIndex = category.roomIds.indexOf(action.roomId);
            if (roomIndex !== -1) {
              category.roomIds.splice(roomIndex, 1);
            }
          }
        })
      );
      return undefined;
    }
  );

  return roomNavCategoriesAtom;
};
