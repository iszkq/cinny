import { useEffect, useState } from 'react';
import { IImageInfo } from '../../../types/matrix/common';
import { ImageUsage, PackImage, PackImageReader } from '../../plugins/custom-emoji';
import { isHttpUrl, isMxcUrl } from '../../utils/matrix';

export const REMOTE_STICKER_INDEX_URL = 'https://image.527012.xyz/index.json';

export const REMOTE_STICKER_KEYWORDS = 'in.cinny.remote_sticker_keywords';
export const REMOTE_STICKER_PACK_ID = 'in.cinny.remote_sticker_pack_id';
export const REMOTE_STICKER_PACK_NAME = 'in.cinny.remote_sticker_pack_name';
export const REMOTE_STICKER_PREVIEW_URL = 'in.cinny.remote_sticker_preview_url';
export const REMOTE_STICKER_THUMB_URL = 'in.cinny.remote_sticker_thumb_url';

type RemoteStickerIndexItem = {
  id?: string;
  packId?: string;
  packName?: string;
  name?: string;
  fileName?: string;
  keywords?: string[];
  url?: string;
  httpUrl?: string;
  sourceUrl?: string;
  previewUrl?: string;
  thumbUrl?: string;
  thumbnailUrl?: string;
  mxc?: string;
  mxcUrl?: string;
  matrixUrl?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
};

type RemoteStickerIndexPack = {
  id?: string;
  name?: string;
  folder?: string;
};

type RemoteStickerIndex = {
  packs?: RemoteStickerIndexPack[];
  items?: RemoteStickerIndexItem[];
};

type RemoteStickerPackImage = PackImage & {
  [REMOTE_STICKER_KEYWORDS]?: string[];
  [REMOTE_STICKER_PACK_ID]?: string;
  [REMOTE_STICKER_PACK_NAME]?: string;
  [REMOTE_STICKER_PREVIEW_URL]?: string;
  [REMOTE_STICKER_THUMB_URL]?: string;
};

let cachedRemoteStickers: PackImageReader[] | undefined;
let pendingRemoteStickers: Promise<PackImageReader[]> | undefined;

const getFreshIndexUrl = (): string => {
  try {
    const url = new URL(REMOTE_STICKER_INDEX_URL);
    url.searchParams.set('_', Date.now().toString());
    return url.toString();
  } catch {
    return `${REMOTE_STICKER_INDEX_URL}?_=${Date.now()}`;
  }
};

const getDisplayName = (item: RemoteStickerIndexItem): string | undefined => {
  const name = item.name?.trim();
  if (name) return name;

  const fileName = item.fileName?.trim();
  if (!fileName) return undefined;

  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]\d+$/, '');
};

const getFirstValidUrl = (
  values: Array<string | undefined>,
  validator: (url: string | undefined | null) => url is string
): string | undefined => {
  for (const value of values) {
    const trimmed = value?.trim();
    if (validator(trimmed)) {
      return trimmed;
    }
  }
  return undefined;
};

const toRemoteSticker = (
  item: RemoteStickerIndexItem,
  packsById: Map<string, RemoteStickerIndexPack>
): PackImageReader | undefined => {
  const displayName = getDisplayName(item);
  const mxcUrl = getFirstValidUrl([item.mxc, item.mxcUrl, item.matrixUrl, item.url], isMxcUrl);
  const previewUrl = getFirstValidUrl(
    [item.previewUrl, item.httpUrl, item.sourceUrl, item.url, item.thumbUrl, item.thumbnailUrl],
    isHttpUrl
  );
  const sendUrl = mxcUrl ?? previewUrl;

  if (!sendUrl || !displayName) {
    return undefined;
  }

  const packId = item.packId || 'remote';
  const packName = item.packName || packsById.get(packId)?.name || packId;
  const shortcode = displayName;
  const thumbUrl = getFirstValidUrl([item.thumbUrl, item.thumbnailUrl], isHttpUrl);
  const info: IImageInfo = {
    mimetype: item.mimeType || 'image/gif',
    size: item.size,
    w: item.width,
    h: item.height,
  };
  const image: RemoteStickerPackImage = {
    url: sendUrl,
    body: displayName,
    usage: [ImageUsage.Emoticon, ImageUsage.Sticker],
    info,
    ...(previewUrl && previewUrl !== sendUrl ? { [REMOTE_STICKER_PREVIEW_URL]: previewUrl } : {}),
    ...(thumbUrl ? { [REMOTE_STICKER_THUMB_URL]: thumbUrl } : {}),
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

  pendingRemoteStickers = fetch(getFreshIndexUrl(), { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load remote sticker index: ${response.status}`);
      }
      return response.json() as Promise<RemoteStickerIndex>;
    })
    .then((index) => {
      const items = Array.isArray(index.items) ? index.items : [];
      const packsById = new Map(
        (Array.isArray(index.packs) ? index.packs : [])
          .filter((pack): pack is RemoteStickerIndexPack & { id: string } => !!pack.id)
          .map((pack) => [pack.id, pack])
      );
      cachedRemoteStickers = items
        .map((item) => toRemoteSticker(item, packsById))
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

export const getRemoteStickerPreviewUrl = (image: PackImageReader): string | undefined => {
  const content = image.content as RemoteStickerPackImage;
  return content[REMOTE_STICKER_PREVIEW_URL] ?? content[REMOTE_STICKER_THUMB_URL];
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
