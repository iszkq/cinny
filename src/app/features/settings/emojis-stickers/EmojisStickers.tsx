import React, { useState } from 'react';
import { Box, Text, IconButton, Icon, Icons, Scroll } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { GlobalPacks } from './GlobalPacks';
import { UserPack } from './UserPack';
import { ImagePack } from '../../../plugins/custom-emoji';
import { ImagePackView } from '../../../components/image-pack-view';

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
              <Box direction="Column" gap="100">
                <Text size="L400">{'\u5206\u7c7b\u8bf4\u660e'}</Text>
                <Text size="T300" priority="300">
                  {
                    '\u8fd9\u91cc\u7684 Pack \u5c31\u662f\u4e00\u4e2a\u8868\u60c5\u5206\u7c7b\u3002\u9664\u4e86\u9ed8\u8ba4\u5206\u7c7b\uff0c\u4f60\u8fd8\u53ef\u4ee5\u65b0\u5efa\u591a\u4e2a\u4e2a\u4eba\u5206\u7c7b\uff1b\u623f\u95f4\u5171\u4eab\u5206\u7c7b\u5219\u53ef\u4ee5\u6309\u9700\u6536\u85cf\u5230\u5168\u5c40\u8868\u60c5\u9762\u677f\u3002'
                  }
                </Text>
              </Box>
              <UserPack onViewPack={setImagePack} />
              <GlobalPacks onViewPack={setImagePack} />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
