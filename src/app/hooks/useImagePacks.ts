import { Room } from 'matrix-js-sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { StateEvent } from '../../types/matrix/room';
import { mxcUrlToHttp } from '../utils/matrix';
import {
  ensurePersonalPackSync,
  getCustomUserImagePack,
  getCustomUserImagePacks,
  getGlobalImagePacks,
  getRoomImagePack,
  getRoomImagePacks,
  getUserImagePack,
  ImagePack,
  ImageUsage,
} from '../plugins/custom-emoji';
import { useMediaAuthentication } from './useMediaAuthentication';
import { useMatrixClient } from './useMatrixClient';
import { useAccountDataCallback } from './useAccountDataCallback';
import { useStateEventCallback } from './useStateEventCallback';

const IMAGE_PACK_PRELOAD_CONCURRENCY = 4;

type ImagePackPreloadTask = {
  url: string;
  resolve: () => void;
};

const warmedImagePackUrls = new Set<string>();
const pendingImagePackPreloads = new Map<string, Promise<void>>();
const imagePackPreloadQueue: ImagePackPreloadTask[] = [];
let activeImagePackPreloads = 0;

const flushImagePackPreloadQueue = () => {
  if (typeof Image === 'undefined') {
    while (imagePackPreloadQueue.length > 0) {
      const task = imagePackPreloadQueue.shift();
      if (!task) continue;
      pendingImagePackPreloads.delete(task.url);
      task.resolve();
    }
    return;
  }

  while (
    activeImagePackPreloads < IMAGE_PACK_PRELOAD_CONCURRENCY &&
    imagePackPreloadQueue.length > 0
  ) {
    const task = imagePackPreloadQueue.shift();
    if (!task) return;

    activeImagePackPreloads += 1;

    const img = new Image();
    img.decoding = 'async';

    let settled = false;
    const complete = (loaded: boolean) => {
      if (settled) return;
      settled = true;

      if (loaded) {
        warmedImagePackUrls.add(task.url);
      }

      pendingImagePackPreloads.delete(task.url);
      activeImagePackPreloads -= 1;
      task.resolve();
      flushImagePackPreloadQueue();
    };

    img.onload = () => complete(true);
    img.onerror = () => complete(false);
    img.src = task.url;

    if (img.complete) {
      complete(true);
    }
  }
};

const preloadImagePackUrl = (url: string) => {
  if (!url || warmedImagePackUrls.has(url)) return undefined;

  const existingPreload = pendingImagePackPreloads.get(url);
  if (existingPreload) {
    return existingPreload;
  }

  const preloadPromise = new Promise<void>((resolve) => {
    imagePackPreloadQueue.push({ url, resolve });
  });

  pendingImagePackPreloads.set(url, preloadPromise);
  setTimeout(flushImagePackPreloadQueue, 0);

  return preloadPromise;
};

const warmImagePackMedia = (
  mx: ReturnType<typeof useMatrixClient>,
  useAuthentication: boolean,
  packs: ImagePack[],
  usages: ImageUsage[]
) => {
  const mediaUrls = new Set<string>();

  packs.forEach((pack) => {
    usages.forEach((usage) => {
      const avatarMxc = pack.getAvatarUrl(usage);
      const avatarUrl = avatarMxc ? mxcUrlToHttp(mx, avatarMxc, useAuthentication) : null;

      if (avatarUrl) {
        mediaUrls.add(avatarUrl);
      }

      pack.getImages(usage).forEach((image) => {
        const imageUrl = mxcUrlToHttp(mx, image.url, useAuthentication);
        if (imageUrl) {
          mediaUrls.add(imageUrl);
        }
      });
    });
  });

  mediaUrls.forEach((mediaUrl) => {
    void preloadImagePackUrl(mediaUrl);
  });
};

const getRelevantPacks = (
  userPack: ImagePack | undefined,
  customUserPacks: ImagePack[],
  globalPacks: ImagePack[],
  roomsPacks: ImagePack[]
) => {
  const packs = userPack ? [userPack, ...customUserPacks] : customUserPacks;
  const globalPackIds = new Set(globalPacks.map((pack) => pack.id));

  return packs.concat(globalPacks, roomsPacks.filter((pack) => !globalPackIds.has(pack.id)));
};

export const useUserImagePack = (): ImagePack | undefined => {
  const mx = useMatrixClient();
  const [userPack, setUserPack] = useState(() => getUserImagePack(mx));

  useEffect(() => {
    ensurePersonalPackSync(mx).catch(() => undefined);
  }, [mx]);

  useAccountDataCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === AccountDataEvent.PoniesUserEmotes) {
          setUserPack(getUserImagePack(mx));
        }
      },
      [mx]
    )
  );

  return userPack;
};

