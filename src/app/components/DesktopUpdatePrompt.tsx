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
    autoInstallAvailable,
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
  const manualDownloadUrl = pendingUpdate.downloadUrl ?? pendingUpdate.releasePageUrl;
  const manualActionLabel = pendingUpdate.downloadUrl
    ? '\u624b\u52a8\u4e0b\u8f7d'
    : '\u6253\u5f00\u53d1\u5e03\u9875';
  const versionLabel = formatVersionLabel(pendingUpdate.version);
  const canAutoInstall = Boolean(autoInstallAvailable);
  let promptText = `\u53d1\u73b0\u65b0\u7248\u672c ${versionLabel}\uff0c\u53ef\u4ee5\u76f4\u63a5\u4e0b\u8f7d\u5b89\u88c5\u3002`;

  if (status === 'downloading') {
    promptText = progressText ?? message;
  } else if (status === 'error' || status === 'installed') {
    promptText = message;
  } else if (!canAutoInstall) {
    promptText = pendingUpdate.downloadUrl
      ? `\u53d1\u73b0\u65b0\u7248\u672c ${versionLabel}\uff0c\u81ea\u52a8\u5b89\u88c5\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u53ef\u4ee5\u5148\u624b\u52a8\u4e0b\u8f7d\u5b89\u88c5\u3002`
      : `\u53d1\u73b0\u65b0\u7248\u672c ${versionLabel}\uff0c\u4f46\u5f53\u524d Release \u8fd8\u6ca1\u6709\u9644\u5e26\u5b89\u88c5\u5305\uff0c\u53ef\u4ee5\u5148\u6253\u5f00\u53d1\u5e03\u9875\u624b\u52a8\u5904\u7406\u3002`;
  }

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
                    {`${formatVersionLabel(APP_VERSION)} -> ${formatVersionLabel(
                      pendingUpdate.version
                    )}`}
                  </Text>
                </Box>

                <Text size="T300">{promptText}</Text>

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
                  {canAutoInstall && (
                    <Button
                      variant="Primary"
                      size="300"
                      radii="300"
                      onClick={() => {
                        downloadAndInstall().catch(() => undefined);
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
                  )}
                  {manualDownloadUrl && (
                    <Button
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      radii="300"
                      onClick={() => {
                        openDesktopUpdateDownloadUrl(manualDownloadUrl).catch(() => undefined);
                      }}
                    >
                      <Text size="B300">{manualActionLabel}</Text>
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
