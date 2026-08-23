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
import { isAndroidApp } from './nativePlatform';

const DOMAIN_REGEX = /\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b/;
const AUTH_MEDIA_PATH_TO_FALLBACK_PATH: Record<string, string[]> = {
  '/_matrix/client/v1/media/download': ['/_matrix/media/v3/download', '/_matrix/media/r0/download'],
  '/_matrix/client/v1/media/thumbnail': [
    '/_matrix/media/v3/thumbnail',
    '/_matrix/media/r0/thumbnail',
  ],
};
const AUTH_MEDIA_PATHS = Object.keys(AUTH_MEDIA_PATH_TO_FALLBACK_PATH);
const MATRIX_MEDIA_PATH_MATCHER =
  /^\/_matrix\/(?:client\/[^/]+\/media|media\/[^/]+)\/(?:download|thumbnail)\//i;
const MEDIA_BROWSER_REQUEST_TIMEOUT_MS = 25_000;
const MEDIA_NATIVE_CONNECT_TIMEOUT_MS = 15_000;
const MEDIA_NATIVE_READ_TIMEOUT_MS = 45_000;
const MEDIA_FETCH_FAILURE_BASE_RETRY_MS = 3_000;
const MEDIA_FETCH_NOT_FOUND_BASE_RETRY_MS = 5_000;
const MEDIA_FETCH_MAX_RETRY_MS = 60_000;
const MEDIA_FETCH_FAILURE_RESET_MS = 5 * 60 * 1000;
const MAX_MEDIA_FETCH_FAILURES = 512;

type MediaFetchFailure = {
  retryAt: number;
  status: number;
  attempts: number;
  failedAt: number;
};

const pendingMediaFetches = new Map<string, Promise<Response>>();
const failedMediaFetches = new Map<string, MediaFetchFailure>();
let mediaFetchOnlineListenerBound = false;
let currentMediaFetchSessionSignature: string | undefined;
let mediaFetchSessionGeneration = 0;

const removeAllowRedirectParam = (src: string): string => {
  try {
    const url = new URL(src, typeof window === 'undefined' ? undefined : window.location.href);
    url.searchParams.delete('allow_redirect');
    return url.toString();
  } catch {
    return src;
  }
};

const decodeBase64Bytes = (value: string): Uint8Array => {
  const binary = window.atob(value.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const fetchWithTimeout = async (url: string, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const handleAbort = () => controller.abort(init?.signal?.reason);
  if (init?.signal?.aborted) {
    handleAbort();
  } else {
    init?.signal?.addEventListener('abort', handleAbort, { once: true });
  }
  const timeoutId = window.setTimeout(() => controller.abort(), MEDIA_BROWSER_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
    init?.signal?.removeEventListener('abort', handleAbort);
  }
};

const fetchMediaWithAndroidNativeHttp = async (
  url: string,
  init?: RequestInit
): Promise<Response> => {
  const { CapacitorHttp } = await import('@capacitor/core');
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, key) => {
    headers[key] = value;
  });
  const nativeResponse = await CapacitorHttp.get({
    url,
    headers,
    responseType: 'arraybuffer',
    connectTimeout: MEDIA_NATIVE_CONNECT_TIMEOUT_MS,
    readTimeout: MEDIA_NATIVE_READ_TIMEOUT_MS,
  });
  const body =
    typeof nativeResponse.data === 'string'
      ? decodeBase64Bytes(nativeResponse.data)
      : JSON.stringify(nativeResponse.data ?? '');
  const response = new Response(body, {
    status: nativeResponse.status,
    headers: nativeResponse.headers,
  });
  Object.defineProperty(response, 'url', { value: nativeResponse.url || url });
  return response;
};

const isUsableMediaResponse = (response: Response): boolean => {
  if (!response.ok) return false;

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  return !contentType.includes('text/html') && !contentType.includes('application/json');
};

const fetchMediaWithAndroidFallback = async (
  url: string,
  init?: RequestInit
): Promise<Response> => {
  const method = init?.method?.toUpperCase() ?? 'GET';
  const nativeEligible = isAndroidApp() && method === 'GET' && /^https?:\/\//i.test(url);

  try {
    const browserResponse = await fetchWithTimeout(url, init);
    if (!nativeEligible || isUsableMediaResponse(browserResponse)) {
      return browserResponse;
    }

    // Cloudflare/VPN paths can return an HTML challenge or a transient HTTP error without making
    // fetch reject. Give the native stack a chance in those cases too, not only on exceptions.
    const nativeResponse = await fetchMediaWithAndroidNativeHttp(url, init).catch(() => undefined);
    return nativeResponse && isUsableMediaResponse(nativeResponse)
      ? nativeResponse
      : browserResponse;
  } catch (browserError) {
    if (!nativeEligible) {
      throw browserError;
    }
    return fetchMediaWithAndroidNativeHttp(url, init);
  }
};

