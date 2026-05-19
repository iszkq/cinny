import { IImageInfo } from '../../../types/matrix/common';

// https://github.com/Sorunome/matrix-doc/blob/soru/emotes/proposals/2545-emotes.md

/**
 * im.ponies.emote_rooms content
 */
export type PackStateKeyToObject = Record<string, object>;
export type RoomIdToStateKey = Record<string, PackStateKeyToObject>;
export type EmoteRoomsContent = {
  rooms?: RoomIdToStateKey;
};

/**
 * Pack
 */
export enum ImageUsage {
  Emoticon = 'emoticon',
  Sticker = 'sticker',
}

export const CINNY_SYNC_SOURCE_PACK_ID = 'in.cinny.source_pack_id';
export const CINNY_SYNC_SOURCE_SHORTCODE = 'in.cinny.source_shortcode';
export const CINNY_SOURCE_MXC = 'in.cinny.source_mxc';

export type PackImage = {
  url: string;
  body?: string;
  usage?: ImageUsage[];
  info?: IImageInfo;
  [CINNY_SYNC_SOURCE_PACK_ID]?: string;
  [CINNY_SYNC_SOURCE_SHORTCODE]?: string;
  [CINNY_SOURCE_MXC]?: string;
};

export type PackImages = Record<string, PackImage>;

export type PackMeta = {
  display_name?: string;
  avatar_url?: string;
  attribution?: string;
  usage?: ImageUsage[];
};

export type PackContent = {
  pack?: PackMeta;
  images?: PackImages;
};

export type UserImagePacks = Record<string, PackContent>;

export type UserImagePacksContent = {
  version?: number;
  order?: string[];
  packs?: UserImagePacks;
};
