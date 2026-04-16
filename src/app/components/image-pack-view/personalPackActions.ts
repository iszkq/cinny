import { ImagePack } from '../../plugins/custom-emoji';

export { moveImageBetweenPersonalPacks } from '../../plugins/custom-emoji';

export type PersonalImagePackTarget = {
  id: string;
  label: string;
};

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
