import { useEffect, useState } from 'react';
import { IImageInfo } from '../../../types/matrix/common';
import { ImageUsage, PackImage, PackImageReader } from '../../plugins/custom-emoji';

export const REMOTE_STICKER_INDEX_URL = 'https://image.527012.xyz/index.json';

export const REMOTE_STICKER_KEYWORDS = 'in.cinny.remote_sticker_keywords';
export const REMOTE_STICKER_PACK_ID = 'in.cinny.remote_sticker_pack_id';
export const REMOTE_STICKER_PACK_NAME = 'in.cinny.remote_sticker_pack_name';

type RemoteStickerIndexItem = {
  id?: string;
  packId?: string;
  packName?: string;
  name?: string;
  fileName?: string;
  keywords?: string[];
  url?: string;
  mimeType?: string;
};

type RemoteStickerIndex = {
  items?: RemoteStickerIndexItem[];
};

type RemoteStickerPackImage = PackImage & {
  [REMOTE_STICKER_KEYWORDS]?: string[];
  [REMOTE_STICKER_PACK_ID]?: string;
  [REMOTE_STICKER_PACK_NAME]?: string;
};

let cachedRemoteStickers: PackImageReader[] | undefined;
let pendingRemoteStickers: Promise<PackImageReader[]> | undefined;

const getDisplayName = (item: RemoteStickerIndexItem): string | undefined => {
  const name = item.name?.trim();
  if (name) return name;

  const fileName = item.fileName?.trim();
  if (!fileName) return undefined;

  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]\d+$/, '');
};

const toRemoteSticker = (
  item: RemoteStickerIndexItem,
  index: number
): PackImageReader | undefined => {
  const displayName = getDisplayName(item);
  if (!item.url || !displayName) {
    return undefined;
  }

  const packId = item.packId || 'remote';
  const packName = item.packName || packId;
  const shortcode = displayName;
  const info: IImageInfo = {
    mimetype: item.mimeType || 'image/gif',
  };
  const image: RemoteStickerPackImage = {
    url: item.url,
    body: displayName,
    usage: [ImageUsage.Emoticon, ImageUsage.Sticker],
    info,
    [REMOTE_STICKER_KEYWORDS]: Array.from(
      new Set(
        [displayName, item.fileName?.replace(/\.[^.]+$/, ''), ...(item.keywords ?? [])].filter(
          Boolean
        )
      )
    ) as string[],
    [REMOTE_STICKER_PACK_ID]: packId,
    [REMOTE_STICKER_PACK_NAME]: packName,
  };

  return PackImageReader.fromPackImage(shortcode, image);
};

const loadRemoteStickers = async (): Promise<PackImageReader[]> => {
  if (cachedRemoteStickers) {
    return cachedRemoteStickers;
  }
  if (pendingRemoteStickers) {
    return pendingRemoteStickers;
  }

  pendingRemoteStickers = fetch(REMOTE_STICKER_INDEX_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load remote sticker index: ${response.status}`);
      }
      return response.json() as Promise<RemoteStickerIndex>;
    })
    .then((index) => {
      const items = Array.isArray(index.items) ? index.items : [];
      cachedRemoteStickers = items
        .map(toRemoteSticker)
        .filter((item): item is PackImageReader => item !== undefined);
      return cachedRemoteStickers;
    })
    .catch((error) => {
      console.warn(error);
      cachedRemoteStickers = [];
      return cachedRemoteStickers;
    })
    .finally(() => {
      pendingRemoteStickers = undefined;
    });

  return pendingRemoteStickers;
};

export const getRemoteStickerPackId = (image: PackImageReader): string | undefined => {
  const content = image.content as RemoteStickerPackImage;
  return content[REMOTE_STICKER_PACK_ID];
};

export const getRemoteStickerPackName = (image: PackImageReader): string | undefined => {
  const content = image.content as RemoteStickerPackImage;
  return content[REMOTE_STICKER_PACK_NAME];
};

export const getRemoteStickerKeywords = (image: PackImageReader): string[] | undefined => {
  const content = image.content as RemoteStickerPackImage;
  return content[REMOTE_STICKER_KEYWORDS];
};

export const useRemoteStickerIndex = (enabled: boolean): PackImageReader[] => {
  const [stickers, setStickers] = useState<PackImageReader[]>(() => cachedRemoteStickers ?? []);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let disposed = false;
    loadRemoteStickers().then((items) => {
      if (!disposed) {
        setStickers(items);
      }
    });

    return () => {
      disposed = true;
    };
  }, [enabled]);

  return stickers;
};
