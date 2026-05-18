import React from 'react';
import { Box, Button, Icon, IconButton, Icons, Scroll, Text, config, toRem } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { AuthorContactButton } from '../../../components/AuthorContactButton';
import { APP_DISPLAY_NAME, APP_LOGO_URL, APP_TAGLINE } from '../../../constants/branding';
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
              About
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
                      <Text size="T200">v4.11.1</Text>
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
                      <Text size="B300">Source Code</Text>
                    </Button>
                    <AuthorContactButton
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      radii="300"
                      before={<Icon src={Icons.User} size="100" filled />}
                    >
                      <Text size="B300">Contact Author</Text>
                    </AuthorContactButton>
                  </Box>
                </Box>
              </Box>

              <Box direction="Column" gap="100">
                <Text size="L400">Local Data</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Clear resource cache"
                    description="Remove local media/resource caches such as emoji, sticker and service-worker caches, then reload."
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
                        <Text size="B300">Clear Resources</Text>
                      </Button>
                    }
                  />
                  <SettingTile
                    title="Clear cache and reload"
                    description="Clear the current session cache and sync store, then fetch data from the server again."
                    after={
                      <Button
                        onClick={() => clearCacheAndReload(mx)}
                        variant="Secondary"
                        fill="Soft"
                        size="300"
                        radii="300"
                        outlined
                      >
                        <Text size="B300">Clear Cache</Text>
                      </Button>
                    }
                  />
                  <SettingTile
                    title="Wipe all local data"
                    description="Clear IndexedDB, localStorage, sessionStorage and all caches. You will need to log in again after this."
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
                        <Text size="B300">Wipe All</Text>
                      </Button>
                    }
                  />
                </SequenceCard>
              </Box>

              <Box direction="Column" gap="100">
                <Text size="L400">What&apos;s New</Text>
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
