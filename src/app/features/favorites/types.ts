import { IContent, MatrixEvent, MsgType } from 'matrix-js-sdk';
import { CinnyFavoritesContent } from '../../../types/matrix/accountData';
import { MessageEvent } from '../../../types/matrix/room';
import { isPollMessage, UNSTABLE_POLL_START_EVENT_TYPE } from '../../utils/polls';

export const CINNY_FAVORITE_CONTENT_KEY = 'in.cinny.favorite';

export const FAVORITE_CATEGORIES = [
  'text',
  'image',
  'video',
  'audio',
  'file',
  'poll',
  'other',
] as const;
export type FavoriteCategory = (typeof FAVORITE_CATEGORIES)[number];

export type FavoriteVisibleCategory = FavoriteCategory | 'all';
export const FAVORITE_VISIBLE_CATEGORIES: FavoriteVisibleCategory[] = [
  'all',
  ...FAVORITE_CATEGORIES,
];

export type FavoriteMessageMetadata = {
  version: 1;
  sourceRoomId: string;
  sourceRoomName: string;
  sourceRoomAvatarMxc?: string;
  sourceEventId: string;
  sourceSenderId?: string;
  sourceSenderName: string;
  sourceSenderAvatarMxc?: string;
  sourceTimestamp: number;
  favoritedAt: number;
};

export type FavoriteMessageContent = IContent & {
  [CINNY_FAVORITE_CONTENT_KEY]?: FavoriteMessageMetadata;
};

export const getFavoritesRoomIdFromAccountData = (
  content?: CinnyFavoritesContent
): string | undefined => {
  if (typeof content?.roomId !== 'string') return undefined;

  const roomId = content.roomId.trim();
  return roomId.length > 0 ? roomId : undefined;
};

const normalizeFavoriteRoomIds = (roomIds: unknown): string[] => {
  if (!Array.isArray(roomIds)) return [];

  const uniqueRoomIds = new Set<string>();
  roomIds.forEach((roomId) => {
    if (typeof roomId !== 'string') return;

    const normalizedRoomId = roomId.trim();
    if (normalizedRoomId.length === 0) return;

    uniqueRoomIds.add(normalizedRoomId);
  });

  return Array.from(uniqueRoomIds);
};

export const getHiddenFavoritesRoomIdsFromAccountData = (
  content?: CinnyFavoritesContent
): string[] => {
  const favoritesRoomId = getFavoritesRoomIdFromAccountData(content);

  return normalizeFavoriteRoomIds(content?.legacyRoomIds).filter(
    (roomId) => roomId !== favoritesRoomId
  );
};

export const getAllFavoritesRoomIdsFromAccountData = (
  content?: CinnyFavoritesContent
): string[] => {
  const favoritesRoomId = getFavoritesRoomIdFromAccountData(content);
  const hiddenRoomIds = getHiddenFavoritesRoomIdsFromAccountData(content);

  return favoritesRoomId ? [favoritesRoomId, ...hiddenRoomIds] : hiddenRoomIds;
};

export const getFavoriteMessageMetadata = (
  content: IContent | undefined
): FavoriteMessageMetadata | undefined => {
  if (!content || typeof content !== 'object') return undefined;

  const metadata = (content as FavoriteMessageContent)[CINNY_FAVORITE_CONTENT_KEY];
  if (!metadata || typeof metadata !== 'object') return undefined;
  if (
    metadata.version !== 1 ||
    typeof metadata.sourceRoomId !== 'string' ||
    typeof metadata.sourceRoomName !== 'string' ||
    typeof metadata.sourceEventId !== 'string' ||
    typeof metadata.sourceSenderName !== 'string' ||
    typeof metadata.sourceTimestamp !== 'number' ||
    typeof metadata.favoritedAt !== 'number'
  ) {
    return undefined;
  }

  return metadata;
};

export const getFavoriteMessageMetadataFromEvent = (
  mEvent: MatrixEvent
): FavoriteMessageMetadata | undefined => getFavoriteMessageMetadata(mEvent.getContent());

export const getFavoriteCategory = (mEvent: MatrixEvent): FavoriteCategory => {
  if (mEvent.getType() === MessageEvent.Sticker) return 'image';
  if (
    mEvent.getType() === MessageEvent.PollStart ||
    mEvent.getType() === UNSTABLE_POLL_START_EVENT_TYPE ||
    isPollMessage(mEvent.getContent())
  ) {
    return 'poll';
  }
  if (mEvent.getType() !== MessageEvent.RoomMessage) return 'other';

  const msgType = mEvent.getContent().msgtype;
  if (msgType === MsgType.Text || msgType === MsgType.Notice || msgType === MsgType.Emote) {
    return 'text';
  }
  if (msgType === MsgType.Image) return 'image';
  if (msgType === MsgType.Video) return 'video';
  if (msgType === MsgType.Audio) return 'audio';
  if (msgType === MsgType.File) return 'file';

  return 'other';
};

export const getFavoriteCategoryLabel = (category: FavoriteVisibleCategory): string => {
  if (category === 'all') return '全部';
  if (category === 'text') return '文本';
  if (category === 'image') return '图片';
  if (category === 'video') return '视频';
  if (category === 'audio') return '音频';
  if (category === 'file') return '文件';
  if (category === 'poll') return '投票';

  return '其他';
};