export const useCustomUserImagePacks = (): ImagePack[] => {
  const mx = useMatrixClient();
  const [userPacks, setUserPacks] = useState(() => getCustomUserImagePacks(mx));

  useEffect(() => {
    ensurePersonalPackSync(mx).catch(() => undefined);
  }, [mx, userPacks]);

  useAccountDataCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === AccountDataEvent.CinnyUserEmojiPacks) {
          setUserPacks(getCustomUserImagePacks(mx));
        }
      },
      [mx]
    )
  );

  return userPacks;
};

export const useCustomUserImagePack = (packId: string): ImagePack | undefined => {
  const mx = useMatrixClient();
  const [userPack, setUserPack] = useState(() => getCustomUserImagePack(mx, packId));

  useAccountDataCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === AccountDataEvent.CinnyUserEmojiPacks) {
          setUserPack(getCustomUserImagePack(mx, packId));
        }
      },
      [mx, packId]
    )
  );

  return userPack;
};

export const useGlobalImagePacks = (): ImagePack[] => {
  const mx = useMatrixClient();
  const [globalPacks, setGlobalPacks] = useState(() => getGlobalImagePacks(mx));

  useAccountDataCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === AccountDataEvent.PoniesEmoteRooms) {
          setGlobalPacks(getGlobalImagePacks(mx));
        }
      },
      [mx]
    )
  );

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        const eventType = mEvent.getType();
        const roomId = mEvent.getRoomId();
        const stateKey = mEvent.getStateKey();
        if (eventType === StateEvent.PoniesRoomEmotes && roomId && typeof stateKey === 'string') {
          const global = !!globalPacks.find(
            (pack) =>
              pack.address && pack.address.roomId === roomId && pack.address.stateKey === stateKey
          );
          if (global) {
            setGlobalPacks(getGlobalImagePacks(mx));
          }
        }
      },
      [mx, globalPacks]
    )
  );

  return globalPacks;
};

export const useRoomImagePack = (room: Room, stateKey: string): ImagePack | undefined => {
  const mx = useMatrixClient();
  const [roomPack, setRoomPack] = useState(() => getRoomImagePack(room, stateKey));

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (
          mEvent.getRoomId() === room.roomId &&
          mEvent.getType() === StateEvent.PoniesRoomEmotes &&
          mEvent.getStateKey() === stateKey
        ) {
          setRoomPack(getRoomImagePack(room, stateKey));
        }
      },
      [room, stateKey]
    )
  );

  return roomPack;
};

export const useRoomImagePacks = (room: Room): ImagePack[] => {
  const mx = useMatrixClient();
  const [roomPacks, setRoomPacks] = useState(() => getRoomImagePacks(room));

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (
          mEvent.getRoomId() === room.roomId &&
          mEvent.getType() === StateEvent.PoniesRoomEmotes
        ) {
          setRoomPacks(getRoomImagePacks(room));
        }
      },
      [room]
    )
  );

  return roomPacks;
};

export const useRoomsImagePacks = (rooms: Room[]) => {
  const mx = useMatrixClient();
  const [roomPacks, setRoomPacks] = useState(() => rooms.flatMap(getRoomImagePacks));

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (
          rooms.find((room) => room.roomId === mEvent.getRoomId()) &&
          mEvent.getType() === StateEvent.PoniesRoomEmotes
        ) {
          setRoomPacks(rooms.flatMap(getRoomImagePacks));
        }
      },
      [rooms]
    )
  );

  return roomPacks;
};

export const useRelevantImagePacks = (usage: ImageUsage, rooms: Room[]): ImagePack[] => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userPack = useUserImagePack();
  const customUserPacks = useCustomUserImagePacks();
  const globalPacks = useGlobalImagePacks();
  const roomsPacks = useRoomsImagePacks(rooms);

  const relevantPacks = useMemo(() => {
    const packs = getRelevantPacks(userPack, customUserPacks, globalPacks, roomsPacks);
    return packs.filter((pack) => pack.getImages(usage).length > 0);
  }, [userPack, customUserPacks, globalPacks, roomsPacks, usage]);

  useEffect(() => {
    warmImagePackMedia(mx, useAuthentication, relevantPacks, [usage]);
  }, [mx, relevantPacks, usage, useAuthentication]);

  return relevantPacks;
};

export const useWarmImagePackMedia = (rooms: Room[]) => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userPack = useUserImagePack();
  const customUserPacks = useCustomUserImagePacks();
  const globalPacks = useGlobalImagePacks();
  const roomsPacks = useRoomsImagePacks(rooms);

  const relevantPacks = useMemo(
    () => getRelevantPacks(userPack, customUserPacks, globalPacks, roomsPacks),
    [userPack, customUserPacks, globalPacks, roomsPacks]
  );

  useEffect(() => {
    warmImagePackMedia(mx, useAuthentication, relevantPacks, [
      ImageUsage.Emoticon,
      ImageUsage.Sticker,
    ]);
  }, [mx, relevantPacks, useAuthentication]);
};
