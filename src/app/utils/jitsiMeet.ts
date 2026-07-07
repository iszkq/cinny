import { IContent, MsgType } from 'matrix-js-sdk';
import { sanitizeText } from './sanitize';

export const JITSI_MEET_DOMAIN = 'meet.jit.si';
export const CINNY_JITSI_MEET_CONTENT_KEY = 'io.cinny.jitsi_meet';

export type CinnyJitsiMeetInfo = {
  version: 1;
  roomName: string;
  url: string;
  domain: string;
  createdAt: number;
};

const randomHex = (byteLength: number): string => {
  const bytes = new Uint8Array(byteLength);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const makeJitsiMeetRoomName = (): string =>
  `starfire-${Date.now().toString(36)}-${randomHex(10)}`;

export const getJitsiMeetUrl = (roomName: string): string =>
  `https://${JITSI_MEET_DOMAIN}/${encodeURIComponent(roomName)}`;

type JitsiMeetUserInfo = {
  displayName?: string;
  avatarUrl?: string;
};

const getSafeText = (value?: string, maxLength = 80): string | undefined => {
  const safeValue = value?.trim();
  if (!safeValue) return undefined;
  return safeValue.slice(0, maxLength);
};

const getSafeAvatarUrl = (avatarUrl?: string): string | undefined => {
  const safeAvatarUrl = getSafeText(avatarUrl, 2048);
  if (!safeAvatarUrl) return undefined;

  try {
    const parsedUrl = new URL(safeAvatarUrl);
    return parsedUrl.protocol === 'https:' ? parsedUrl.toString() : undefined;
  } catch {
    return undefined;
  }
};

export const getJitsiMeetEmbedUrl = (url: string, userInfo?: JitsiMeetUserInfo): string => {
  const embedUrl = new URL(url);
  const hashParams = new URLSearchParams();
  const safeDisplayName = getSafeText(userInfo?.displayName);
  const safeAvatarUrl = getSafeAvatarUrl(userInfo?.avatarUrl);

  hashParams.set('config.disableDeepLinking', 'true');
  hashParams.set('config.prejoinConfig.enabled', 'false');
  hashParams.set('config.prejoinPageEnabled', 'false');
  if (safeDisplayName) {
    hashParams.set('userInfo.displayName', JSON.stringify(safeDisplayName));
  }
  if (safeAvatarUrl) {
    hashParams.set('userInfo.avatarURL', JSON.stringify(safeAvatarUrl));
    hashParams.set('userInfo.avatarUrl', JSON.stringify(safeAvatarUrl));
  }

  embedUrl.hash = hashParams.toString();
  return embedUrl.toString();
};

export const createJitsiMeetInfo = (): CinnyJitsiMeetInfo => {
  const roomName = makeJitsiMeetRoomName();
  return {
    version: 1,
    roomName,
    url: getJitsiMeetUrl(roomName),
    domain: JITSI_MEET_DOMAIN,
    createdAt: Date.now(),
  };
};

const isAllowedJitsiMeetUrl = (url: string, roomName: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.protocol === 'https:' &&
      parsedUrl.hostname === JITSI_MEET_DOMAIN &&
      decodeURIComponent(parsedUrl.pathname.replace(/^\//, '')) === roomName
    );
  } catch {
    return false;
  }
};

export const getJitsiMeetInfo = (
  content: Record<string, unknown> | undefined
): CinnyJitsiMeetInfo | undefined => {
  if (!content) return undefined;
  const data = content[CINNY_JITSI_MEET_CONTENT_KEY];
  if (!isRecord(data)) return undefined;

  const { version, roomName, url, domain, createdAt } = data;
  if (
    version !== 1 ||
    typeof roomName !== 'string' ||
    roomName.length === 0 ||
    typeof url !== 'string' ||
    typeof domain !== 'string' ||
    domain !== JITSI_MEET_DOMAIN ||
    !isAllowedJitsiMeetUrl(url, roomName)
  ) {
    return undefined;
  }

  return {
    version,
    roomName,
    url,
    domain,
    createdAt: typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : 0,
  };
};

export const makeJitsiMeetMessageContent = (meeting: CinnyJitsiMeetInfo): IContent => {
  const label = '\u52a0\u5165\u4f1a\u8bae';
  const body = `\u53d1\u8d77\u4e86\u89c6\u9891\u4f1a\u8bae\uff1a${meeting.url}`;
  const safeUrl = sanitizeText(meeting.url);

  return {
    msgtype: MsgType.Text,
    body,
    format: 'org.matrix.custom.html',
    formatted_body: `\u53d1\u8d77\u4e86\u89c6\u9891\u4f1a\u8bae\uff1a<a href="${safeUrl}">${label}</a>`,
    [CINNY_JITSI_MEET_CONTENT_KEY]: meeting,
  };
};
