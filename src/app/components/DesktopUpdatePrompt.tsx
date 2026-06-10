import FocusTrap from 'focus-trap-react';
import React from 'react';
import {
  Box,
  Button,
  Dialog,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  toRem,
} from 'folds';
import { APP_VERSION } from '../constants/branding';
import { useDesktopUpdater } from '../hooks/useDesktopUpdater';
import { openDesktopUpdateDownloadUrl } from '../utils/desktopUpdater';
import { stopPropagation } from '../utils/keyboard';
import { ReleaseNotes } from './ReleaseNotes';

const updateDialogStyle = {
  width: 'calc(100vw - 1.5rem)',
  maxWidth: toRem(560),
  maxHeight: 'calc(100vh - 1.5rem)',
  minWidth: 0,
  boxSizing: 'border-box' as const,
  overflow: 'hidden' as const,
};

const updateDialogContentStyle = {
  width: '100%',
  minWidth: 0,
  maxHeight: 'calc(100vh - 1.5rem)',
  padding: toRem(20),
  boxSizing: 'border-box' as const,
  overflow: 'hidden' as const,
};

const updateNotesStyle = {
  flex: '1 1 auto',
  minHeight: toRem(96),
  maxHeight: 'min(36vh, 14rem)',
  overflowY: 'auto' as const,
  overflowX: 'hidden' as const,
  paddingRight: toRem(6),
};

type DesktopUpdatePromptProps = {
  open: boolean;
  requestClose: () => void;
};

export function DesktopUpdatePrompt({ open, requestClose }: DesktopUpdatePromptProps) {
  const {
    pendingUpdate,
    status,
    message,
    progressText,
    downloadAndInstall,
    formatVersionLabel,
  } = useDesktopUpdater();

  if (!open || !pendingUpdate) {
    return null;
  }

  const downloading = status === 'downloading';
  const manualDownloadUrl = pendingUpdate.downloadUrl;

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: true,
            onDeactivate: requestClose,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Background" style={updateDialogStyle}>
            <Box
              direction="Column"
              gap="400"
              style={updateDialogContentStyle}
            >
              <Box direction="Column" gap="100" shrink="No">
                <Text size="H4">{'\u53d1\u73b0\u65b0\u7248\u672c'}</Text>
                <Text size="T300" priority="300">
                  {`${formatVersionLabel(APP_VERSION)} -> ${formatVersionLabel(pendingUpdate.version)}`}
                </Text>
              </Box>

              <Text size="T300" truncate>
                {progressText ?? message}
              </Text>

              <Box direction="Column" style={updateNotesStyle}>
                <ReleaseNotes compact body={pendingUpdate.body} />
              </Box>

              <Box justifyContent="End" gap="200" wrap="Wrap" shrink="No">
                <Button
                  variant="Secondary"
                  fill="Soft"
                  size="300"
                  radii="300"
                  onClick={requestClose}
                >
                  <Text size="B300">{'\u7a0d\u540e'}</Text>
                </Button>
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
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
