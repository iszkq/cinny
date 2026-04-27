import React from 'react';
import { Box, Button, Icon, Icons, Text, config, toRem } from 'folds';
import { Page, PageHero, PageHeroSection } from '../../components/page';
import { AuthorContactButton } from '../../components/AuthorContactButton';
import { APP_DISPLAY_NAME, APP_LOGO_URL, APP_TAGLINE } from '../../constants/branding';
import { PROJECT_SOURCE_URL } from '../../constants/projectInfo';

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
            icon={
              <img width="70" height="70" src={APP_LOGO_URL} alt={`${APP_DISPLAY_NAME} Logo`} />
            }
            title={`欢迎使用 ${APP_DISPLAY_NAME}`}
            subTitle={
              <span>
                {APP_TAGLINE}{' '}
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
