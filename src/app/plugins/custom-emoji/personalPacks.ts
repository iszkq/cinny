import { MatrixClient } from 'matrix-js-sdk';
import { AccountDataEvent } from '../../../types/matrix/accountData';
import { suffixRename } from '../../utils/common';
import {
  CINNY_SOURCE_MXC,
  CINNY_SYNC_SOURCE_PACK_ID,
  CINNY_SYNC_SOURCE_SHORTCODE,
  PackContent,
  PackImage,
  UserImagePacksContent,
} from './types';
import { PackImageReader } from './PackImageReader';

const SHORTCODE_SANITIZE_REG = /[^a-z0-9_-]+/gi;
const MULTI_DASH_REG = /-+/g;
const EDGE_DASH_REG = /^-+|-+$/g;
const DEFAULT_SHORTCODE_FALLBACK = 'image';
const PACK_TOKEN_LENGTH = 12;

export const clonePackContent = (packContent?: PackContent): PackContent =>
  JSON.parse(JSON.stringify(packContent ?? {})) as PackContent;

export const cloneUserImagePacksContent = (
  content?: UserImagePacksContent
): UserImagePacksContent =>
  JSON.parse(JSON.stringify(content ?? {})) as UserImagePacksContent;

export const getPersonalPackOrder = (
  content: UserImagePacksContent | undefined,
  packIds: string[],
  pinnedPackId?: string
): string[] => {
  const knownPackIds = new Set(packIds);
  const seen = new Set<string>();
  const nextOrder: string[] = [];

  if (Array.isArray(content?.order)) {
    content.order.forEach((packId) => {
      if (typeof packId !== 'string' || !knownPackIds.has(packId) || seen.has(packId)) {
        return;
      }

      seen.add(packId);
      nextOrder.push(packId);
    });
  }

  packIds.forEach((packId) => {
    if (seen.has(packId)) {
      return;
    }

    seen.add(packId);
    nextOrder.push(packId);
  });

  if (pinnedPackId) {
    const pinnedIndex = nextOrder.indexOf(pinnedPackId);

    if (pinnedIndex > 0) {
      nextOrder.splice(pinnedIndex, 1);
      nextOrder.unshift(pinnedPackId);
    }
  }

  return nextOrder;
};

export const getCustomUserImagePacksContent = (mx: MatrixClient): UserImagePacksContent => {
  const content = mx.getAccountData(AccountDataEvent.CinnyUserEmojiPacks)?.getContent<
    UserImagePacksContent
  >();

  if (!content || typeof content !== 'object') return {};

  return content;
};

export const getRawUserImagePackContent = (mx: MatrixClient): PackContent | undefined => {
  const content = mx.getAccountData(AccountDataEvent.PoniesUserEmotes)?.getContent<PackContent>();

  if (!content || typeof content !== 'object') return undefined;

  return content;
};

export const isSyncedPersonalPackImage = (image?: PackImage): boolean =>
  typeof image?.[CINNY_SYNC_SOURCE_PACK_ID] === 'string';

export const stripSyncMeta = (image: PackImage): PackImage => {
  const nextImage = {
    ...image,
  };

  delete nextImage[CINNY_SYNC_SOURCE_PACK_ID];
  delete nextImage[CINNY_SYNC_SOURCE_SHORTCODE];

  return nextImage;
};

export const filterSyncedPersonalPackImages = (packContent?: PackContent): PackContent => {
  const nextPack = clonePackContent(packContent);
  const rawImages = nextPack.images;

  if (!rawImages || typeof rawImages !== 'object') return nextPack;

  const filteredImages = Object.entries(rawImages).reduce<NonNullable<PackContent['images']>>(
    (images, [shortcode, image]) => {
      if (!image || typeof image !== 'object' || isSyncedPersonalPackImage(image)) {
        return images;
      }

      images[shortcode] = image;
      return images;
    },
    {}
  );

  if (Object.keys(filteredImages).length > 0) {
    nextPack.images = filteredImages;
  } else {
    delete nextPack.images;
  }

  return nextPack;
};

export const getEditableDefaultUserImagePackContent = (mx: MatrixClient): PackContent =>
  filterSyncedPersonalPackImages(getRawUserImagePackContent(mx));

const normalizeShortcode = (value?: string): string => {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(SHORTCODE_SANITIZE_REG, '-')
    .replace(MULTI_DASH_REG, '-')
    .replace(EDGE_DASH_REG, '');

  return normalized || DEFAULT_SHORTCODE_FALLBACK;
};

const getPackToken = (packId: string): string => {
  const normalizedPackId = normalizeShortcode(packId);
  return normalizedPackId.slice(-PACK_TOKEN_LENGTH) || 'pack';
};

const findShortcodeByUrl = (
  images: NonNullable<PackContent['images']> | undefined,
  url: string
): string | undefined =>
  Object.entries(images ?? {}).find(([, image]) => image?.url === url)?.[0];