const withMediaAccessToken = (src: string, accessToken: string): string => {
  try {
    const url = new URL(src);
    url.searchParams.set('access_token', accessToken);
    return url.toString();
  } catch {
    return src;
  }
};

const performMediaFetchWithAuth = async (src: string, init?: RequestInit): Promise<Response> => {
  const session = getFallbackSession();
  if (!session || !isSessionMediaUrl(src, session.baseUrl)) {
    return fetchMediaWithAndroidFallback(src, init);
  }

  const baseHeaders = new Headers(init?.headers);
  baseHeaders.delete('Authorization');
  const authHeaders = new Headers(baseHeaders);
  if (!authHeaders.has('Authorization')) {
    authHeaders.set('Authorization', `Bearer ${session.accessToken}`);
  }

  const requestUrls = getMediaRequestUrls(src, session.baseUrl);
  let lastResponse: Response | undefined;
  let lastError: unknown;

  for (const requestUrl of requestUrls) {
    const mediaUrl = getAbsoluteUrl(requestUrl, session.baseUrl);
    const authenticatedMediaRequest = Boolean(
      mediaUrl &&
        mediaUrl.origin === getAbsoluteUrl(session.baseUrl, session.baseUrl)?.origin &&
        AUTH_MEDIA_PATHS.some((path) => mediaUrl.pathname.startsWith(path))
    );
    const requestAttempts: Array<{ url: string; headers: Headers }> = authenticatedMediaRequest
      ? [
          { url: requestUrl, headers: authHeaders },
          ...(isAndroidApp()
            ? [{ url: withMediaAccessToken(requestUrl, session.accessToken), headers: baseHeaders }]
            : []),
        ]
      : [{ url: requestUrl, headers: baseHeaders }];

    for (const attempt of requestAttempts) {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetchMediaWithAndroidFallback(attempt.url, {
        ...init,
        method: init?.method ?? 'GET',
        headers: attempt.headers,
      }).catch((error) => {
        lastError = error;
        return undefined;
      });

      if (!response) {
        continue;
      }

      if (isUsableMediaResponse(response)) {
        return response;
      }

      if (response.ok) {
        lastError = new Error(`Media endpoint returned ${response.headers.get('content-type')}`);
        continue;
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
  const homeserverUrl = getAbsoluteUrl(baseUrl, baseUrl);
  if (!mediaUrl || !homeserverUrl) {
    return false;
  }

  return (
    mediaUrl.origin === homeserverUrl.origin && MATRIX_MEDIA_PATH_MATCHER.test(mediaUrl.pathname)
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
  const requestUrls = [strippedSrc];
  getPublicMediaFallbackUrls(strippedSrc, baseUrl).forEach((fallbackUrl) => {
    requestUrls.push(fallbackUrl);
  });

  return requestUrls
    .filter(
      (requestUrl, index) =>
        requestUrl.length > 0 && requestUrls.findIndex((url) => url === requestUrl) === index
    )
    .slice(0, 3);
};

const getCanonicalMediaFetchUrl = (src: string, baseUrl: string): string => {
  const mediaUrl = getAbsoluteUrl(removeAllowRedirectParam(src), baseUrl);
  if (!mediaUrl) return src;

  mediaUrl.searchParams.delete('access_token');
  mediaUrl.pathname = mediaUrl.pathname.replace(
    /^\/_matrix\/media\/(?:v3|r0)\/(download|thumbnail)\//i,
    '/_matrix/client/v1/media/$1/'
  );
  mediaUrl.searchParams.sort();
  return mediaUrl.toString();
};

const getMediaFetchKey = (src: string, init: RequestInit | undefined): string | undefined => {
  const session = getFallbackSession();
  const method = init?.method?.toUpperCase() ?? 'GET';
  if (method !== 'GET' || init?.signal || !session || !isSessionMediaUrl(src, session.baseUrl)) {
    return undefined;
  }

  const sessionSignature = `${session.baseUrl.toLowerCase()}\n${session.userId.toLowerCase()}\n${
    session.accessToken
  }`;
  if (currentMediaFetchSessionSignature !== sessionSignature) {
    currentMediaFetchSessionSignature = sessionSignature;
    mediaFetchSessionGeneration += 1;
    pendingMediaFetches.clear();
    failedMediaFetches.clear();
  }

  const range = new Headers(init?.headers).get('range') ?? '';
  return `${mediaFetchSessionGeneration}\n${session.baseUrl.toLowerCase()}\n${session.userId.toLowerCase()}\n${getCanonicalMediaFetchUrl(
    src,
    session.baseUrl
  )}\n${range}`;
};

const bindMediaFetchOnlineReset = () => {
  if (mediaFetchOnlineListenerBound || typeof window === 'undefined') return;
  mediaFetchOnlineListenerBound = true;
  window.addEventListener('online', () => failedMediaFetches.clear());
};

const rememberMediaFetchFailure = (key: string, status: number) => {
  const now = Date.now();
  const previousFailure = failedMediaFetches.get(key);
  const attempts =
    previousFailure && now - previousFailure.failedAt < MEDIA_FETCH_FAILURE_RESET_MS
      ? previousFailure.attempts + 1
      : 1;
  const baseDelay =
    status === 404 ? MEDIA_FETCH_NOT_FOUND_BASE_RETRY_MS : MEDIA_FETCH_FAILURE_BASE_RETRY_MS;
  const retryDelay = Math.min(baseDelay * 2 ** Math.min(attempts - 1, 4), MEDIA_FETCH_MAX_RETRY_MS);

  failedMediaFetches.delete(key);
  failedMediaFetches.set(key, {
    retryAt: now + retryDelay,
    status: status >= 400 && status <= 599 ? status : 502,
    attempts,
    failedAt: now,
  });

  while (failedMediaFetches.size > MAX_MEDIA_FETCH_FAILURES) {
    const oldestKey = failedMediaFetches.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    failedMediaFetches.delete(oldestKey);
  }
};

const getActiveMediaFetchFailure = (key: string): MediaFetchFailure | undefined => {
  const failure = failedMediaFetches.get(key);
  if (!failure) return undefined;
  if (failure.retryAt > Date.now()) return failure;
  return undefined;
};

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

export const fetchMediaWithAuth = async (src: string, init?: RequestInit): Promise<Response> => {
  const fetchKey = getMediaFetchKey(src, init);
  if (!fetchKey) {
    return performMediaFetchWithAuth(src, init);
  }

  bindMediaFetchOnlineReset();
  const recentFailure = getActiveMediaFetchFailure(fetchKey);
  if (recentFailure) {
    return new Response(null, {
      status: recentFailure.status,
      statusText: 'Media request temporarily unavailable',
    });
  }

  const pendingFetch = pendingMediaFetches.get(fetchKey);
  if (pendingFetch) {
    return (await pendingFetch).clone();
  }

  let requestPromise: Promise<Response>;
  requestPromise = performMediaFetchWithAuth(src, init)
    .then((response) => {
      if (isUsableMediaResponse(response)) {
        failedMediaFetches.delete(fetchKey);
      } else {
        rememberMediaFetchFailure(fetchKey, response.ok ? 502 : response.status);
      }
      return response;
    })
    .catch((error) => {
      if (!isAbortError(error)) {
        rememberMediaFetchFailure(fetchKey, 502);
      }
      throw error;
    })
    .finally(() => {
      if (pendingMediaFetches.get(fetchKey) === requestPromise) {
        pendingMediaFetches.delete(fetchKey);
      }
    });

  pendingMediaFetches.set(fetchKey, requestPromise);
  return requestPromise;
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

export const getOriginalMediaUrl = (src: string | undefined): string | undefined => {
  if (!src || !isHttpUrl(src)) return src;

  try {
    const mediaUrl = new URL(src);
    if (!MATRIX_MEDIA_PATH_MATCHER.test(mediaUrl.pathname)) return src;
    if (!mediaUrl.pathname.includes('/thumbnail/')) return src;

    mediaUrl.pathname = mediaUrl.pathname.replace('/thumbnail/', '/download/');
    mediaUrl.searchParams.delete('width');
    mediaUrl.searchParams.delete('height');
    mediaUrl.searchParams.delete('method');
    mediaUrl.searchParams.delete('animated');
    return mediaUrl.toString();
  } catch {
    return src;
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
  info.duration =
    Number.isFinite(audio.duration) && audio.duration > 0
      ? Math.floor(audio.duration * 1000)
      : undefined;
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

export const downloadMedia = async (src: string, init?: RequestInit): Promise<Blob> => {
  const requestInit: RequestInit = { ...init, method: 'GET' };
  const downloadResponse = await fetchMediaWithAuth(src, requestInit).catch(() => undefined);

  if (!downloadResponse?.ok) {
    throw new Error('Failed to download media');
  }

  const blob = await downloadResponse.blob();
  return blob;
};

export const downloadEncryptedMedia = async (
  src: string,
  decryptContent: (buf: ArrayBuffer) => Promise<Blob>,
  init?: RequestInit
): Promise<Blob> => {
  const encryptedContent = await downloadMedia(src, init);
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
