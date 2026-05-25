import {
  EncryptedAttachmentInfo,
  decryptAttachment,
  encryptAttachment,
} from 'browser-encrypt-attachment';
import {
  EventTimeline,
  MatrixClient,
  MatrixError,
  MatrixEvent,
  Room,
  RoomMember,
  UploadProgress,
  UploadResponse,
} from 'matrix-js-sdk';
import to from 'await-to-js';
import { IAudioInfo, IImageInfo, IThumbnailContent, IVideoInfo } from '../../types/matrix/common';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { getStateEvent } from './room';
import { Membership, StateEvent } from '../../types/matrix/room';
import { getFallbackSession } from '../state/sessions';

const DOMAIN_REGEX = /\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b/;
const AUTH_MEDIA_PATH_TO_FALLBACK_PATH: Record<string, string[]> = {
  '/_matrix/client/v1/media/download': [
    '/_matrix/media/v3/download',
    '/_matrix/media/r0/download',
  ],
  '/_matrix/client/v1/media/thumbnail': [
    '/_matrix/media/v3/thumbnail',
    '/_matrix/media/r0/thumbnail',
  ],
};
const AUTH_MEDIA_PATHS = Object.keys(AUTH_MEDIA_PATH_TO_FALLBACK_PATH);
const MATRIX_MEDIA_PATH_MATCHER =
  /^\/_matrix\/(?:client\/[^/]+\/media|media\/[^/]+)\/(?:download|thumbnail)\//i;

const removeAllowRedirectParam = (src: string): string => {
  try {
    const url = new URL(src, typeof window === 'undefined' ? undefined : window.location.href);
    url.searchParams.delete('allow_redirect');
    return url.toString();
  } catch {
    return src;
  }
};

