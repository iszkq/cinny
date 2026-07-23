import FocusTrap from 'focus-trap-react';
import React, { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  Icon,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  toRem,
} from 'folds';
import { APP_VERSION } from '../constants/branding';
import { installAndroidUpdate, type PendingAndroidUpdate } from '../utils/androidUpdater';
import { normalizeDesktopUpdateVersion } from '../utils/desktopUpdater';
import { stopPropagation } from '../utils/keyboard';
import { ReleaseNotes } from './ReleaseNotes';

const STARFIRE_DOWNLOAD_PAGE_URL = 'https://chat.221819.best/download/';

type AndroidUpdatePromptProps = {
  update?: PendingAndroidUpdate;
  requestClose: () => void;
};

export function AndroidUpdatePrompt({ update, requestClose }: AndroidUpdatePromptProps) {
  const [installing, setInstalling] = useState(false);
  const [installFailed, setInstallFailed] = useState(false);
  const [message, setMessage] = useState<string>();

  if (!update) return null;

  const handleInstall = () => {
    if (installing) return;

    setInstalling(true);
    setInstallFailed(false);
    setMessage('正在下载正式安装包，完成后会打开 Android 系统安装界面。');
    installAndroidUpdate(update)
      .then(() => {
        setMessage('安装界面已打开，请按系统提示完成覆盖更新。');
      })
      .catch((error) => {
        setInstallFailed(true);
        setMessage(error instanceof Error ? error.message : '更新失败，请稍后重试。');
      })
      .finally(() => {
        setInstalling(false);
      });
  };

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <Box
          style={{ width: '100%', paddingInline: toRem(12), boxSizing: 'border-box' }}
          justifyContent="Center"
        >
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              clickOutsideDeactivates: !installing,
              onDeactivate: requestClose,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Dialog
              variant="Background"
              style={{
                width: '100%',
                maxWidth: '34rem',
                maxHeight: 'min(86vh, 42rem)',
                overflow: 'hidden',
              }}
            >
              <Box direction="Column" style={{ maxHeight: 'min(86vh, 42rem)', minHeight: 0 }}>
                <Box
                  direction="Column"
                  gap="400"
                  style={{
                    padding: toRem(20),
                    paddingBottom: toRem(12),
                    overflowY: 'auto',
                    minHeight: 0,
                  }}
                >
                  <Box direction="Column" gap="100">
                    <Text size="H4">发现 Android 新版本</Text>
                    <Text size="T300" priority="300">
                      {`v${APP_VERSION} → v${normalizeDesktopUpdateVersion(update.version)}`}
                    </Text>
                  </Box>
                  <ReleaseNotes body={update.body} emptyText="本次版本包含体验优化与问题修复。" />
                  <Text size="T200" priority="300">
                    安装包托管于 GitHub；部分网络可能下载较慢或失败，可开启代理后重试。
                  </Text>
                  {message && <Text size="T300">{message}</Text>}
                </Box>
                <Box
                  shrink="No"
                  gap="200"
                  wrap="Wrap"
                  justifyContent="End"
                  style={{ padding: `${toRem(12)} ${toRem(20)} ${toRem(20)}` }}
                >
                  <Button
                    variant="Secondary"
                    fill="Soft"
                    size="300"
                    radii="300"
                    onClick={requestClose}
                    disabled={installing}
                  >
                    <Text size="B300">稍后</Text>
                  </Button>
                  {installFailed && (
                    <Button
                      as="a"
                      href={STARFIRE_DOWNLOAD_PAGE_URL}
                      target="_blank"
                      rel="noreferrer noopener"
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      radii="300"
                      before={<Icon src={Icons.Download} size="100" />}
                    >
                      <Text size="B300">前往下载页</Text>
                    </Button>
                  )}
                  <Button
                    variant="Primary"
                    size="300"
                    radii="300"
                    onClick={handleInstall}
                    disabled={installing}
                    before={
                      installing ? <Spinner size="100" fill="Solid" variant="Primary" /> : undefined
                    }
                  >
                    <Text size="B300">{installing ? '下载中...' : '下载并安装'}</Text>
                  </Button>
                </Box>
              </Box>
            </Dialog>
          </FocusTrap>
        </Box>
      </OverlayCenter>
    </Overlay>
  );
}
