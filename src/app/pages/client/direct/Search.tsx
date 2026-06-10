import React, { useRef } from 'react';
import { Box, Icon, Icons, Scroll, Text } from 'folds';
import { Page, PageContent, PageContentCenter, PageHeader } from '../../../components/page';
import { MessageSearch } from '../../../features/message-search';
import { isCompactScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { useDirectRooms } from './useDirectRooms';

export function DirectSearch() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rooms = useDirectRooms();
  const screenSize = useScreenSizeContext();
  const compact = isCompactScreenSize(screenSize);

  return (
    <Page>
      <PageHeader balance>
        <Box grow="Yes" alignItems="Center" gap="200">
          <Box grow="Yes" basis="No" />
          <Box justifyContent="Center" alignItems="Center" gap="200">
            {!compact && <Icon size="400" src={Icons.Search} />}
            <Text size="H3" truncate>
              消息搜索
            </Text>
          </Box>
          <Box grow="Yes" basis="No" />
        </Box>
      </PageHeader>
      <Box style={{ position: 'relative' }} grow="Yes">
        <Scroll ref={scrollRef} hideTrack visibility="Hover">
          <PageContent>
            <PageContentCenter>
              <MessageSearch
                defaultRoomsFilterName="私聊"
                allowGlobal
                rooms={rooms}
                scrollRef={scrollRef}
              />
            </PageContentCenter>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
