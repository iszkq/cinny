import React, { ReactNode } from 'react';
import { Box, Spinner, Text, config } from 'folds';
import { NavEmptyCenter, NavEmptyLayout } from '../../components/nav';
import { Page, PageHero, PageHeroSection } from '../../components/page';

type ClientSyncLoadingProps = {
  title?: ReactNode;
  content?: ReactNode;
};

const DEFAULT_TITLE = '\u6b63\u5728\u540c\u6b65\u4f1a\u8bdd';
const DEFAULT_CONTENT = '\u7a0d\u7b49\u7247\u523b\u3002';

export function ClientNavSyncLoading({
  title = DEFAULT_TITLE,
  content = DEFAULT_CONTENT,
}: ClientSyncLoadingProps) {
  return (
    <NavEmptyCenter>
      <NavEmptyLayout
        icon={<Spinner size="400" variant="Secondary" />}
        title={
          <Text size="H5" align="Center">
            {title}
          </Text>
        }
        content={
          <Text size="T300" align="Center">
            {content}
          </Text>
        }
      />
    </NavEmptyCenter>
  );
}

export function ClientSyncLoadingPage({
  title = DEFAULT_TITLE,
  content = DEFAULT_CONTENT,
}: ClientSyncLoadingProps) {
  return (
    <Page>
      <Box
        grow="Yes"
        style={{ padding: config.space.S400 }}
        alignItems="Center"
        justifyContent="Center"
      >
        <PageHeroSection>
          <PageHero
            icon={<Spinner size="600" variant="Secondary" />}
            title={title}
            subTitle={content}
          />
        </PageHeroSection>
      </Box>
    </Page>
  );
}
