import React, { useEffect, useState } from 'react';
import { Box, Button, Icon, IconButton, Icons, Scroll, Text, toRem } from 'folds';
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
import { PROJECT_SOURCE_URL } from '../../../constants/projectInfo';
import {
  clearAllLocalData,
  clearCacheAndReload,
  clearResourceCaches,
} from '../../../../client/initMatrix';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { DesktopUpdater } from './DesktopUpdater';
import { ReleaseNotes } from '../../../components/ReleaseNotes';
import { PWAInstallButton } from '../../../components/PWAInstallButton';
import {
  DesktopUpdateReleaseInfo,
  fetchLatestDesktopRelease,
  normalizeDesktopUpdateVersion,
} from '../../../utils/desktopUpdater';

type AboutProps = {
  requestClose: () => void;
};

export function About({ requestClose }: AboutProps) {
  const mx = useMatrixClient();
  const [latestRelease, setLatestRelease] = useState<DesktopUpdateReleaseInfo>();
  const [releaseNotesLoaded, setReleaseNotesLoaded] = useState(false);

  useEffect(() => {
    let disposed = false;

    void fetchLatestDesktopRelease()
      .then((releaseInfo) => {
        if (!disposed) {
          setLatestRelease(releaseInfo);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!disposed) {
          setReleaseNotesLoaded(true);
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  const latestVersionLabel = latestRelease?.version
    ? `v${normalizeDesktopUpdateVersion(latestRelease.version)}`
    : undefined;

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              {'\u5173\u4e8e'}
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
                      <Text size="B300">{'\u9879\u76ee\u6e90\u7801'}</Text>
                    </Button>
                    <AuthorContactButton
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      radii="300"
                      before={<Icon src={Icons.User} size="100" filled />}
                    >
                      <Text size="B300">{'\u8054\u7cfb\u4f5c\u8005'}</Text>
                    </AuthorContactButton>
                    <PWAInstallButton
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      radii="300"
                      before={<Icon src={Icons.Download} size="100" filled />}
                    >
                      <Text size="B300">安装应用</Text>
                    </PWAInstallButton>
                  </Box>
                </Box>
              </Box>

              <Box direction="Column" gap="100">
                <Text size="L400">{'\u672c\u5730\u6570\u636e'}</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title={'\u6e05\u7406\u8d44\u6e90\u7f13\u5b58'}
                    description={
                      '\u5220\u9664\u672c\u5730\u5a92\u4f53\u4e0e Service Worker \u7f13\u5b58\uff0c\u7136\u540e\u91cd\u65b0\u52a0\u8f7d\u3002'
                    }
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
                        <Text size="B300">{'\u6e05\u7406\u8d44\u6e90'}</Text>
                      </Button>
                    }
                  />
                  <SettingTile
                    title={'\u6e05\u7406\u7f13\u5b58\u5e76\u91cd\u8f7d'}
                    description={
                      '\u6e05\u9664\u5f53\u524d\u4f1a\u8bdd\u7f13\u5b58\u5e76\u4ece\u670d\u52a1\u5668\u91cd\u65b0\u62c9\u53d6\u6570\u636e\u3002'
                    }
                    after={
                      <Button
                        onClick={() => clearCacheAndReload(mx)}
                        variant="Secondary"
                        fill="Soft"
                        size="300"
                        radii="300"
                        outlined
                      >
                        <Text size="B300">{'\u6e05\u7406\u7f13\u5b58'}</Text>
                      </Button>
                    }
                  />
                  <SettingTile
                    title={'\u6e05\u7a7a\u5168\u90e8\u672c\u5730\u6570\u636e'}
                    description={
                      '\u6e05\u9664\u5e94\u7528\u5185\u5168\u90e8\u672c\u5730\u6570\u636e\u4e0e\u7f13\u5b58\uff0c\u6062\u590d\u5230\u521d\u59cb\u72b6\u6001\uff0c\u5b8c\u6210\u540e\u9700\u8981\u91cd\u65b0\u767b\u5f55\u3002'
                    }
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
                        <Text size="B300">{'\u5168\u90e8\u6e05\u7a7a'}</Text>
                      </Button>
                    }
                  />
                </SequenceCard>
              </Box>

              <Box direction="Column" gap="100">
                <Text size="L400">{'\u7248\u672c\u66f4\u65b0'}</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <Box direction="Column" gap="200">
                    {latestVersionLabel && (
                      <Text size="T200" priority="300">
                        {`\u6700\u65b0 release ${latestVersionLabel}`}
                      </Text>
                    )}
                    <ReleaseNotes
                      body={latestRelease?.body}
                      emptyText={
                        releaseNotesLoaded
                          ? '\u6682\u65e0\u66f4\u65b0\u8bf4\u660e\u3002'
                          : '\u6b63\u5728\u83b7\u53d6\u6700\u65b0 release \u66f4\u65b0\u8bf4\u660e...'
                      }
                    />
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
