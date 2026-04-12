import { MatrixClient } from 'matrix-js-sdk';
import { CreateRoomAccess, createRoom } from '../../components/create-room';
import { AccountDataEvent, CinnyFavoritesContent } from '../../../types/matrix/accountData';
import { getFavoritesRoomIdFromAccountData } from './types';

const FAVORITES_ROOM_NAME = '我的收藏';
const FAVORITES_ROOM_TOPIC = '这里会保存你收藏的消息副本，仅用于你自己的收藏查看。';

let creatingFavoritesRoom: Promise<string> | undefined;

const getDefaultRoomVersion = async (mx: MatrixClient): Promise<string> => {
  try {
    const capabilities = await mx.getCapabilities();
    return capabilities['m.room_versions']?.default ?? '1';
  } catch (error) {
    console.error(error);
    return '1';
  }
};

export const getFavoritesRoomId = (mx: MatrixClient): string | undefined => {
  const content = mx
    .getAccountData(AccountDataEvent.CinnyFavorites)
    ?.getContent<CinnyFavoritesContent>();

  return getFavoritesRoomIdFromAccountData(content);
};

export const ensureFavoritesRoom = async (mx: MatrixClient): Promise<string> => {
  const existingRoomId = getFavoritesRoomId(mx);
  if (existingRoomId) {
    const existingRoom = mx.getRoom(existingRoomId);
    if (existingRoom?.getMyMembership() === 'join') {
      return existingRoomId;
    }
  }

  if (creatingFavoritesRoom) return creatingFavoritesRoom;

  creatingFavoritesRoom = (async () => {
    const roomVersion = await getDefaultRoomVersion(mx);
    const roomId = await createRoom(mx, {
      version: roomVersion,
      access: CreateRoomAccess.Private,
      name: FAVORITES_ROOM_NAME,
      topic: FAVORITES_ROOM_TOPIC,
      encryption: Boolean((mx as any).getCrypto?.() ?? (mx as any).isCryptoEnabled?.()),
      knock: false,
      allowFederation: true,
    });

    const content: CinnyFavoritesContent = {
      roomId,
      createdAt: Date.now(),
      version: 1,
    };
    await mx.setAccountData(AccountDataEvent.CinnyFavorites, content);

    return roomId;
  })();

  try {
    return await creatingFavoritesRoom;
  } finally {
    creatingFavoritesRoom = undefined;
  }
};
