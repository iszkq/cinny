import React, { useCallback, useMemo } from 'react';
import { ImagePackContent } from './ImagePackContent';
import {
  ImagePack,
  PackContent,
  PackImageReader,
  setCustomUserImagePacksContent,
  UserImagePacksContent,
  getCustomUserImagePacksContent,
} from '../../plugins/custom-emoji';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useCustomUserImagePack, useCustomUserImagePacks, useUserImagePack } from '../../hooks/useImagePacks';
import {
  getCustomPersonalPackTargets,
  getDefaultPersonalPackTarget,
  moveImageBetweenPersonalPacks,
} from './personalPackActions';

type CustomUserImagePackProps = {
  packId: string;
};

export function CustomUserImagePack({ packId }: CustomUserImagePackProps) {
  const mx = useMatrixClient();
  const imagePack = useCustomUserImagePack(packId);
  const defaultPack = useUserImagePack();
  const customUserPacks = useCustomUserImagePacks();
  const userId = mx.getUserId() ?? '';

  const fallbackPack = useMemo(
    () =>
      new ImagePack(
        packId,
        {
          pack: {
            display_name: '\u672a\u547d\u540d\u5206\u7c7b',
          },
        },
        undefined
      ),
    [packId]
  );

  const moveTargets = useMemo(() => {
    if (!userId) return [];

    return [
      getDefaultPersonalPackTarget(userId, defaultPack),
      ...getCustomPersonalPackTargets(customUserPacks, packId),
    ];
  }, [userId, defaultPack, customUserPacks, packId]);

  const handleUpdate = useCallback(
    async (packContent: PackContent) => {
      const content = getCustomUserImagePacksContent(mx);
      const updatedContent: UserImagePacksContent = {
        ...content,
        version: content.version ?? 1,
        packs: {
          ...(content.packs ?? {}),
          [packId]: packContent,
        },
      };

      await setCustomUserImagePacksContent(mx, updatedContent);
    },
    [mx, packId]
  );

  const handleMoveImage = useCallback(
    async (_shortcode: string, image: PackImageReader, targetPackId: string) => {
      await moveImageBetweenPersonalPacks(mx, packId, targetPackId, image);
    },
    [mx, packId]
  );

  return (
    <ImagePackContent
      imagePack={imagePack ?? fallbackPack}
      canEdit
      onUpdate={handleUpdate}
      moveTargets={moveTargets}
      onMoveImage={moveTargets.length > 0 ? handleMoveImage : undefined}
    />
  );
}