const findShortcodeBySourceUrl = (
  images: NonNullable<PackContent['images']> | undefined,
  sourceUrl: string
): string | undefined =>
  Object.entries(images ?? {}).find(
    ([, image]) => image?.url === sourceUrl || image?.[CINNY_SOURCE_MXC] === sourceUrl
  )?.[0];

const buildSyncedShortcode = (
  packId: string,
  sourceShortcode: string,
  hasShortcode: (shortcode: string) => boolean
): string => {
  const baseShortcode = normalizeShortcode(sourceShortcode);
  const withPackToken = `${baseShortcode}-${getPackToken(packId)}`;

  if (!hasShortcode(withPackToken)) return withPackToken;

  return suffixRename(withPackToken, hasShortcode);
};

export const buildSyncedDefaultPackContent = (
  defaultPackContent?: PackContent,
  customContent?: UserImagePacksContent
): PackContent => {
  const nextDefaultPack = filterSyncedPersonalPackImages(defaultPackContent);
  const baseImages = {
    ...(nextDefaultPack.images ?? {}),
  };
  const usedShortcodes = new Set(Object.keys(baseImages));
  const seenUrls = new Set(
    Object.values(baseImages)
      .map((image) => image?.url)
      .filter((url): url is string => typeof url === 'string')
  );

  Object.entries(customContent?.packs ?? {}).forEach(([packId, packContent]) => {
    Object.entries(packContent?.images ?? {}).forEach(([shortcode, image]) => {
      if (!image || typeof image !== 'object' || typeof image.url !== 'string') return;
      if (seenUrls.has(image.url)) return;
      const effectiveUsage =
        Array.isArray(image.usage) && image.usage.length > 0
          ? image.usage
          : Array.isArray(packContent.pack?.usage) && packContent.pack.usage.length > 0
            ? packContent.pack.usage
            : undefined;

      const nextShortcode = buildSyncedShortcode(packId, shortcode, (candidate) =>
        usedShortcodes.has(candidate)
      );

      usedShortcodes.add(nextShortcode);
      seenUrls.add(image.url);
      baseImages[nextShortcode] = {
        ...stripSyncMeta(image),
        usage: effectiveUsage,
        [CINNY_SYNC_SOURCE_PACK_ID]: packId,
        [CINNY_SYNC_SOURCE_SHORTCODE]: shortcode,
      };
    });
  });

  if (Object.keys(baseImages).length > 0) {
    nextDefaultPack.images = baseImages;
  } else {
    delete nextDefaultPack.images;
  }

  return nextDefaultPack;
};

const packContentEqual = (pack1?: PackContent, pack2?: PackContent): boolean =>
  JSON.stringify(clonePackContent(pack1)) === JSON.stringify(clonePackContent(pack2));

const commitPersonalPackState = async (
  mx: MatrixClient,
  editableDefaultPackContent?: PackContent,
  customContent?: UserImagePacksContent
) => {
  const resolvedCustomContent = customContent ?? getCustomUserImagePacksContent(mx);
  const syncedDefaultPack = buildSyncedDefaultPackContent(
    editableDefaultPackContent,
    resolvedCustomContent
  );

  const tasks: Promise<unknown>[] = [mx.setAccountData(AccountDataEvent.PoniesUserEmotes, syncedDefaultPack)];

  if (customContent) {
    tasks.push(
      mx.setAccountData(
        AccountDataEvent.CinnyUserEmojiPacks,
        cloneUserImagePacksContent(customContent)
      )
    );
  }

  await Promise.all(tasks);
};

export const setRawDefaultUserImagePackContent = async (
  mx: MatrixClient,
  defaultPackContent: PackContent
) => {
  await commitPersonalPackState(mx, filterSyncedPersonalPackImages(defaultPackContent));
};

export const setCustomUserImagePacksContent = async (
  mx: MatrixClient,
  customContent: UserImagePacksContent
) => {
  await commitPersonalPackState(
    mx,
    getEditableDefaultUserImagePackContent(mx),
    customContent
  );
};

export const setPersonalPackOrder = async (
  mx: MatrixClient,
  order: string[]
) => {
  const userId = mx.getUserId();
  if (!userId) {
    throw new Error('Missing user id');
  }

  const content = cloneUserImagePacksContent(getCustomUserImagePacksContent(mx));
  const customPackIds = Object.keys(content.packs ?? {});
  const knownPackIds = [userId, ...customPackIds];
  const currentOrder = getPersonalPackOrder(content, knownPackIds);

  content.version = content.version ?? 1;
  content.order = getPersonalPackOrder(
    {
      ...content,
      order: order.filter((packId) => currentOrder.includes(packId)),
    },
    knownPackIds,
    userId
  );

  await setCustomUserImagePacksContent(mx, content);
};

