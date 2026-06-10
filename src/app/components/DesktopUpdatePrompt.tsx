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

type DesktopUpdatePromptProps = {
  open: boolean;
  requestClose: () => void;
};

const dialogStyle = {
  width: '100%',
  maxWidth: '34rem',
  maxHeight: 'min(86vh, 42rem)',
  minWidth: 0,
  boxSizing: 'border-box' as const,
  overflow: 'hidden' as const,
};

const dialogViewportStyle = {
  width: '100%',
  paddingInline: toRem(12),
  boxSizing: 'border-box' as const,
  display: 'flex',
  justifyContent: 'center' as const,
};

const actionsStyle = {
  width: '100%',
  minWidth: 0,
  display: 'flex',
  flexWrap: 'wrap' as const,
  justifyContent: 'flex-end' as const,
  gap: toRem(8),
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
  const versionLabel = formatVersionLabel(pendingUpdate.version);
  const promptText =
    status === 'downloading'
      ? progressText ?? message
      : status === 'error' || status === 'installed'
      ? message
      : `\u53d1\u73b0\u65b0\u7248\u672c ${versionLabel}\uff0c\u53ef\u4ee5\u76f4\u63a5\u4e0b\u8f7d\u5b89\u88c5\u3002`;

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <Box style={dialogViewportStyle}>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              clickOutsideDeactivates: true,
              onDeactivate: requestClose,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Dialog variant="Background" style={dialogStyle}>
              <Box
                direction="Column"
                gap="400"
                style={{
                  padding: toRem(20),
                  minWidth: 0,
                  boxSizing: 'border-box',
                  overflowX: 'hidden',
                  overflowY: 'auto',
                }}
              >
                <Box direction="Column" gap="100" shrink="No">
                  <Text size="H4">{'\u53d1\u73b0\u65b0\u7248\u672c'}</Text>
                  <Text size="T300" priority="300">
                    {`${formatVersionLabel(APP_VERSION)} -> ${formatVersionLabel(pendingUpdate.version)}`}
                  </Text>
                </Box>

                <Text size="T300">
                  {promptText}
                </Text>

                <div style={actionsStyle}>
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
                      {downloading ? '\u5b89\u88c5\u4e2d...' : '\u4e0b\u8f7d\u5b89\u88c5'}
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
                </div>
              </Box>
            </Dialog>
          </FocusTrap>
        </Box>
      </OverlayCenter>
    </Overlay>
  );
}
