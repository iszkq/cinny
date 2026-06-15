import { WritableAtom, atom } from 'jotai';
import produce from 'immer';
import { ClientEvent, MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { AccountDataEvent, CinnyRoomNavCategoriesContent } from '../../types/matrix/accountData';
import { getLocalStorageItem, setLocalStorageItem } from './utils/atomWithLocalStorage';

const ROOM_NAV_CATEGORIES = 'roomNavCategories';
const ROOM_NAV_CATEGORIES_ACCOUNT_DATA_VERSION = 1;

export const FAVORITE_ROOM_NAV_CATEGORY_ID = 'favorites';
export const LEGACY_ROOM_NAV_CATEGORY_SCOPE = 'direct';

export type RoomNavCustomCategory = {
  id: string;
  scope: string;
  name: string;
  roomIds: string[];
};

export type RoomNavCategories = {
  favorites: string[];
  categories: RoomNavCustomCategory[];
};

type RoomNavCategoryPayload = {
  id: string;
  scope: string;
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
    }
  | {
      type: 'DELETE_CATEGORY';
      categoryId: string;
    }
  | {
      type: 'RENAME_CATEGORY';
      categoryId: string;
      name: string;
    }
  | {
      type: 'MOVE_CATEGORY';
      categoryId: string;
      direction: 'UP' | 'DOWN';
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

const isNonEmptyRoomNavCategories = (roomNavCategories: RoomNavCategories): boolean =>
  roomNavCategories.favorites.length > 0 || roomNavCategories.categories.length > 0;

const normalizeScope = (scope: unknown): string =>
  typeof scope === 'string' && scope.trim() ? scope.trim() : LEGACY_ROOM_NAV_CATEGORY_SCOPE;

export const getRoomNavCustomCategories = (
  roomNavCategories: RoomNavCategories,
  scope: string
): RoomNavCustomCategory[] =>
  roomNavCategories.categories.filter((category) => category.scope === scope);

export const getRoomNavCategorizedRoomIds = (
  roomNavCategories: RoomNavCategories,
  scope: string
): Set<string> => {
  const roomIds = new Set(roomNavCategories.favorites);

  getRoomNavCustomCategories(roomNavCategories, scope).forEach((category) => {
    category.roomIds.forEach((roomId) => roomIds.add(roomId));
  });

  return roomIds;
};

const normalizeRoomNavCategories = (
  value: Partial<RoomNavCategories> | CinnyRoomNavCategoriesContent
): RoomNavCategories => ({
  favorites: unique(Array.isArray(value.favorites) ? value.favorites : []),
  categories: (Array.isArray(value.categories) ? value.categories : [])
    .filter((category) => category && typeof category.id === 'string')
    .map((category) => ({
      id: category.id,
      scope: normalizeScope(category.scope),
      name:
        typeof category.name === 'string' && category.name.trim()
          ? category.name.trim()
          : '\u672a\u547d\u540d\u5206\u7c7b',
      roomIds: unique(Array.isArray(category.roomIds) ? category.roomIds : []),
    })),
});

const getRoomNavCategoriesAccountData = (mx: MatrixClient): RoomNavCategories | undefined => {
  const content = mx
    .getAccountData(AccountDataEvent.CinnyRoomNavCategories)
    ?.getContent<CinnyRoomNavCategoriesContent>();

  return content ? normalizeRoomNavCategories(content) : undefined;
};

const getRoomNavCategoriesAccountDataContent = (
  roomNavCategories: RoomNavCategories
): CinnyRoomNavCategoriesContent => ({
  version: ROOM_NAV_CATEGORIES_ACCOUNT_DATA_VERSION,
  updatedAt: Date.now(),
  ...normalizeRoomNavCategories(roomNavCategories),
});

const getStoredRoomNavCategories = (mx: MatrixClient, storeKey: string): RoomNavCategories => {
  const accountData = getRoomNavCategoriesAccountData(mx);
  if (accountData) return accountData;

  return normalizeRoomNavCategories(getLocalStorageItem(storeKey, DEFAULT_ROOM_NAV_CATEGORIES));
};

export const makeRoomNavCategoriesAtom = (
  userId: string,
  mx: MatrixClient
): RoomNavCategoriesAtom => {
  const storeKey = `${ROOM_NAV_CATEGORIES}${userId}`;

  const persistRoomNavCategories = (roomNavCategories: RoomNavCategories) => {
    const normalizedRoomNavCategories = normalizeRoomNavCategories(roomNavCategories);
    setLocalStorageItem(storeKey, normalizedRoomNavCategories);

    mx.setAccountData(
      AccountDataEvent.CinnyRoomNavCategories,
      getRoomNavCategoriesAccountDataContent(normalizedRoomNavCategories)
    ).catch(() => undefined);
  };

  const baseRoomNavCategoriesAtom = atom<RoomNavCategories>(
    getStoredRoomNavCategories(mx, storeKey)
  );

  baseRoomNavCategoriesAtom.onMount = (setAtom) => {
    const applyAccountData = (content?: CinnyRoomNavCategoriesContent) => {
      const nextRoomNavCategories = content
        ? normalizeRoomNavCategories(content)
        : DEFAULT_ROOM_NAV_CATEGORIES;

      setAtom(nextRoomNavCategories);
      setLocalStorageItem(storeKey, nextRoomNavCategories);
    };

    const accountData = mx
      .getAccountData(AccountDataEvent.CinnyRoomNavCategories)
      ?.getContent<CinnyRoomNavCategoriesContent>();

    if (accountData) {
      applyAccountData(accountData);
    } else {
      const localRoomNavCategories = normalizeRoomNavCategories(
        getLocalStorageItem(storeKey, DEFAULT_ROOM_NAV_CATEGORIES)
      );

      setAtom(localRoomNavCategories);

      if (isNonEmptyRoomNavCategories(localRoomNavCategories)) {
        mx.setAccountData(
          AccountDataEvent.CinnyRoomNavCategories,
          getRoomNavCategoriesAccountDataContent(localRoomNavCategories)
        ).catch(() => undefined);
      }
    }

    const handleAccountData = (event: MatrixEvent) => {
      if (event.getType() !== AccountDataEvent.CinnyRoomNavCategories) {
        return;
      }

      applyAccountData(event.getContent<CinnyRoomNavCategoriesContent>());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storeKey) return;

      setAtom(
        normalizeRoomNavCategories(getLocalStorageItem(storeKey, DEFAULT_ROOM_NAV_CATEGORIES))
      );
    };

    mx.on(ClientEvent.AccountData, handleAccountData);
    window.addEventListener('storage', handleStorage);

    return () => {
      mx.removeListener(ClientEvent.AccountData, handleAccountData);
      window.removeEventListener('storage', handleStorage);
    };
  };

  const roomNavCategoriesAtom = atom<RoomNavCategories, [RoomNavCategoriesAction], undefined>(
    (get) => get(baseRoomNavCategoriesAtom),
    (get, set, action): undefined => {
      const currentRoomNavCategories = get(baseRoomNavCategoriesAtom);
      const nextRoomNavCategories = produce(currentRoomNavCategories, (draft) => {
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
            scope: normalizeScope(action.category.scope),
            name,
            roomIds: unique(
              action.roomId
                ? [...(action.category.roomIds ?? []), action.roomId]
                : action.category.roomIds ?? []
            ),
          });
          return;
        }

        if (action.type === 'DELETE_CATEGORY') {
          const categoryIndex = draft.categories.findIndex((item) => item.id === action.categoryId);
          if (categoryIndex !== -1) {
            draft.categories.splice(categoryIndex, 1);
          }
          return;
        }

        if (action.type === 'RENAME_CATEGORY') {
          const name = action.name.trim();
          if (!name) return;

          const category = draft.categories.find((item) => item.id === action.categoryId);
          if (!category || category.name === name) return;

          category.name = name;
          return;
        }

        if (action.type === 'MOVE_CATEGORY') {
          const categoryIndex = draft.categories.findIndex((item) => item.id === action.categoryId);
          if (categoryIndex === -1) return;

          const categoryScope = draft.categories[categoryIndex].scope;
          const scopedCategoryIndexes = draft.categories.reduce<number[]>(
            (indexes, category, index) => {
              if (category.scope === categoryScope) indexes.push(index);
              return indexes;
            },
            []
          );
          const scopedCategoryIndex = scopedCategoryIndexes.indexOf(categoryIndex);
          const targetScopedCategoryIndex =
            action.direction === 'UP' ? scopedCategoryIndex - 1 : scopedCategoryIndex + 1;
          const targetCategoryIndex = scopedCategoryIndexes[targetScopedCategoryIndex];

          if (targetCategoryIndex === undefined) return;

          const currentCategory = draft.categories[categoryIndex];
          const targetCategory = draft.categories[targetCategoryIndex];
          draft.categories.splice(targetCategoryIndex, 1, currentCategory);
          draft.categories.splice(categoryIndex, 1, targetCategory);
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
      });

      if (nextRoomNavCategories === currentRoomNavCategories) {
        return undefined;
      }

      set(baseRoomNavCategoriesAtom, nextRoomNavCategories);
      persistRoomNavCategories(nextRoomNavCategories);
      return undefined;
    }
  );

  return roomNavCategoriesAtom;
};
