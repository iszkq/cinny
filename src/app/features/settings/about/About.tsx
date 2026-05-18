import React from 'react';
import { Box, Button, Icon, IconButton, Icons, Scroll, Text, config, toRem } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { AuthorContactButton } from '../../../components/AuthorContactButton';
import {
  APP_DISPLAY_NAME,
  APP_LOGO_URL,
  APP_TAGLINE,
  APP_VERSION,
} from '../../../constants/branding';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { FEATURE_UPDATE_NOTES, PROJECT_SOURCE_URL } from '../../../constants/projectInfo';
import {
  clearAllLocalData,
  clearCacheAndReload,
  clearResourceCaches,
} from '../../../../client/initMatrix';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { DesktopUpdater } from './DesktopUpdater';

type AboutProps = {
  requestClose: () => void;
};

export function About({ requestClose }: AboutProps) {
  const mx = useMatrixClient();

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              关于
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
              <Box gap="400">
                <Box shrink="No">
                  <img
                    style={{ width: toRem(60), height: toRem(60) }}
                    src={APP_LOGO_URL}
                    alt={`${APP_DISPLAY_NAME} logo`}
                  />
                </Box>
                <Box direction="Column" gap="300">
                  <Box direction="Column" gap="100">
                    <Box gap="100" alignItems="End">
                      <Text size="H3">{APP_DISPLAY_NAME}</Text>
                      <Text size="T200">{`v${APP_VERSION}`}</Text>
                    </Box>
                    <Text>{APP_TAGLINE}</Text>
                  </Box>

                  <Box gap="200" wrap="Wrap">
                    <Button
                      as="a"
                      href={PROJECT_SOURCE_URL}
                      rel="noreferrer noopener"
                      target="_blank"
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      radii="300"
                      before={<Icon src={Icons.Code} size="100" filled />}
                    >
                      <Text size="B300">项目源码</Text>
                    </Button>
                    <AuthorContactButton
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      radii="300"
                      before={<Icon src={Icons.User} size="100" filled />}
                    >
                      <Text size="B300">联系作者</Text>
                    </AuthorContactButton>
                  </Box>
                </Box>
              </Box>

              <Box direction="Column" gap="100">
                <Text size="L400">本地数据</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="清理资源缓存"
                    description="删除本地媒体与资源缓存，例如表情、贴图和 Service Worker 缓存，然后重新加载。"
                    after={
                      <Button
                        onClick={async () => {
                          await clearResourceCaches();
                          window.location.reload();
                        }}
                        variant="Secondary"
                        fill="Soft"
                        size="300"
                        radii="300"
                        outlined
                      >
                        <Text size="B300">清理资源</Text>
                      </Button>
                    }
                  />
                  <SettingTile
                    title="清理缓存并重载"
                    description="清除当前会话缓存和同步存储，然后重新从服务器拉取数据。"
                    after={
                      <Button
                        onClick={() => clearCacheAndReload(mx)}
                        variant="Secondary"
                        fill="Soft"
                        size="300"
                        radii="300"
                        outlined
                      >
                        <Text size="B300">清理缓存</Text>
                      </Button>
                    }
                  />
                  <SettingTile
                    title="清空全部本地数据"
                    description="清除 IndexedDB、localStorage、sessionStorage 以及全部缓存。完成后需要重新登录。"
                    after={
                      <Button
                        onClick={async () => {
                          await clearAllLocalData(mx);
                          window.location.reload();
                        }}
                        variant="Warning"
                        fill="Soft"
                        size="300"
                        radii="300"
                        outlined
                      >
                        <Text size="B300">全部清空</Text>
                      </Button>
                    }
                  />
                </SequenceCard>
              </Box>

              <Box direction="Column" gap="100">
                <Text size="L400">版本更新</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <Box
                    as="ul"
                    direction="Column"
                    gap="200"
                    style={{
                      margin: 0,
                      paddingLeft: config.space.S400,
                    }}
                  >
                    {FEATURE_UPDATE_NOTES.map((note) => (
                      <li key={note}>
                        <Text size="T300">{note}</Text>
                      </li>
                    ))}
                  </Box>
                </SequenceCard>
              </Box>

              <DesktopUpdater />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
