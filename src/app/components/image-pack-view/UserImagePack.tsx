import React, { useCallback, useMemo } from 'react';
import { ImagePackContent } from './ImagePackContent';
import {
  ImagePack,
  PackContent,
  PackImageReader,
  setRawDefaultUserImagePackContent,
} from '../../plugins/custom-emoji';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useCustomUserImagePacks, useUserImagePack } from '../../hooks/useImagePacks';
import {
  getCustomPersonalPackTargets,
  moveImageBetweenPersonalPacks,
} from './personalPackActions';

export function UserImagePack() {
  const mx = useMatrixClient();

  const defaultPack = useMemo(() => new ImagePack(mx.getUserId() ?? '', {}, undefined), [mx]);
  const imagePack = useUserImagePack();
  const customUserPacks = useCustomUserImagePacks();
  const userId = mx.getUserId() ?? '';

  const moveTargets = useMemo(
    () => getCustomPersonalPackTargets(customUserPacks),
    [customUserPacks]
  );

  const handleUpdate = useCallback(
    async (packContent: PackContent) => {
      await setRawDefaultUserImagePackContent(mx, packContent);
    },
    [mx]
  );

  const handleMoveImage = useCallback(
    async (_shortcode: string, image: PackImageReader, targetPackId: string) => {
      await moveImageBetweenPersonalPacks(mx, userId, targetPackId, image);
    },
    [mx, userId]
  );

  return (
    <ImagePackContent
      imagePack={imagePack ?? defaultPack}
      canEdit
      onUpdate={handleUpdate}
      moveTargets={moveTargets}
      onMoveImage={moveTargets.length > 0 ? handleMoveImage : undefined}
    />
  );
}