export const isDefaultPersonalPackImageSaved = (
  mx: MatrixClient,
  sourceUrl: string | undefined
): boolean => {
  if (!sourceUrl) return false;

  return !!findShortcodeBySourceUrl(getRawUserImagePackContent(mx)?.images, sourceUrl);
};

export const ensurePersonalPackSync = async (mx: MatrixClient): Promise<boolean> => {
  const rawDefaultPack = getRawUserImagePackContent(mx);
  const syncedDefaultPack = buildSyncedDefaultPackContent(
    rawDefaultPack,
    getCustomUserImagePacksContent(mx)
  );

  if (packContentEqual(rawDefaultPack, syncedDefaultPack)) {
    return false;
  }

  await mx.setAccountData(AccountDataEvent.PoniesUserEmotes, syncedDefaultPack);
  return true;
};

export const addImageToDefaultPersonalPack = async (
  mx: MatrixClient,
  image: PackImage,
  preferredShortcode?: string
): Promise<string> => {
  const nextDefaultPack = getEditableDefaultUserImagePackContent(mx);
  const existingShortcode =
    typeof image.url === 'string'
      ? findShortcodeBySourceUrl(
          getRawUserImagePackContent(mx)?.images,
          image[CINNY_SOURCE_MXC] ?? image.url
        ) ?? findShortcodeByUrl(nextDefaultPack.images, image.url)
      : undefined;

  if (existingShortcode) return existingShortcode;

  const existingImages = {
    ...(nextDefaultPack.images ?? {}),
  };
  const hasShortcode = (candidate: string) =>
    Object.prototype.hasOwnProperty.call(existingImages, candidate);
  let nextShortcode = normalizeShortcode(preferredShortcode);
  if (hasShortcode(nextShortcode)) {
    const existingImage = existingImages[nextShortcode];
    if (existingImage?.url !== image.url) {
      nextShortcode = suffixRename(nextShortcode, hasShortcode);
    }
  }

  const reorderedImages = {
    [nextShortcode]: stripSyncMeta(image),
  } as NonNullable<PackContent['images']>;
  Object.entries(existingImages).forEach(([shortcode, entry]) => {
    reorderedImages[shortcode] = entry;
  });
  nextDefaultPack.images = reorderedImages;

  await commitPersonalPackState(mx, nextDefaultPack);

  return nextShortcode;
};

export async function moveImageBetweenPersonalPacks(
  mx: MatrixClient,
  sourcePackId: string,
  targetPackId: string,
  image: PackImageReader
) {
  if (sourcePackId === targetPackId) return;

  const userId = mx.getUserId();
  if (!userId) throw new Error('Missing user id');

  const sourceIsDefault = sourcePackId === userId;
  const targetIsDefault = targetPackId === userId;

  const defaultPackContent = getEditableDefaultUserImagePackContent(mx);
  const customContent = cloneUserImagePacksContent(getCustomUserImagePacksContent(mx));
  const customPacks = {
    ...(customContent.packs ?? {}),
  };

  const sourcePackContent = clonePackContent(
    sourceIsDefault ? defaultPackContent : customPacks[sourcePackId]
  );
  const targetPackContent = clonePackContent(
    targetIsDefault ? defaultPackContent : customPacks[targetPackId]
  );

  const sourceImages = {
    ...(sourcePackContent.images ?? {}),
  };
  const targetImages = {
    ...(targetPackContent.images ?? {}),
  };

  delete sourceImages[image.shortcode];

  const existingTargetShortcode = findShortcodeByUrl(targetImages, image.url);
  if (!existingTargetShortcode) {
    let nextShortcode = normalizeShortcode(image.shortcode);
    const hasTargetShortcode = (shortcode: string) =>
      Object.prototype.hasOwnProperty.call(targetImages, shortcode);

    if (hasTargetShortcode(nextShortcode)) {
      nextShortcode = suffixRename(nextShortcode, hasTargetShortcode);
    }

    targetImages[nextShortcode] = stripSyncMeta(image.content);
  }

  sourcePackContent.images = Object.keys(sourceImages).length > 0 ? sourceImages : undefined;
  targetPackContent.images = Object.keys(targetImages).length > 0 ? targetImages : undefined;

  if (sourceIsDefault) {
    customPacks[targetPackId] = targetPackContent;
    customContent.version = customContent.version ?? 1;
    customContent.packs = customPacks;
    await commitPersonalPackState(mx, sourcePackContent, customContent);
    return;
  }

  if (targetIsDefault) {
    customPacks[sourcePackId] = sourcePackContent;
    customContent.version = customContent.version ?? 1;
    customContent.packs = customPacks;
    await commitPersonalPackState(mx, targetPackContent, customContent);
    return;
  }

  customPacks[sourcePackId] = sourcePackContent;
  customPacks[targetPackId] = targetPackContent;
  customContent.version = customContent.version ?? 1;
  customContent.packs = customPacks;

  await commitPersonalPackState(mx, defaultPackContent, customContent);
}
