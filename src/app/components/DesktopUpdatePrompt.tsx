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
import { stopPropagation } from '../utils/keyboard';
import { ReleaseNotes } from './ReleaseNotes';

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
          <Dialog variant="Background">
            <Box
              direction="Column"
              gap="400"
              style={{
                width: 'min(100vw - 2rem, 42rem)',
                maxHeight: 'min(80vh, 42rem)',
                padding: toRem(20),
              }}
            >
              <Box direction="Column" gap="100">
                <Text size="H4">{'\u53d1\u73b0\u65b0\u7248\u672c'}</Text>
                <Text size="T300" priority="300">
                  {`${formatVersionLabel(APP_VERSION)} -> ${formatVersionLabel(pendingUpdate.version)}`}
                </Text>
              </Box>

              <Text size="T300">{progressText ?? message}</Text>

              <Box
                direction="Column"
                gap="200"
                style={{
                  maxHeight: toRem(280),
                  overflowY: 'auto',
                  paddingRight: toRem(4),
                }}
              >
                <ReleaseNotes body={pendingUpdate.body} />
              </Box>

              <Box justifyContent="End" gap="200" wrap="Wrap">
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
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
