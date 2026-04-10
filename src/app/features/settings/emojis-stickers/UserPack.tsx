import React from 'react';
import { Avatar, AvatarFallback, AvatarImage, Box, Button, Icon, Icons, Text } from 'folds';
import { useUserImagePack } from '../../../hooks/useImagePacks';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { ImagePack, ImageUsage } from '../../../plugins/custom-emoji';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { mxcUrlToHttp } from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';

type UserPackProps = {
  onViewPack: (imagePack: ImagePack) => void;
};
export function UserPack({ onViewPack }: UserPackProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const userPack = useUserImagePack();
  const avatarMxc = userPack?.getAvatarUrl(ImageUsage.Emoticon);
  const avatarUrl = avatarMxc ? mxcUrlToHttp(mx, avatarMxc, useAuthentication) : undefined;

  const handleView = () => {
    if (userPack) {
      onViewPack(userPack);
    } else {
      const defaultPack = new ImagePack(mx.getUserId() ?? '', {}, undefined);
      onViewPack(defaultPack);
    }
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{'\u9ed8\u8ba4\u5206\u7c7b'}</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title={userPack?.meta.name ?? '\u9ed8\u8ba4\u5206\u7c7b'}
          description={
            userPack?.meta.attribution ??
            '\u8fd9\u662f\u4f60\u7684\u4e2a\u4eba\u9ed8\u8ba4\u8868\u60c5\u5206\u7c7b\u3002'
          }
          before={
            <Avatar size="300" radii="300">
              {avatarUrl ? (
                <AvatarImage style={{ objectFit: 'contain' }} src={avatarUrl} />
              ) : (
                <AvatarFallback>
                  <Icon size="400" src={Icons.Sticker} filled />
                </AvatarFallback>
              )}
            </Avatar>
          }
          after={
            <Button
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="300"
              outlined
              onClick={handleView}
            >
              <Text size="B300">{'\u7ba1\u7406\u5206\u7c7b'}</Text>
            </Button>
          }
        />
      </SequenceCard>
    </Box>
  );
}
