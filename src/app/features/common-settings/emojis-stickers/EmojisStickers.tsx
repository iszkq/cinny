import React, { useState } from 'react';
import { Box, Icon, IconButton, Icons, Scroll, Text } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { ImagePack } from '../../../plugins/custom-emoji';
import { ImagePackView } from '../../../components/image-pack-view';
import { RoomPacks } from './RoomPacks';

type EmojisStickersProps = {
  requestClose: () => void;
};
export function EmojisStickers({ requestClose }: EmojisStickersProps) {
  const [imagePack, setImagePack] = useState<ImagePack>();

  const handleImagePackViewClose = () => {
    setImagePack(undefined);
  };

  if (imagePack) {
    return <ImagePackView imagePack={imagePack} requestClose={handleImagePackViewClose} />;
  }

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              {'\u8868\u60c5\u4e0e\u5206\u7c7b'}
            </Text>
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
            <Box direction="Column" gap="700">
              <RoomPacks onViewPack={setImagePack} />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