export const fetchMediaWithAuth = async (
  src: string,
  init?: RequestInit
): Promise<Response> => {
  const session = getFallbackSession();
  if (!session || !isSessionMediaUrl(src, session.baseUrl)) {
    return fetch(src, init);
  }

  const baseHeaders = new Headers(init?.headers);
  const authHeaders = new Headers(baseHeaders);
  if (!authHeaders.has('Authorization')) {
    authHeaders.set('Authorization', `Bearer ${session.accessToken}`);
  }

  const requestUrls = getMediaRequestUrls(src, session.baseUrl);
  let lastResponse: Response | undefined;
  let lastError: unknown;

  for (const requestUrl of requestUrls) {
    const requestHeadersList = isSessionMediaUrl(requestUrl, session.baseUrl)
      ? [authHeaders]
      : [baseHeaders];

    for (const headers of requestHeadersList) {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(requestUrl, {
        ...init,
        headers,
      }).catch((error) => {
        lastError = error;
        return undefined;
      });

      if (!response) {
        continue;
      }

      if (response.ok) {
        return response;
      }

      lastResponse = response;
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError ?? new Error('Failed to fetch media');
};

const getAbsoluteUrl = (src: string, baseUrl: string): URL | undefined => {
  try {
    const currentUrl = typeof window === 'undefined' ? baseUrl : window.location.href;
    return new URL(src, currentUrl);
  } catch {
    return undefined;
  }
};

const isSessionMediaUrl = (src: string, baseUrl: string): boolean => {
  const mediaUrl = getAbsoluteUrl(src, baseUrl);
  if (!mediaUrl) {
    return false;
  }

  return AUTH_MEDIA_PATHS.some((path) =>
    mediaUrl.href.startsWith(new URL(path, baseUrl).href)
  );
};

const getPublicMediaFallbackUrls = (src: string, baseUrl: string): string[] => {
  const mediaUrl = getAbsoluteUrl(src, baseUrl);
  if (!mediaUrl) {
    return [];
  }

  const fallbackPaths = Object.entries(AUTH_MEDIA_PATH_TO_FALLBACK_PATH).find(([path]) =>
    mediaUrl.pathname.startsWith(path)
  )?.[1];

  if (!fallbackPaths) {
    return [];
  }

  return fallbackPaths.map((fallbackPath) => {
    const fallbackUrl = new URL(mediaUrl.toString());
    const matchingPath = AUTH_MEDIA_PATHS.find((path) => mediaUrl.pathname.startsWith(path));
    if (!matchingPath) {
      return fallbackUrl.toString();
    }
    fallbackUrl.pathname = `${fallbackPath}${mediaUrl.pathname.slice(matchingPath.length)}`;
    return fallbackUrl.toString();
  });
};

const getMediaRequestUrls = (src: string, baseUrl: string): string[] => {
  const strippedSrc = removeAllowRedirectParam(src);
  const requestUrls = [src, strippedSrc];

  getPublicMediaFallbackUrls(src, baseUrl).forEach((fallbackUrl) => {
    requestUrls.push(fallbackUrl);
  });
  getPublicMediaFallbackUrls(strippedSrc, baseUrl).forEach((fallbackUrl) => {
    requestUrls.push(fallbackUrl);
  });

  return requestUrls.filter(
    (requestUrl, index) =>
      requestUrl.length > 0 && requestUrls.findIndex((url) => url === requestUrl) === index
  );
};

export const isServerName = (serverName: string): boolean => DOMAIN_REGEX.test(serverName);

const matchMxId = (id: string): RegExpMatchArray | null => id.match(/^([@$+#])([^\s:]+):(\S+)$/);

const validMxId = (id: string): boolean => !!matchMxId(id);

export const getMxIdServer = (userId: string): string | undefined => matchMxId(userId)?.[3];

export const getMxIdLocalPart = (userId: string): string | undefined => matchMxId(userId)?.[2];

export const isUserId = (id: string): boolean => validMxId(id) && id.startsWith('@');

export const isRoomId = (id: string): boolean => id.startsWith('!');

export const isRoomAlias = (id: string): boolean => validMxId(id) && id.startsWith('#');

export const getCanonicalAliasRoomId = (mx: MatrixClient, alias: string): string | undefined =>
  mx
    .getRooms()
    ?.find(
      (room) =>
        room.getCanonicalAlias() === alias &&
        getStateEvent(room, StateEvent.RoomTombstone) === undefined
    )?.roomId;

export const getCanonicalAliasOrRoomId = (mx: MatrixClient, roomId: string): string => {
  const room = mx.getRoom(roomId);
  if (!room) return roomId;
  if (getStateEvent(room, StateEvent.RoomTombstone) !== undefined) return roomId;
  const alias = room.getCanonicalAlias();
  if (alias && getCanonicalAliasRoomId(mx, alias) === roomId) {
    return alias;
  }
  return roomId;
};

export const isMxcUrl = (url: string | undefined | null): url is string =>
  typeof url === 'string' && url.startsWith('mxc://');

export const isHttpUrl = (url: string | undefined | null): url is string =>
  typeof url === 'string' && /^(https?):\/\//i.test(url);

export const shouldUseObjectUrlForMediaDisplay = (src: string | undefined): boolean => {
  if (!src || typeof window === 'undefined' || !isHttpUrl(src)) {
    return false;
  }

  try {
    const mediaUrl = new URL(src, window.location.href);
    return (
      mediaUrl.origin !== window.location.origin &&
      MATRIX_MEDIA_PATH_MATCHER.test(mediaUrl.pathname)
    );
  } catch {
    return false;
  }
};

export const getImageInfo = (img: HTMLImageElement, fileOrBlob: File | Blob): IImageInfo => {
  const info: IImageInfo = {};
  info.w = img.naturalWidth || img.width;
  info.h = img.naturalHeight || img.height;
  info.mimetype = fileOrBlob.type;
  info.size = fileOrBlob.size;
  return info;
};

export const getVideoInfo = (video: HTMLVideoElement, fileOrBlob: File | Blob): IVideoInfo => {
  const info: IVideoInfo = {};
  info.duration = Number.isNaN(video.duration) ? undefined : Math.floor(video.duration * 1000);
  info.w = video.videoWidth;
  info.h = video.videoHeight;
  info.mimetype = fileOrBlob.type;
  info.size = fileOrBlob.size;
  return info;
};

export const getAudioInfo = (audio: HTMLAudioElement, fileOrBlob: File | Blob): IAudioInfo => {
  const info: IAudioInfo = {};
  info.duration = Number.isNaN(audio.duration) ? undefined : Math.floor(audio.duration * 1000);
  info.mimetype = fileOrBlob.type;
  info.size = fileOrBlob.size;
  return info;
};

export const getThumbnailContent = (thumbnailInfo: {
  thumbnail: File | Blob;
  encInfo: EncryptedAttachmentInfo | undefined;
  mxc: string;
  width: number;
  height: number;
}): IThumbnailContent => {
  const { thumbnail, encInfo, mxc, width, height } = thumbnailInfo;

  const content: IThumbnailContent = {
    thumbnail_info: {
      mimetype: thumbnail.type,
      size: thumbnail.size,
      w: width,
      h: height,
    },
  };
  if (encInfo) {
    content.thumbnail_file = {
      ...encInfo,
      url: mxc,
    };
  } else {
    content.thumbnail_url = mxc;
  }
  return content;
};

export const encryptFile = async (
  file: File | Blob
): Promise<{
  encInfo: EncryptedAttachmentInfo;
  file: File;
  originalFile: File | Blob;
}> => {
  const dataBuffer = await file.arrayBuffer();
  const encryptedAttachment = await encryptAttachment(dataBuffer);
  const encFile = new File([encryptedAttachment.data], file.name, {
    type: file.type,
  });
  return {
    encInfo: encryptedAttachment.info,
    file: encFile,
    originalFile: file,
  };
};

export const decryptFile = async (
  dataBuffer: ArrayBuffer,
  type: string,
  encInfo: EncryptedAttachmentInfo
): Promise<Blob> => {
  const dataArray = await decryptAttachment(dataBuffer, encInfo);
  const blob = new Blob([dataArray], { type });
  return blob;
};

export type TUploadContent = File | Blob;

export type ContentUploadOptions = {
  name?: string;
  fileType?: string;
  hideFilename?: boolean;
  onPromise?: (promise: Promise<UploadResponse>) => void;
  onProgress?: (progress: UploadProgress) => void;
  onSuccess: (mxc: string) => void;
  onError: (error: MatrixError) => void;
};

export const uploadContent = async (
  mx: MatrixClient,
  file: TUploadContent,
  options: ContentUploadOptions
) => {
  const { name, fileType, hideFilename, onProgress, onPromise, onSuccess, onError } = options;

  const uploadPromise = mx.uploadContent(file, {
    name,
    type: fileType,
    includeFilename: !hideFilename,
    progressHandler: onProgress,
  });
  onPromise?.(uploadPromise);
  try {
    const data = await uploadPromise;
    const mxc = data.content_uri;
    if (mxc) onSuccess(mxc);
    else onError(new MatrixError(data));
  } catch (e: any) {
    const error = typeof e?.message === 'string' ? e.message : undefined;
    const errcode = typeof e?.name === 'string' ? e.message : undefined;
    onError(new MatrixError({ error, errcode }));
  }
};

export const matrixEventByRecency = (m1: MatrixEvent, m2: MatrixEvent) => m2.getTs() - m1.getTs();

export const factoryEventSentBy = (senderId: string) => (ev: MatrixEvent) =>
  ev.getSender() === senderId;

export const eventWithShortcode = (ev: MatrixEvent) =>
  typeof ev.getContent().shortcode === 'string';

export const getDMRoomFor = (mx: MatrixClient, userId: string): Room | undefined => {
  const dmLikeRooms = mx
    .getRooms()
    .filter(
      (room) =>
        room.getMyMembership() === Membership.Join &&
        room.hasEncryptionStateEvent() &&
        room.getMembers().length <= 2
    );

  return dmLikeRooms.find((room) => room.getMember(userId));
};

export const guessDmRoomUserId = (room: Room, myUserId: string): string => {
  const getOldestMember = (members: RoomMember[]): RoomMember | undefined => {
    let oldestMemberTs: number | undefined;
    let oldestMember: RoomMember | undefined;

    const pickOldestMember = (member: RoomMember) => {
      if (member.userId === myUserId) return;

      if (
        oldestMemberTs === undefined ||
        (member.events.member && member.events.member.getTs() < oldestMemberTs)
      ) {
        oldestMember = member;
        oldestMemberTs = member.events.member?.getTs();
      }
    };

    members.forEach(pickOldestMember);

    return oldestMember;
  };

  // Pick the joined user who's been here longest (and isn't us),
  const member = getOldestMember(room.getJoinedMembers());
  if (member) return member.userId;

  // if there are no joined members other than us, use the oldest member
  const member1 = getOldestMember(
    room.getLiveTimeline().getState(EventTimeline.FORWARDS)?.getMembers() ?? []
  );
  return member1?.userId ?? myUserId;
};

export const addRoomIdToMDirect = async (
  mx: MatrixClient,
  roomId: string,
  userId: string
): Promise<void> => {
  const mDirectsEvent = mx.getAccountData(AccountDataEvent.Direct as any);
  let userIdToRoomIds: Record<string, string[]> = {};

  if (typeof mDirectsEvent !== 'undefined')
    userIdToRoomIds = structuredClone(mDirectsEvent.getContent());

  // remove it from the lists of any others users
  // (it can only be a DM room for one person)
  Object.keys(userIdToRoomIds).forEach((targetUserId) => {
    const roomIds = userIdToRoomIds[targetUserId];

    if (targetUserId !== userId) {
      const indexOfRoomId = roomIds.indexOf(roomId);
      if (indexOfRoomId > -1) {
        roomIds.splice(indexOfRoomId, 1);
      }
    }
  });

  const roomIds = userIdToRoomIds[userId] || [];
  if (roomIds.indexOf(roomId) === -1) {
    roomIds.push(roomId);
  }
  userIdToRoomIds[userId] = roomIds;

  await mx.setAccountData(AccountDataEvent.Direct as any, userIdToRoomIds as any);
};

export const removeRoomIdFromMDirect = async (mx: MatrixClient, roomId: string): Promise<void> => {
  const mDirectsEvent = mx.getAccountData(AccountDataEvent.Direct as any);
  let userIdToRoomIds: Record<string, string[]> = {};

  if (typeof mDirectsEvent !== 'undefined')
    userIdToRoomIds = structuredClone(mDirectsEvent.getContent());

  Object.keys(userIdToRoomIds).forEach((targetUserId) => {
    const roomIds = userIdToRoomIds[targetUserId];
    const indexOfRoomId = roomIds.indexOf(roomId);
    if (indexOfRoomId > -1) {
      roomIds.splice(indexOfRoomId, 1);
    }
  });

  await mx.setAccountData(AccountDataEvent.Direct as any, userIdToRoomIds as any);
};

export const mxcUrlToHttp = (
  mx: MatrixClient,
  mxcUrl: string,
  useAuthentication?: boolean,
  width?: number,
  height?: number,
  resizeMethod?: string,
  allowDirectLinks?: boolean,
  allowRedirects?: boolean
): string | null =>
  mx.mxcUrlToHttp(
    mxcUrl,
    width,
    height,
    resizeMethod,
    allowDirectLinks,
    allowRedirects,
    useAuthentication
  );

export const downloadMedia = async (src: string): Promise<Blob> => {
  const init: RequestInit = { method: 'GET' };
  const downloadResponse = await fetchMediaWithAuth(src, init).catch(() => undefined);

  if (!downloadResponse?.ok) {
    throw new Error('Failed to download media');
  }

  const blob = await downloadResponse.blob();
  return blob;
};

export const downloadEncryptedMedia = async (
  src: string,
  decryptContent: (buf: ArrayBuffer) => Promise<Blob>
): Promise<Blob> => {
  const encryptedContent = await downloadMedia(src);
  const decryptedContent = await decryptContent(await encryptedContent.arrayBuffer());

  return decryptedContent;
};

export const rateLimitedActions = async <T, R = void>(
  data: T[],
  callback: (item: T, index: number) => Promise<R>,
  maxRetryCount?: number
) => {
  let retryCount = 0;

  let actionInterval = 0;

  const sleepForMs = (ms: number) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  const performAction = async (dataItem: T, index: number) => {
    const [err] = await to<R, MatrixError>(callback(dataItem, index));

    if (err?.httpStatus === 429) {
      if (retryCount === maxRetryCount) {
        return;
      }

      const waitMS = err.getRetryAfterMs() ?? 3000;
      actionInterval = waitMS * 1.5;
      await sleepForMs(waitMS);
      retryCount += 1;

      await performAction(dataItem, index);
    }
  };

  for (let i = 0; i < data.length; i += 1) {
    const dataItem = data[i];
    retryCount = 0;
    // eslint-disable-next-line no-await-in-loop
    await performAction(dataItem, i);
    if (actionInterval > 0) {
      // eslint-disable-next-line no-await-in-loop
      await sleepForMs(actionInterval);
    }
  }
};

export const knockSupported = (version: string): boolean => {
  const unsupportedVersion = ['1', '2', '3', '4', '5', '6'];
  return !unsupportedVersion.includes(version);
};
export const restrictedSupported = (version: string): boolean => {
  const unsupportedVersion = ['1', '2', '3', '4', '5', '6', '7'];
  return !unsupportedVersion.includes(version);
};
export const knockRestrictedSupported = (version: string): boolean => {
  const unsupportedVersion = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return !unsupportedVersion.includes(version);
};
export const creatorsSupported = (version: string): boolean => {
  const unsupportedVersion = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
  return !unsupportedVersion.includes(version);
};
