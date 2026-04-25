import { ClientEvent, Room, RoomEvent } from 'matrix-js-sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { Membership, StateEvent } from '../../types/matrix/room';
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
import { primeCachedMediaObjectUrl, primePersistentMediaUrl } from '../utils/mediaUrlCache';

const GLOBAL_IMAGE_PACK_WARM_DELAY_MS = 150;
const GLOBAL_IMAGE_PACK_OBJECT_WARM_DELAY_MS = 450;

const warmImagePackMedia = (
  mx: ReturnType<typeof useMatrixClient>,
  useAuthentication: boolean,
  packs: ImagePack[],
  usages: ImageUsage[]
) => {
  const mediaUrls = getImagePackMediaUrls(mx, useAuthentication, packs, usages);

  mediaUrls.forEach((mediaUrl) => {
    void primePersistentMediaUrl(mediaUrl);
  });
};

const warmImagePackObjectUrls = (
  mx: ReturnType<typeof useMatrixClient>,
  useAuthentication: boolean,
  packs: ImagePack[],
  usages: ImageUsage[]
) => {
  const mediaUrls = getImagePackMediaUrls(mx, useAuthentication, packs, usages);

  mediaUrls.forEach((mediaUrl) => {
    void primeCachedMediaObjectUrl(mediaUrl, 'background');
  });
};

const getImagePackMediaUrls = (
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

  return mediaUrls;
};

const getJoinedRooms = (mx: ReturnType<typeof useMatrixClient>) =>
  mx.getRooms().filter((room) => room.getMyMembership() === Membership.Join);

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
  const userPack = useUserImagePack();
  const customUserPacks = useCustomUserImagePacks();
  const globalPacks = useGlobalImagePacks();
  const roomsPacks = useRoomsImagePacks(rooms);

  const relevantPacks = useMemo(() => {
    const packs = getRelevantPacks(userPack, customUserPacks, globalPacks, roomsPacks);
    return packs.filter((pack) => pack.getImages(usage).length > 0);
  }, [userPack, customUserPacks, globalPacks, roomsPacks, usage]);

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

export const useWarmAllImagePackMedia = () => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userPack = useUserImagePack();
  const customUserPacks = useCustomUserImagePacks();
  const globalPacks = useGlobalImagePacks();
  const [rooms, setRooms] = useState<Room[]>(() => getJoinedRooms(mx));
  const roomsPacks = useRoomsImagePacks(rooms);

  const relevantPacks = useMemo(
    () => getRelevantPacks(userPack, customUserPacks, globalPacks, roomsPacks),
    [userPack, customUserPacks, globalPacks, roomsPacks]
  );

  useEffect(() => {
    const updateRooms = () => {
      setRooms(getJoinedRooms(mx));
    };

    const handleRoom = () => updateRooms();
    const handleMembership = () => updateRooms();
    const handleDeleteRoom = () => updateRooms();

    updateRooms();
    mx.on(ClientEvent.Room, handleRoom);
    mx.on(RoomEvent.MyMembership, handleMembership);
    mx.on(ClientEvent.DeleteRoom, handleDeleteRoom);

    return () => {
      mx.removeListener(ClientEvent.Room, handleRoom);
      mx.removeListener(RoomEvent.MyMembership, handleMembership);
      mx.removeListener(ClientEvent.DeleteRoom, handleDeleteRoom);
    };
  }, [mx]);

  useEffect(() => {
    if (relevantPacks.length === 0) {
      return undefined;
    }

    let disposed = false;
    let persistentDelayTimer: number | undefined;
    let objectDelayTimer: number | undefined;
    persistentDelayTimer = window.setTimeout(() => {
      if (!disposed) {
        warmImagePackMedia(mx, useAuthentication, relevantPacks, [
          ImageUsage.Emoticon,
          ImageUsage.Sticker,
        ]);
      }
    }, GLOBAL_IMAGE_PACK_WARM_DELAY_MS);

    objectDelayTimer = window.setTimeout(() => {
      if (!disposed) {
        warmImagePackObjectUrls(mx, useAuthentication, relevantPacks, [
          ImageUsage.Emoticon,
          ImageUsage.Sticker,
        ]);
      }
    }, GLOBAL_IMAGE_PACK_OBJECT_WARM_DELAY_MS);

    return () => {
      disposed = true;
      if (typeof persistentDelayTimer === 'number') {
        window.clearTimeout(persistentDelayTimer);
      }
      if (typeof objectDelayTimer === 'number') {
        window.clearTimeout(objectDelayTimer);
      }
    };
  }, [mx, relevantPacks, useAuthentication]);
};
