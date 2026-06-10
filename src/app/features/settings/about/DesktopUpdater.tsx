import React, { useEffect } from 'react';
import { Box, Button, Spinner, Text } from 'folds';
import { APP_VERSION } from '../../../constants/branding';
import { ReleaseNotes } from '../../../components/ReleaseNotes';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { useDesktopUpdater } from '../../../hooks/useDesktopUpdater';
import { openDesktopUpdateDownloadUrl } from '../../../utils/desktopUpdater';
import { SequenceCardStyle } from '../styles.css';

export function DesktopUpdater() {
  const {
    desktopSupported,
    status,
    message,
    pendingUpdate,
    latestRelease,
    progressText,
    lastCheckedAt,
    checkForUpdates,
    downloadAndInstall,
    formatVersionLabel,
  } = useDesktopUpdater();

  const checking = status === 'checking';
  const downloading = status === 'downloading';
  const currentVersionLabel = formatVersionLabel(APP_VERSION);
  const nextVersionLabel = pendingUpdate && formatVersionLabel(pendingUpdate.version);
  const latestVersionLabel = latestRelease && formatVersionLabel(latestRelease.version);
  const releaseNotesBody = latestRelease?.body ?? pendingUpdate?.body;
  const releaseNotesVersionLabel = latestVersionLabel ?? nextVersionLabel;
  const statusText = progressText ?? message;
  const manualDownloadUrl = pendingUpdate?.downloadUrl ?? latestRelease?.downloadUrl;

  useEffect(() => {
    if (!desktopSupported || lastCheckedAt || status === 'checking' || status === 'downloading') {
      return;
    }

    void checkForUpdates({ silentIfLatest: true, showErrors: false });
  }, [checkForUpdates, desktopSupported, lastCheckedAt, status]);

  if (!desktopSupported) {
    return null;
  }

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{'\u684c\u9762\u66f4\u65b0'}</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title={'\u5f53\u524d\u7248\u672c'}
          description={
            nextVersionLabel
              ? `${currentVersionLabel} -> \u53ef\u66f4\u65b0\u5230 ${nextVersionLabel}`
              : latestVersionLabel && latestVersionLabel !== currentVersionLabel
              ? `${currentVersionLabel} | \u6700\u65b0\u53d1\u5e03 ${latestVersionLabel}`
              : currentVersionLabel
          }
        />
        <SettingTile
          title={'\u81ea\u52a8\u68c0\u67e5\u66f4\u65b0'}
          description={statusText}
          after={
            <Box wrap="Wrap" gap="200" justifyContent="End">
              <Button
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="300"
                onClick={() => {
                  void checkForUpdates();
                }}
                disabled={!desktopSupported || checking || downloading}
              >
                <Text size="B300">
                  {checking ? '\u68c0\u67e5\u4e2d...' : '\u68c0\u67e5\u66f4\u65b0'}
                </Text>
              </Button>
              {pendingUpdate && (
                <Button
                  variant="Primary"
                  size="300"
                  radii="300"
                  onClick={() => {
                    void downloadAndInstall();
                  }}
                  disabled={downloading}
                  before={
                    downloading ? (
                      <Spinner size="100" fill="Solid" variant="Primary" />
                    ) : undefined
                  }
                >
                  <Text size="B300">
                    {downloading ? '\u5b89\u88c5\u4e2d...' : '\u4e0b\u8f7d\u5e76\u5b89\u88c5'}
                  </Text>
                </Button>
              )}
              {manualDownloadUrl && (
                <Button
                  variant="Secondary"
                  fill="Soft"
                  size="300"
                  radii="300"
                  onClick={() => {
                    void openDesktopUpdateDownloadUrl(manualDownloadUrl);
                  }}
                >
                  <Text size="B300">{'\u624b\u52a8\u4e0b\u8f7d'}</Text>
                </Button>
              )}
            </Box>
          }
        />
        <SettingTile
          title={'\u66f4\u65b0\u8bf4\u660e'}
          description={
            releaseNotesVersionLabel ? `\u6700\u65b0 release ${releaseNotesVersionLabel}` : undefined
          }
        >
          <ReleaseNotes
            body={releaseNotesBody}
            emptyText={
              checking || !lastCheckedAt
                ? '\u6b63\u5728\u83b7\u53d6\u6700\u65b0 release \u66f4\u65b0\u8bf4\u660e...'
                : '\u6682\u65e0\u66f4\u65b0\u8bf4\u660e\u3002'
            }
          />
        </SettingTile>
      </SequenceCard>
    </Box>
  );
}
