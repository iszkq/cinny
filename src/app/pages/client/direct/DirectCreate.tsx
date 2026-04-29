import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Icon, IconButton, Icons, Scroll } from 'folds';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { getDirectCreateSearchParams } from '../../pathSearchParam';
import { getDirectRoomPath } from '../../pathUtils';
import { getDMRoomFor } from '../../../utils/matrix';
import { useDirectRooms } from './useDirectRooms';
import { isCompactScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import {
  Page,
  PageContent,
  PageContentCenter,
  PageHeader,
  PageHero,
  PageHeroSection,
} from '../../../components/page';
import { BackRouteHandler } from '../../../components/BackRouteHandler';
import { CreateChat } from '../../../features/create-chat';

export function DirectCreate() {
  const mx = useMatrixClient();
  const screenSize = useScreenSizeContext();
  const compact = isCompactScreenSize(screenSize);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { userId } = getDirectCreateSearchParams(searchParams);

  const directs = useDirectRooms();

  useEffect(() => {
    if (userId) {
      const roomId = getDMRoomFor(mx, userId)?.roomId;
      if (roomId && directs.includes(roomId)) {
        navigate(getDirectRoomPath(roomId), { replace: true });
      }
    }
  }, [mx, navigate, directs, userId]);

  return (
    <Page>
      {compact && (
        <PageHeader balance outlined={false}>
          <Box grow="Yes" alignItems="Center" gap="200">
            <BackRouteHandler>
              {(onBack) => (
                <IconButton onClick={onBack}>
                  <Icon src={Icons.ArrowLeft} />
                </IconButton>
              )}
            </BackRouteHandler>
          </Box>
        </PageHeader>
      )}
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <PageContentCenter>
              <PageHeroSection>
                <Box direction="Column" gap="700">
                  <PageHero
                    icon={<Icon size="600" src={Icons.Mention} />}
                    title={'\u521b\u5efa\u804a\u5929'}
                    subTitle={
                      '\u8f93\u5165\u7528\u6237 ID\uff0c\u5f00\u59cb\u4e00\u573a\u79c1\u5bc6\u52a0\u5bc6\u804a\u5929\u3002'
                    }
                  />
                  <CreateChat defaultUserId={userId} />
                </Box>
              </PageHeroSection>
            </PageContentCenter>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
