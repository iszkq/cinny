import { MatrixClient } from 'matrix-js-sdk';
import { CreateRoomAccess, createRoom } from '../../components/create-room';
import { AccountDataEvent, CinnyFavoritesContent } from '../../../types/matrix/accountData';
import {
  getFavoritesRoomIdFromAccountData,
  getHiddenFavoritesRoomIdsFromAccountData,
} from './types';

const FAVORITES_ROOM_NAME = '\u6211\u7684\u6536\u85cf';
const FAVORITES_ROOM_TOPIC =
  '\u8fd9\u91cc\u4f1a\u4fdd\u5b58\u4f60\u6536\u85cf\u7684\u6d88\u606f\u526f\u672c\uff0c\u4ec5\u7528\u4e8e\u4f60\u81ea\u5df1\u7684\u6536\u85cf\u67e5\u770b\u3002';

let creatingFavoritesRoom: Promise<string> | undefined;
let migratingFavoritesRoom: Promise<string> | undefined;

const getDefaultRoomVersion = async (mx: MatrixClient): Promise<string> => {
  try {
    const capabilities = await mx.getCapabilities();
    return capabilities['m.room_versions']?.default ?? '1';
  } catch (error) {
    console.error(error);
    return '1';
  }
};

const getFavoritesAccountData = (mx: MatrixClient): CinnyFavoritesContent | undefined =>
  mx.getAccountData(AccountDataEvent.CinnyFavorites)?.getContent<CinnyFavoritesContent>();

const createFavoritesAccountData = (
  roomId: string,
  content?: CinnyFavoritesContent,
  legacyRoomIds?: string[]
): CinnyFavoritesContent => ({
  roomId,
  createdAt: typeof content?.createdAt === 'number' ? content.createdAt : Date.now(),
  version: Math.max(typeof content?.version === 'number' ? content.version : 0, 2),
  legacyRoomIds:
    legacyRoomIds ?? getHiddenFavoritesRoomIdsFromAccountData(content),
});

const createFavoritesRoomInternal = async (mx: MatrixClient): Promise<string> => {
  const roomVersion = await getDefaultRoomVersion(mx);

  return createRoom(mx, {
    version: roomVersion,
    access: CreateRoomAccess.Private,
    name: FAVORITES_ROOM_NAME,
    topic: FAVORITES_ROOM_TOPIC,
    encryption: false,
    knock: false,
    allowFederation: true,
  });
};

export const getFavoritesRoomId = (mx: MatrixClient): string | undefined =>
  getFavoritesRoomIdFromAccountData(getFavoritesAccountData(mx));

export const ensureFavoritesRoom = async (mx: MatrixClient): Promise<string> => {
  const content = getFavoritesAccountData(mx);
  const existingRoomId = getFavoritesRoomIdFromAccountData(content);

  if (existingRoomId) {
    const existingRoom = mx.getRoom(existingRoomId);
    if (existingRoom?.getMyMembership() === 'join') {
      return existingRoomId;
    }
  }

  if (creatingFavoritesRoom) return creatingFavoritesRoom;

  creatingFavoritesRoom = (async () => {
    const roomId = await createFavoritesRoomInternal(mx);

    await mx.setAccountData(
      AccountDataEvent.CinnyFavorites,
      createFavoritesAccountData(roomId, content)
    );

    return roomId;
  })();

  try {
    return await creatingFavoritesRoom;
  } finally {
    creatingFavoritesRoom = undefined;
  }
};

export const migrateFavoritesRoomToUnencrypted = async (mx: MatrixClient): Promise<string> => {
  const content = getFavoritesAccountData(mx);
  const currentRoomId = getFavoritesRoomIdFromAccountData(content);
  const currentRoom = currentRoomId ? mx.getRoom(currentRoomId) : undefined;

  if (
    currentRoomId &&
    currentRoom?.getMyMembership() === 'join' &&
    !currentRoom.hasEncryptionStateEvent()
  ) {
    return currentRoomId;
  }

  if (migratingFavoritesRoom) return migratingFavoritesRoom;

  migratingFavoritesRoom = (async () => {
    const roomId = await createFavoritesRoomInternal(mx);
    const nextLegacyRoomIds = getHiddenFavoritesRoomIdsFromAccountData(content);

    if (currentRoomId && currentRoomId !== roomId) {
      nextLegacyRoomIds.unshift(currentRoomId);
    }

    await mx.setAccountData(
      AccountDataEvent.CinnyFavorites,
      createFavoritesAccountData(
        roomId,
        content,
        Array.from(new Set(nextLegacyRoomIds)).filter((legacyRoomId) => legacyRoomId !== roomId)
      )
    );

    if (currentRoomId && currentRoom?.getMyMembership() === 'join') {
      await mx.leave(currentRoomId).catch(() => undefined);
    }

    return roomId;
  })();

  try {
    return await migratingFavoritesRoom;
  } finally {
    migratingFavoritesRoom = undefined;
  }
};
