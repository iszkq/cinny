import React from 'react';
import { Box, IconButton, Text, Icon, Icons, Scroll, Chip } from 'folds';
import { PackAddress } from '../../plugins/custom-emoji';
import { Page, PageHeader, PageContent } from '../page';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { RoomImagePack } from './RoomImagePack';
import { UserImagePack } from './UserImagePack';
import { CustomUserImagePack } from './CustomUserImagePack';

type ImagePackViewProps = {
  imagePack?: {
    id: string;
    address: PackAddress | undefined;
  };
  requestClose: () => void;
};
export function ImagePackView({ imagePack, requestClose }: ImagePackViewProps) {
  const mx = useMatrixClient();
  const room = imagePack?.address && mx.getRoom(imagePack.address.roomId);
  const userId = mx.getUserId();
  const isDefaultUserPack = !imagePack?.address && imagePack?.id === userId;

  return (
    <Page>
      <PageHeader outlined={false} balance>
        <Box alignItems="Center" grow="Yes" gap="200">
          <Box alignItems="Inherit" grow="Yes" gap="200">
            <Chip
              size="500"
              radii="Pill"
              onClick={requestClose}
              before={<Icon size="100" src={Icons.ArrowLeft} />}
            >
              <Text size="T300">{'\u8868\u60c5\u4e0e\u5206\u7c7b'}</Text>
            </Chip>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            {room && imagePack?.address ? (
              <RoomImagePack room={room} stateKey={imagePack.address.stateKey} />
            ) : imagePack && !isDefaultUserPack ? (
              <CustomUserImagePack packId={imagePack.id} />
            ) : (
              <UserImagePack />
            )}
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
