import { DeviceLogoutBtn } from '../../features/settings/devices/DeviceTile';
import { isDesktopUpdaterSupported } from '../../utils/desktopUpdater';
import { usePinIdleLock } from '../../hooks/usePinIdleLock';
import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import { Box, Text } from 'folds';
import { APP_DISPLAY_NAME, APP_LOGO_URL } from '../../constants/branding';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { usePinLockSnapshot } from '../../hooks/usePinLockSnapshot';
import { getFallbackSession } from '../../state/sessions';
import {
  clearScreenLock,
  consumeRecentAccountPinVerification,
  getAccountPinConfig,
  getPinIdleMinutes,
  getAccountPinKey,
  isAccountScreenLocked,
  supportsPinLock,
} from '../../utils/pinLock';
import { SplashScreen } from '../splash-screen';
import { AccountPinForm } from './AccountPinDialog';
import * as css from './style.css';

const copy = {
  entryTitle: '\u9a8c\u8bc1 PIN \u5e76\u8fdb\u5165',
  entryDescription:
    '\u5f53\u524d\u8d26\u6237\u5df2\u542f\u7528 PIN \u4fdd\u62a4\u3002\u8f93\u5165\u4f60\u5df2\u7ecf\u8bbe\u7f6e\u7684 PIN \u7801\u540e\uff0c\u624d\u80fd\u7ee7\u7eed\u8fdb\u5165\u5f53\u524d\u8d26\u6237\u3002',
  entryEyebrow: '\u8d26\u6237\u7ea7 PIN \u9a8c\u8bc1',
  fallbackEntryEyebrow: 'PIN \u9a8c\u8bc1',
  entryButton: '\u9a8c\u8bc1\u5e76\u8fdb\u5165',
  lockTitle: '\u5df2\u9501\u5b9a',
  lockDescription:
    '\u5f53\u524d\u8d26\u6237\u5df2\u7ecf\u9501\u5b9a\u3002\u8f93\u5165 PIN \u7801\u540e\uff0c\u624d\u80fd\u7ee7\u7eed\u67e5\u770b\u804a\u5929\u5185\u5bb9\u3002',
  lockEyebrow: '\u9501\u5c4f\u4fdd\u62a4',
  unlockButton: '\u89e3\u9501',
} as const;

type ScreenPinLockGateProps = {
  children: ReactNode;
};

type ScreenPinLockPageProps = {
  title: string;
  description: string;
  eyebrow: string;
  children: ReactNode;
};

function ScreenPinLockPage({ title, description, eyebrow, children }: ScreenPinLockPageProps) {
  return (
    <SplashScreen>
      <Box className={css.ScreenShell} grow="Yes" alignItems="Center" justifyContent="Center">
        <Box className={css.ScreenCard} direction="Column" gap="500">
          <Box direction="Column" gap="300">
            <Box gap="300" alignItems="Center">
              <img className={css.BrandLogo} src={APP_LOGO_URL} alt={`${APP_DISPLAY_NAME} logo`} />
              <Box direction="Column" gap="100">
                <Text size="L400">{APP_DISPLAY_NAME}</Text>
                <Text className={css.Eyebrow} as="span">
                  {eyebrow}
                </Text>
              </Box>
            </Box>
            <Box direction="Column" gap="100">
              <Text size="H3">{title}</Text>
              <Text size="T300" priority="300">
                {description}
              </Text>
            </Box>
          </Box>
          {children}
          <Text size="T200">
            忘记 PIN？退出后重新登录，即可重新设置本机
            PIN。加密设备验证仍需另一台已验证设备或恢复密钥；未备份的本机加密密钥可能随退出丢失。
          </Text>
          <DeviceLogoutBtn />
        </Box>
      </Box>
    </SplashScreen>
  );
}

export function ScreenPinLockGate({ children }: ScreenPinLockGateProps) {
  const mx = useMatrixClient();
  const session = getFallbackSession();
  const { screenLockState } = usePinLockSnapshot();

  const userId = mx.getUserId();
  const baseUrl = session?.baseUrl;
  const pinLockSupported = supportsPinLock();
  const [verifiedAccountKey, setVerifiedAccountKey] = useState<string | undefined>(() => {
    if (!baseUrl || !userId) {
      return undefined;
    }

    return consumeRecentAccountPinVerification(baseUrl, userId)
      ? getAccountPinKey(baseUrl, userId)
      : undefined;
  });

  const accountKey = baseUrl && userId ? getAccountPinKey(baseUrl, userId) : undefined;
  const localPinConfig = baseUrl && userId ? getAccountPinConfig(baseUrl, userId) : undefined;

  const privacyLocked =
    pinLockSupported &&
    Boolean(localPinConfig) &&
    (verifiedAccountKey !== accountKey ||
      Boolean(baseUrl && userId && isAccountScreenLocked(baseUrl, userId)));
  useEffect(() => {
    if (isDesktopUpdaterSupported()) {
      void import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('set_pin_window_privacy', { locked: privacyLocked }))
        .catch(() => undefined);
    }
  }, [privacyLocked]);

  const handleVerifySuccess = useCallback(() => {
    if (!accountKey || !baseUrl || !userId) return;

    setVerifiedAccountKey(accountKey);
    clearScreenLock();
  }, [accountKey, baseUrl, userId]);

  usePinIdleLock(
    baseUrl,
    userId,
    Boolean(
      pinLockSupported &&
        localPinConfig &&
        verifiedAccountKey === accountKey &&
        !screenLockState.locked
    ),
    baseUrl && userId ? getPinIdleMinutes(baseUrl, userId) : 5
  );

  if (!pinLockSupported || !userId || !baseUrl || !accountKey) {
    return children;
  }

  const activePinConfig = localPinConfig;
  const manuallyLocked =
    Boolean(activePinConfig) && screenLockState.locked && isAccountScreenLocked(baseUrl, userId);
  const entryVerificationRequired =
    Boolean(activePinConfig) && verifiedAccountKey !== accountKey && !manuallyLocked;

  if (entryVerificationRequired && activePinConfig) {
    return (
      <ScreenPinLockPage
        title={copy.entryTitle}
        description={copy.entryDescription}
        eyebrow={copy.fallbackEntryEyebrow}
      >
        <AccountPinForm
          baseUrl={baseUrl}
          userId={userId}
          submitLabel={copy.entryButton}
          pinConfig={activePinConfig}
          onSuccess={handleVerifySuccess}
          autoFocus
        />
      </ScreenPinLockPage>
    );
  }

  if (manuallyLocked && activePinConfig) {
    return (
      <ScreenPinLockPage
        title={copy.lockTitle}
        description={copy.lockDescription}
        eyebrow={copy.lockEyebrow}
      >
        <AccountPinForm
          baseUrl={baseUrl}
          userId={userId}
          submitLabel={copy.unlockButton}
          pinConfig={activePinConfig}
          onSuccess={handleVerifySuccess}
          autoFocus
        />
      </ScreenPinLockPage>
    );
  }

  return children;
}

export const ScreenPinLockOverlay = ScreenPinLockGate;
