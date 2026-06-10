import { ClientEvent, Room, RoomEvent, SyncState } from 'matrix-js-sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { Membership, StateEvent } from '../../types/matrix/room';
import { mxcUrlToHttp } from '../utils/matrix';
import {
  ensurePersonalPackSync,
  getCustomUserImagePacksContent,
  getPersonalPackOrder,
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
import {
  primeDesktopMediaAssetUrl,
  warmDesktopMediaAssetCache,
} from '../utils/desktopMediaAssetCache';
import { isDesktopUpdaterSupported } from '../utils/desktopUpdater';
import { primeCachedMediaObjectUrl, primePersistentMediaUrl } from '../utils/mediaUrlCache';
import {
  getEmojiBoardMediaCandidates,
  getEmojiBoardMediaUrls,
} from '../components/emoji-board/components/media';
import { useSyncState } from './useSyncState';

const GLOBAL_IMAGE_PACK_WARM_DELAY_MS = 1500;
const GLOBAL_IMAGE_PACK_OBJECT_WARM_DELAY_MS = 2400;
const DESKTOP_IMAGE_PACK_WARM_DELAY_MS = 100;
const DESKTOP_IMAGE_PACK_OBJECT_WARM_DELAY_MS = 300;
const DESKTOP_IMAGE_PACK_RUNTIME_WARM_LIMIT = 192;
const WEB_IMAGE_PACK_PRIORITY_OBJECT_WARM_DELAY_MS = 0;
const WEB_IMAGE_PACK_PRIORITY_PERSISTENT_WARM_DELAY_MS = 900;
const WEB_IMAGE_PACK_SECONDARY_OBJECT_WARM_DELAY_MS = 1800;
const WEB_IMAGE_PACK_SECONDARY_PERSISTENT_WARM_DELAY_MS = 2800;
const WEB_IMAGE_PACK_WARM_BATCH_SIZE = 12;
const WEB_IMAGE_PACK_WARM_BATCH_DELAY_MS = 650;
const WEB_IMAGE_PACK_PRIORITY_OBJECT_WARM_LIMIT = 96;
const WEB_IMAGE_PACK_SECONDARY_OBJECT_WARM_LIMIT = 192;
const IMAGE_PACK_AVATAR_SIZE = 64;
const IMAGE_PACK_EMOTICON_SIZE = 64;
const IMAGE_PACK_STICKER_SIZE = 256;

const mediaWarmSyncReady = (state: SyncState | null | undefined): boolean =>
  state === SyncState.Prepared || state === SyncState.Syncing;

const browserReadyForBackgroundMedia = (): boolean =>
  typeof document === 'undefined' ||
  ((typeof navigator === 'undefined' || navigator.onLine !== false) &&
    document.visibilityState === 'visible');

const useBackgroundMediaWarmReady = () => {
  const mx = useMatrixClient();
  const [syncReady, setSyncReady] = useState(() => mediaWarmSyncReady(mx.getSyncState()));
  const [browserReady, setBrowserReady] = useState(browserReadyForBackgroundMedia);

  useSyncState(
    mx,
    useCallback((state) => {
      setSyncReady(mediaWarmSyncReady(state));
    }, [])
  );

  useEffect(() => {
    const updateBrowserReady = () => {
      setBrowserReady(browserReadyForBackgroundMedia());
    };

    window.addEventListener('focus', updateBrowserReady);
    window.addEventListener('online', updateBrowserReady);
    window.addEventListener('offline', updateBrowserReady);
    document.addEventListener('visibilitychange', updateBrowserReady);

    return () => {
      window.removeEventListener('focus', updateBrowserReady);
      window.removeEventListener('online', updateBrowserReady);
      window.removeEventListener('offline', updateBrowserReady);
      document.removeEventListener('visibilitychange', updateBrowserReady);
    };
  }, []);

  return syncReady && browserReady;
};

const warmImagePackMedia = (
  mx: ReturnType<typeof useMatrixClient>,
  useAuthentication: boolean,
  packs: ImagePack[],
  usages: ImageUsage[]
) => {
  const desktopSupported = isDesktopUpdaterSupported();
  const mediaUrls = getImagePackMediaUrls(mx, useAuthentication, packs, usages);

  mediaUrls.forEach((mediaUrl) => {
    if (desktopSupported) {
      void warmDesktopMediaAssetCache(mediaUrl);
      return;
    }

    void primePersistentMediaUrl(mediaUrl);
  });
};

const warmImagePackObjectUrls = (
  mx: ReturnType<typeof useMatrixClient>,
  useAuthentication: boolean,
  packs: ImagePack[],
  usages: ImageUsage[]
) => {
  const desktopSupported = isDesktopUpdaterSupported();

  if (desktopSupported) {
    Array.from(getImagePackPrimaryMediaUrls(mx, useAuthentication, packs, usages))
      .slice(0, DESKTOP_IMAGE_PACK_RUNTIME_WARM_LIMIT)
      .forEach((mediaUrl) => {
        void primeDesktopMediaAssetUrl(mediaUrl, 'background');
      });
    return;
  }

  const mediaUrls = getImagePackMediaUrls(mx, useAuthentication, packs, usages);

  mediaUrls.forEach((mediaUrl) => {
    void primeCachedMediaObjectUrl(mediaUrl, 'background');
  });
};

const scheduleWebImagePackMediaWarm = (
  mx: ReturnType<typeof useMatrixClient>,
  useAuthentication: boolean,
  packs: ImagePack[],
  usages: ImageUsage[],
  options: {
    objectWarmDelayMs: number;
    persistentWarmDelayMs: number;
    objectWarmLimit: number;
  }
) => {
  let disposed = false;
  const timers: number[] = [];
  const objectUrls = Array.from(getImagePackPrimaryMediaUrls(mx, useAuthentication, packs, usages))
    .slice(0, options.objectWarmLimit);
  const objectUrlSet = new Set(objectUrls);
  const persistentUrls = Array.from(getImagePackMediaUrls(mx, useAuthentication, packs, usages))
    .filter((mediaUrl) => !objectUrlSet.has(mediaUrl));

  const scheduleBatch = (
    urls: string[],
    initialDelay: number,
    action: (mediaUrl: string) => void
  ) => {
    for (
      let batchStart = 0;
      batchStart < urls.length;
      batchStart += WEB_IMAGE_PACK_WARM_BATCH_SIZE
    ) {
      const batch = urls.slice(batchStart, batchStart + WEB_IMAGE_PACK_WARM_BATCH_SIZE);
      const batchIndex = batchStart / WEB_IMAGE_PACK_WARM_BATCH_SIZE;

      timers.push(
        window.setTimeout(() => {
          if (disposed) {
            return;
          }

          batch.forEach(action);
        }, initialDelay + batchIndex * WEB_IMAGE_PACK_WARM_BATCH_DELAY_MS)
      );
    }
  };

  scheduleBatch(objectUrls, options.objectWarmDelayMs, (mediaUrl) => {
    void primeCachedMediaObjectUrl(mediaUrl, 'background');
  });
  scheduleBatch(persistentUrls, options.persistentWarmDelayMs, (mediaUrl) => {
    void primePersistentMediaUrl(mediaUrl, 'background');
  });

  return () => {
    disposed = true;
    timers.forEach((timer) => window.clearTimeout(timer));
  };
};

const useJoinedRooms = () => {
  const mx = useMatrixClient();
  const [rooms, setRooms] = useState<Room[]>(() => getJoinedRooms(mx));

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

  return rooms;
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
      const avatarUrl = avatarMxc
        ? mxcUrlToHttp(
            mx,
            avatarMxc,
            useAuthentication,
            IMAGE_PACK_AVATAR_SIZE,
            IMAGE_PACK_AVATAR_SIZE,
            'scale'
          ) ??
          mxcUrlToHttp(mx, avatarMxc, useAuthentication)
        : null;

      if (avatarUrl) {
        mediaUrls.add(avatarUrl);
      }

      pack.getImages(usage).forEach((image) => {
        const size =
          usage === ImageUsage.Sticker ? IMAGE_PACK_STICKER_SIZE : IMAGE_PACK_EMOTICON_SIZE;
        getEmojiBoardMediaCandidates({
          mx,
          mxc: image.url,
          useAuthentication,
          info: image.info,
          width: size,
          height: size,
        }).forEach((mediaUrl) => {
          mediaUrls.add(mediaUrl);
        });
      });
    });
  });

  return mediaUrls;
};

