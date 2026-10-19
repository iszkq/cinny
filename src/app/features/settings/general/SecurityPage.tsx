import React from 'react';
import { Box, Icon, IconButton, Icons, Scroll, Text } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { Security } from './Security';
export function SecurityPage({ requestClose }: { requestClose: () => void }) {
  return (
    <Page>
      <PageHeader>
        <Box grow="Yes">
          <Text size="H3">安全</Text>
        </Box>
        <IconButton onClick={requestClose}>
          <Icon src={Icons.Cross} />
        </IconButton>
      </PageHeader>
      <Scroll hideTrack>
        <PageContent>
          <Security requestClose={requestClose} />
        </PageContent>
      </Scroll>
    </Page>
  );
}
