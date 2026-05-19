import { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import { ImagePack } from './ImagePack';
import { EmoteRoomsContent, ImageUsage, PackContent } from './types';
import { StateEvent } from '../../../types/matrix/room';
import { getAccountData, getStateEvent, getStateEvents } from '../../utils/room';
import { AccountDataEvent } from '../../../types/matrix/accountData';
import { PackMetaReader } from './PackMetaReader';
import { PackAddress } from './PackAddress';
import {
  getCustomUserImagePacksContent,
  getEditableDefaultUserImagePackContent,
  getPersonalPackOrder,
} from './personalPacks';

export function packAddressEqual(a1?: PackAddress, a2?: PackAddress): boolean {
  if (!a1 && !a2) return true;
  if (!a1 || !a2) return false;
  return a1.roomId === a2.roomId && a1.stateKey === a2.stateKey;
}

export function imageUsageEqual(u1: ImageUsage[], u2: ImageUsage[]) {
  return u1.length === u2.length && u1.every((u) => u2.includes(u));
}

export function packMetaEqual(a: PackMetaReader, b: PackMetaReader): boolean {
  return (
    a.name === b.name &&
    a.avatar === b.avatar &&
    a.attribution === b.attribution &&
    imageUsageEqual(a.usage, b.usage)
  );
}

export function makeImagePacks(packEvents: MatrixEvent[]): ImagePack[] {
  return packEvents.reduce<ImagePack[]>((imagePacks, packEvent) => {
    const packId = packEvent.getId();
    if (!packId) return imagePacks;
    imagePacks.push(ImagePack.fromMatrixEvent(packId, packEvent));
    return imagePacks;
  }, []);
}

export function getRoomImagePack(room: Room, stateKey: string): ImagePack | undefined {
  const packEvent = getStateEvent(room, StateEvent.PoniesRoomEmotes, stateKey);
  if (!packEvent) return undefined;
  const packId = packEvent.getId();
  if (!packId) return undefined;
  return ImagePack.fromMatrixEvent(packId, packEvent);
}

export function getRoomImagePacks(room: Room): ImagePack[] {
  const packEvents = getStateEvents(room, StateEvent.PoniesRoomEmotes);
  return makeImagePacks(packEvents);
}

export function getGlobalImagePacks(mx: MatrixClient): ImagePack[] {
  const emoteRoomsContent = getAccountData(mx, AccountDataEvent.PoniesEmoteRooms)?.getContent() as
    | EmoteRoomsContent
    | undefined;
  if (typeof emoteRoomsContent !== 'object') return [];

  const { rooms: roomIdToPackInfo } = emoteRoomsContent;
  if (typeof roomIdToPackInfo !== 'object') return [];

  const roomIds = Object.keys(roomIdToPackInfo);

  const packs = roomIds.flatMap((roomId) => {
    if (typeof roomIdToPackInfo[roomId] !== 'object') return [];
    const room = mx.getRoom(roomId);
    if (!room) return [];
    const packStateKeyToUnknown = roomIdToPackInfo[roomId];
    const packEvents = getStateEvents(room, StateEvent.PoniesRoomEmotes);
    const globalPackEvents = packEvents.filter((mE) => {
      const stateKey = mE.getStateKey();
      if (typeof stateKey === 'string') return !!packStateKeyToUnknown[stateKey];
      return false;
    });
    return makeImagePacks(globalPackEvents);
  });

  return packs;
}

export function getCustomUserImagePacks(mx: MatrixClient): ImagePack[] {
  const content = getCustomUserImagePacksContent(mx);
  if (!content.packs || typeof content.packs !== 'object') return [];

  const unorderedPacks = Object.entries(content.packs).reduce<ImagePack[]>((packs, [packId, packContent]) => {
    if (!packContent || typeof packContent !== 'object') return packs;

    packs.push(new ImagePack(packId, packContent as PackContent, undefined));
    return packs;
  }, []);

  const orderedIds = getPersonalPackOrder(
    content,
    unorderedPacks.map((pack) => pack.id)
  );
  const orderIndex = new Map(orderedIds.map((packId, index) => [packId, index]));

  return unorderedPacks.sort(
    (a, b) =>
      (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  );
}

export function getCustomUserImagePack(mx: MatrixClient, packId: string): ImagePack | undefined {
  return getCustomUserImagePacks(mx).find((pack) => pack.id === packId);
}

export function getUserImagePack(mx: MatrixClient): ImagePack | undefined {
  const userId = mx.getUserId();
  const userPackContent = getEditableDefaultUserImagePackContent(mx);

  if (!userId || (userPackContent.pack === undefined && userPackContent.images === undefined)) {
    return undefined;
  }

  return new ImagePack(userId, userPackContent, undefined);
}