const getImagePackPrimaryMediaUrls = (
  mx: ReturnType<typeof useMatrixClient>,
  useAuthentication: boolean,
  packs: ImagePack[],
  usages: ImageUsage[]
) => {
  const mediaUrls = new Set<string>();

  packs.forEach((pack) => {
    usages.forEach((usage) => {
      const avatarMxc = pack.getAvatarUrl(usage);
      const avatarUrl = avatarMxc
        ? mxcUrlToHttp(
            mx,
            avatarMxc,
            useAuthentication,
            IMAGE_PACK_AVATAR_SIZE,
            IMAGE_PACK_AVATAR_SIZE,
            'scale'
          ) ??
          mxcUrlToHttp(mx, avatarMxc, useAuthentication)
        : null;

      if (avatarUrl) {
        mediaUrls.add(avatarUrl);
      }

      pack.getImages(usage).forEach((image) => {
        const size =
          usage === ImageUsage.Sticker ? IMAGE_PACK_STICKER_SIZE : IMAGE_PACK_EMOTICON_SIZE;
        const { primaryUrl } = getEmojiBoardMediaUrls({
          mx,
          mxc: image.url,
          useAuthentication,
          info: image.info,
          width: size,
          height: size,
        });

        if (primaryUrl) {
          mediaUrls.add(primaryUrl);
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
  const packs = getUniversalPacks(userPack, customUserPacks, globalPacks);
  const packIds = new Set(packs.map((pack) => pack.id));

  return packs.concat(roomsPacks.filter((pack) => !packIds.has(pack.id)));
};

const getUniversalPacks = (
  userPack: ImagePack | undefined,
  customUserPacks: ImagePack[],
  globalPacks: ImagePack[]
) => {
  const packs = getPersonalPacks(userPack, customUserPacks);
  const packIds = new Set(packs.map((pack) => pack.id));

  return packs.concat(globalPacks.filter((pack) => !packIds.has(pack.id)));
};

const getPersonalPacks = (
  userPack: ImagePack | undefined,
  customUserPacks: ImagePack[]
) => {
  const packs = userPack ? [userPack, ...customUserPacks] : customUserPacks;

  return packs.reduce<ImagePack[]>((list, pack) => {
    if (pack.deleted || list.find((item) => item.id === pack.id)) {
      return list;
    }

    list.push(pack);
    return list;
  }, []);
};

const sortImagePacksByOrder = (packs: ImagePack[], orderedIds: string[]) => {
  const orderIndex = new Map(orderedIds.map((packId, index) => [packId, index]));

  return [...packs].sort(
    (a, b) =>
      (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  );
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

  useEffect(() => {
    setRoomPack(getRoomImagePack(room, stateKey));
  }, [room, stateKey]);

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

  useEffect(() => {
    setRoomPacks(getRoomImagePacks(room));
  }, [room]);

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

  useEffect(() => {
    setRoomPacks(rooms.flatMap(getRoomImagePacks));
  }, [rooms]);

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

export const useRelevantImagePacks = (
  usage: ImageUsage,
  rooms: Room[],
  includeAllJoinedRooms = false
): ImagePack[] => {
  const userPack = useUserImagePack();
  const customUserPacks = useCustomUserImagePacks();
  const globalPacks = useGlobalImagePacks();
  const joinedRooms = useJoinedRooms();
  const roomsToUse = includeAllJoinedRooms ? joinedRooms : rooms;
  const roomsPacks = useRoomsImagePacks(roomsToUse);

  const relevantPacks = useMemo(() => {
    const packs = getRelevantPacks(userPack, customUserPacks, globalPacks, roomsPacks);
    return packs.filter((pack) => pack.getImages(usage).length > 0);
  }, [userPack, customUserPacks, globalPacks, roomsPacks, usage]);

  return relevantPacks;
};

export const useUniversalImagePacks = (usage: ImageUsage): ImagePack[] => {
  const userPack = useUserImagePack();
  const customUserPacks = useCustomUserImagePacks();
  const globalPacks = useGlobalImagePacks();

  return useMemo(() => {
    const packs = getUniversalPacks(userPack, customUserPacks, globalPacks);
    return packs.filter((pack) => pack.getImages(usage).length > 0);
  }, [userPack, customUserPacks, globalPacks, usage]);
};

export const usePersonalImagePacks = (usage: ImageUsage): ImagePack[] => {
  const mx = useMatrixClient();
  const userPack = useUserImagePack();
  const customUserPacks = useCustomUserImagePacks();

  return useMemo(() => {
    const packs = getPersonalPacks(userPack, customUserPacks);
    const orderedIds = getPersonalPackOrder(
      getCustomUserImagePacksContent(mx),
      packs.map((pack) => pack.id),
      userPack?.id
    );

    return sortImagePacksByOrder(packs, orderedIds).filter(
      (pack) => pack.getImages(usage).length > 0
    );
  }, [mx, userPack, customUserPacks, usage]);
};

export const useAllPersonalImagePacks = (): ImagePack[] => {
  const userPack = useUserImagePack();
  const customUserPacks = useCustomUserImagePacks();
  const mx = useMatrixClient();

  return useMemo(() => {
    const packs = getPersonalPacks(userPack, customUserPacks);
    const orderedIds = getPersonalPackOrder(
      getCustomUserImagePacksContent(mx),
      packs.map((pack) => pack.id),
      userPack?.id
    );

    return sortImagePacksByOrder(packs, orderedIds);
  }, [mx, userPack, customUserPacks]);
};

export const useWarmImagePackMedia = (rooms: Room[]) => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const warmReady = useBackgroundMediaWarmReady();
  const userPack = useUserImagePack();
  const customUserPacks = useCustomUserImagePacks();
  const globalPacks = useGlobalImagePacks();
  const roomsPacks = useRoomsImagePacks(rooms);

  const relevantPacks = useMemo(
    () => getRelevantPacks(userPack, customUserPacks, globalPacks, roomsPacks),
    [userPack, customUserPacks, globalPacks, roomsPacks]
  );

  useEffect(() => {
    if (!warmReady) {
      return;
    }

    warmImagePackMedia(mx, useAuthentication, relevantPacks, [
      ImageUsage.Emoticon,
      ImageUsage.Sticker,
    ]);
  }, [mx, relevantPacks, useAuthentication, warmReady]);
};

export const useWarmAllImagePackMedia = () => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const warmReady = useBackgroundMediaWarmReady();
  const userPack = useUserImagePack();
  const customUserPacks = useCustomUserImagePacks();
  const globalPacks = useGlobalImagePacks();
  const rooms = useJoinedRooms();
  const roomsPacks = useRoomsImagePacks(rooms);

  const relevantPacks = useMemo(
    () => getRelevantPacks(userPack, customUserPacks, globalPacks, roomsPacks),
    [userPack, customUserPacks, globalPacks, roomsPacks]
  );

  useEffect(() => {
    if (!warmReady || relevantPacks.length === 0) {
      return undefined;
    }

    let disposed = false;
    let persistentDelayTimer: number | undefined;
    let objectDelayTimer: number | undefined;
    const desktopSupported = isDesktopUpdaterSupported();
    const persistentWarmDelay = desktopSupported
      ? DESKTOP_IMAGE_PACK_WARM_DELAY_MS
      : GLOBAL_IMAGE_PACK_WARM_DELAY_MS;
    const objectWarmDelay = desktopSupported
      ? DESKTOP_IMAGE_PACK_OBJECT_WARM_DELAY_MS
      : GLOBAL_IMAGE_PACK_OBJECT_WARM_DELAY_MS;

    persistentDelayTimer = window.setTimeout(() => {
      if (!disposed) {
        warmImagePackMedia(mx, useAuthentication, relevantPacks, [
          ImageUsage.Emoticon,
          ImageUsage.Sticker,
        ]);
      }
    }, persistentWarmDelay);

    objectDelayTimer = window.setTimeout(() => {
      if (!disposed) {
        warmImagePackObjectUrls(mx, useAuthentication, relevantPacks, [
          ImageUsage.Emoticon,
          ImageUsage.Sticker,
        ]);
      }
    }, objectWarmDelay);

    return () => {
      disposed = true;
      if (typeof persistentDelayTimer === 'number') {
        window.clearTimeout(persistentDelayTimer);
      }
      if (typeof objectDelayTimer === 'number') {
        window.clearTimeout(objectDelayTimer);
      }
    };
  }, [mx, relevantPacks, useAuthentication, warmReady]);
};

export const useWarmWebImagePackMedia = () => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const warmReady = useBackgroundMediaWarmReady();
  const userPack = useUserImagePack();
  const customUserPacks = useCustomUserImagePacks();
  const globalPacks = useGlobalImagePacks();
  const rooms = useJoinedRooms();
  const roomsPacks = useRoomsImagePacks(rooms);

  const priorityPacks = useMemo(
    () => getUniversalPacks(userPack, customUserPacks, globalPacks),
    [userPack, customUserPacks, globalPacks]
  );
  const relevantPacks = useMemo(
    () => getRelevantPacks(userPack, customUserPacks, globalPacks, roomsPacks),
    [userPack, customUserPacks, globalPacks, roomsPacks]
  );
  const secondaryPacks = useMemo(() => {
    const priorityPackIds = new Set(priorityPacks.map((pack) => pack.id));

    return relevantPacks.filter((pack) => !priorityPackIds.has(pack.id));
  }, [priorityPacks, relevantPacks]);

  const hasWarmTargets = priorityPacks.length > 0 || secondaryPacks.length > 0;

  useEffect(() => {
    if (!warmReady || !hasWarmTargets) {
      return undefined;
    }

    const cleanups: Array<() => void> = [];

    // Warm personal/global packs first so they are reusable across rooms and DMs.
    if (priorityPacks.length > 0) {
      cleanups.push(
        scheduleWebImagePackMediaWarm(
          mx,
          useAuthentication,
          priorityPacks,
          [ImageUsage.Emoticon, ImageUsage.Sticker],
          {
            objectWarmDelayMs: WEB_IMAGE_PACK_PRIORITY_OBJECT_WARM_DELAY_MS,
            persistentWarmDelayMs: WEB_IMAGE_PACK_PRIORITY_PERSISTENT_WARM_DELAY_MS,
            objectWarmLimit: WEB_IMAGE_PACK_PRIORITY_OBJECT_WARM_LIMIT,
          }
        )
      );
    }

    if (secondaryPacks.length > 0) {
      cleanups.push(
        scheduleWebImagePackMediaWarm(
          mx,
          useAuthentication,
          secondaryPacks,
          [ImageUsage.Emoticon, ImageUsage.Sticker],
          {
            objectWarmDelayMs: WEB_IMAGE_PACK_SECONDARY_OBJECT_WARM_DELAY_MS,
            persistentWarmDelayMs: WEB_IMAGE_PACK_SECONDARY_PERSISTENT_WARM_DELAY_MS,
            objectWarmLimit: WEB_IMAGE_PACK_SECONDARY_OBJECT_WARM_LIMIT,
          }
        )
      );
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [mx, hasWarmTargets, priorityPacks, secondaryPacks, useAuthentication, warmReady]);
};

export const useWarmUniversalImagePackMedia = () => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const warmReady = useBackgroundMediaWarmReady();
  const userPack = useUserImagePack();
  const customUserPacks = useCustomUserImagePacks();
  const globalPacks = useGlobalImagePacks();

  const relevantPacks = useMemo(
    () => getUniversalPacks(userPack, customUserPacks, globalPacks),
    [userPack, customUserPacks, globalPacks]
  );

  useEffect(() => {
    if (!warmReady || relevantPacks.length === 0) {
      return undefined;
    }

    let disposed = false;
    let persistentDelayTimer: number | undefined;
    let objectDelayTimer: number | undefined;
    const desktopSupported = isDesktopUpdaterSupported();
    const persistentWarmDelay = desktopSupported
      ? DESKTOP_IMAGE_PACK_WARM_DELAY_MS
      : GLOBAL_IMAGE_PACK_WARM_DELAY_MS;
    const objectWarmDelay = desktopSupported
      ? DESKTOP_IMAGE_PACK_OBJECT_WARM_DELAY_MS
      : GLOBAL_IMAGE_PACK_OBJECT_WARM_DELAY_MS;

    persistentDelayTimer = window.setTimeout(() => {
      if (!disposed) {
        warmImagePackMedia(mx, useAuthentication, relevantPacks, [
          ImageUsage.Emoticon,
          ImageUsage.Sticker,
        ]);
      }
    }, persistentWarmDelay);

    objectDelayTimer = window.setTimeout(() => {
      if (!disposed) {
        warmImagePackObjectUrls(mx, useAuthentication, relevantPacks, [
          ImageUsage.Emoticon,
          ImageUsage.Sticker,
        ]);
      }
    }, objectWarmDelay);

    return () => {
      disposed = true;
      if (typeof persistentDelayTimer === 'number') {
        window.clearTimeout(persistentDelayTimer);
      }
      if (typeof objectDelayTimer === 'number') {
        window.clearTimeout(objectDelayTimer);
      }
    };
  }, [mx, relevantPacks, useAuthentication, warmReady]);
};

export const useWarmPersonalImagePackMedia = () => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const warmReady = useBackgroundMediaWarmReady();
  const userPack = useUserImagePack();
  const customUserPacks = useCustomUserImagePacks();

  const relevantPacks = useMemo(
    () => getPersonalPacks(userPack, customUserPacks),
    [userPack, customUserPacks]
  );

  useEffect(() => {
    if (!warmReady || relevantPacks.length === 0) {
      return undefined;
    }

    let disposed = false;
    let persistentDelayTimer: number | undefined;
    let objectDelayTimer: number | undefined;
    const desktopSupported = isDesktopUpdaterSupported();
    const persistentWarmDelay = desktopSupported
      ? DESKTOP_IMAGE_PACK_WARM_DELAY_MS
      : GLOBAL_IMAGE_PACK_WARM_DELAY_MS;
    const objectWarmDelay = desktopSupported
      ? DESKTOP_IMAGE_PACK_OBJECT_WARM_DELAY_MS
      : GLOBAL_IMAGE_PACK_OBJECT_WARM_DELAY_MS;

    persistentDelayTimer = window.setTimeout(() => {
      if (!disposed) {
        warmImagePackMedia(mx, useAuthentication, relevantPacks, [
          ImageUsage.Emoticon,
          ImageUsage.Sticker,
        ]);
      }
    }, persistentWarmDelay);

    objectDelayTimer = window.setTimeout(() => {
      if (!disposed) {
        warmImagePackObjectUrls(mx, useAuthentication, relevantPacks, [
          ImageUsage.Emoticon,
          ImageUsage.Sticker,
        ]);
      }
    }, objectWarmDelay);

    return () => {
      disposed = true;
      if (typeof persistentDelayTimer === 'number') {
        window.clearTimeout(persistentDelayTimer);
      }
      if (typeof objectDelayTimer === 'number') {
        window.clearTimeout(objectDelayTimer);
      }
    };
  }, [mx, relevantPacks, useAuthentication, warmReady]);
};
