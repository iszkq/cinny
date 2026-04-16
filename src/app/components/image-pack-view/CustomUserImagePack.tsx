import React, { useCallback, useMemo } from 'react';
import { ImagePackContent } from './ImagePackContent';
import { ImagePack, PackContent, UserImagePacksContent, getCustomUserImagePacksContent } from '../../plugins/custom-emoji';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { AccountDataEvent } from '../../../types/matrix/accountData';
import { useCustomUserImagePack } from '../../hooks/useImagePacks';

type CustomUserImagePackProps = {
  packId: string;
};

export function CustomUserImagePack({ packId }: CustomUserImagePackProps) {
  const mx = useMatrixClient();
  const imagePack = useCustomUserImagePack(packId);

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

      await mx.setAccountData(AccountDataEvent.CinnyUserEmojiPacks, updatedContent);
    },
    [mx, packId]
  );

  return (
    <ImagePackContent imagePack={imagePack ?? fallbackPack} canEdit onUpdate={handleUpdate} />
  );
}
