import React from 'react';
import { Box, Button, Icon, Icons, Text, config, toRem } from 'folds';
import { Page, PageHero, PageHeroSection } from '../../components/page';
import { AuthorContactButton } from '../../components/AuthorContactButton';
import { PROJECT_SOURCE_URL } from '../../constants/projectInfo';
import CinnySVG from '../../../../public/res/svg/cinny.svg';

export function WelcomePage() {
  return (
    <Page>
      <Box
        grow="Yes"
        style={{ padding: config.space.S400, paddingBottom: config.space.S700 }}
        alignItems="Center"
        justifyContent="Center"
      >
        <PageHeroSection>
          <PageHero
            icon={<img width="70" height="70" src={CinnySVG} alt="Cinny Logo" />}
            title="欢迎使用 Cinny"
            subTitle={
              <span>
                面向中文使用场景优化的 Matrix 客户端。{' '}
                <a href={PROJECT_SOURCE_URL} target="_blank" rel="noreferrer noopener">
                  v4.11.1
                </a>
              </span>
            }
          >
            <Box justifyContent="Center">
              <Box grow="Yes" style={{ maxWidth: toRem(300) }} direction="Column" gap="300">
                <Button
                  as="a"
                  href={PROJECT_SOURCE_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  before={<Icon size="200" src={Icons.Code} />}
                >
                  <Text as="span" size="B400" truncate>
                    源码地址
                  </Text>
                </Button>
                <AuthorContactButton fill="Soft" before={<Icon size="200" src={Icons.User} />}>
                  <Text as="span" size="B400" truncate>
                    联系作者
                  </Text>
                </AuthorContactButton>
              </Box>
            </Box>
          </PageHero>
        </PageHeroSection>
      </Box>
    </Page>
  );
}
