import { MatrixClient } from 'matrix-js-sdk';
import { AccountDataEvent } from '../../../types/matrix/accountData';
import { ImagePack, PackContent, PackImageReader, UserImagePacksContent, getCustomUserImagePacksContent } from '../../plugins/custom-emoji';
import { suffixRename } from '../../utils/common';

export type PersonalImagePackTarget = {
  id: string;
  label: string;
};

const clonePackContent = (packContent?: PackContent): PackContent =>
  JSON.parse(JSON.stringify(packContent ?? {})) as PackContent;

const getPackDisplayName = (pack?: ImagePack, fallback = '\u672a\u547d\u540d\u5206\u7c7b') =>
  pack?.meta.name ?? fallback;

export const getDefaultPersonalPackTarget = (
  userId: string,
  defaultPack?: ImagePack
): PersonalImagePackTarget => ({
  id: userId,
  label: getPackDisplayName(defaultPack, '\u9ed8\u8ba4\u5206\u7c7b'),
});

export const getCustomPersonalPackTargets = (
  packs: ImagePack[],
  excludePackId?: string
): PersonalImagePackTarget[] =>
  packs
    .filter((pack) => pack.id !== excludePackId)
    .map((pack) => ({
      id: pack.id,
      label: getPackDisplayName(pack),
    }));

export async function moveImageBetweenPersonalPacks(
  mx: MatrixClient,
  sourcePackId: string,
  targetPackId: string,
  image: PackImageReader
) {
  if (sourcePackId === targetPackId) return;

  const userId = mx.getUserId();
  if (!userId) throw new Error('Missing user id');

  const defaultPackContent = clonePackContent(
    mx.getAccountData(AccountDataEvent.PoniesUserEmotes)?.getContent<PackContent>()
  );
  const customContent = getCustomUserImagePacksContent(mx);
  const customPacks = { ...(customContent.packs ?? {}) };

  const sourceIsDefault = sourcePackId === userId;
  const targetIsDefault = targetPackId === userId;

  const sourcePackContent = clonePackContent(
    sourceIsDefault ? defaultPackContent : customPacks[sourcePackId]
  );
  const targetPackContent = clonePackContent(
    targetIsDefault ? defaultPackContent : customPacks[targetPackId]
  );

  const sourceImages = { ...(sourcePackContent.images ?? {}) };
  const targetImages = { ...(targetPackContent.images ?? {}) };

  delete sourceImages[image.shortcode];

  let nextShortcode = image.shortcode;
  const hasTargetShortcode = (shortcode: string) =>
    Object.prototype.hasOwnProperty.call(targetImages, shortcode);

  if (hasTargetShortcode(nextShortcode)) {
    nextShortcode = suffixRename(nextShortcode, hasTargetShortcode);
  }

  targetImages[nextShortcode] = image.content;

  sourcePackContent.images = Object.keys(sourceImages).length > 0 ? sourceImages : undefined;
  targetPackContent.images = targetImages;

  const tasks: Promise<unknown>[] = [];

  if (sourceIsDefault || targetIsDefault) {
    const nextDefaultPack = sourceIsDefault ? sourcePackContent : targetPackContent;
    tasks.push(mx.setAccountData(AccountDataEvent.PoniesUserEmotes, nextDefaultPack));
  }

  if (!sourceIsDefault || !targetIsDefault) {
    const updatedContent: UserImagePacksContent = {
      ...customContent,
      version: customContent.version ?? 1,
      packs: {
        ...customPacks,
      },
    };

    if (!sourceIsDefault) {
      updatedContent.packs = {
        ...(updatedContent.packs ?? {}),
        [sourcePackId]: sourcePackContent,
      };
    }

    if (!targetIsDefault) {
      updatedContent.packs = {
        ...(updatedContent.packs ?? {}),
        [targetPackId]: targetPackContent,
      };
    }

    tasks.push(mx.setAccountData(AccountDataEvent.CinnyUserEmojiPacks, updatedContent));
  }

  await Promise.all(tasks);
}
