import React from 'react';
import { Box, Text, IconButton, Icon, Icons, Scroll, Button, config, toRem } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { AuthorContactButton } from '../../../components/AuthorContactButton';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { FEATURE_UPDATE_NOTES, PROJECT_SOURCE_URL } from '../../../constants/projectInfo';
import CinnySVG from '../../../../../public/res/svg/cinny.svg';
import { clearCacheAndReload } from '../../../../client/initMatrix';
import { useMatrixClient } from '../../../hooks/useMatrixClient';

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
                    src={CinnySVG}
                    alt="Cinny logo"
                  />
                </Box>
                <Box direction="Column" gap="300">
                  <Box direction="Column" gap="100">
                    <Box gap="100" alignItems="End">
                      <Text size="H3">Cinny</Text>
                      <Text size="T200">v4.11.1</Text>
                    </Box>
                    <Text>面向中文使用场景优化的 Matrix 客户端。</Text>
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
                      <Text size="B300">源码地址</Text>
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
                <Text size="L400">选项</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="清除缓存并重新加载"
                    description="清除本地存储的所有数据，然后重新从服务器加载。"
                    after={
                      <Button
                        onClick={() => clearCacheAndReload(mx)}
                        variant="Secondary"
                        fill="Soft"
                        size="300"
                        radii="300"
                        outlined
                      >
                        <Text size="B300">清除缓存</Text>
                      </Button>
                    }
                  />
                </SequenceCard>
              </Box>
              <Box direction="Column" gap="100">
                <Text size="L400">功能更新说明</Text>
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
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
