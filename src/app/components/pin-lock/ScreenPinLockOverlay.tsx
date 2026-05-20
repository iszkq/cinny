import React, { ReactNode } from 'react';
import { Box, Text } from 'folds';
import { APP_DISPLAY_NAME, APP_LOGO_URL } from '../../constants/branding';
import { useAccountData } from '../../hooks/useAccountData';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { usePinLockSnapshot } from '../../hooks/usePinLockSnapshot';
import { getFallbackSession } from '../../state/sessions';
import {
  cacheAccountPinConfig,
  clearScreenLock,
  getAccountPinLabel,
  getAccountPinPolicyConfig,
  hasAccountPin,
  isAccountPinPolicyEnabled,
  isAccountScreenLocked,
  isDesktopPinLockSupported,
} from '../../utils/pinLock';
import { AccountDataEvent, CinnyAccountPinPolicyContent } from '../../../types/matrix/accountData';
import { SplashScreen } from '../splash-screen';
import { AccountPinForm } from './AccountPinDialog';
import { LocalPinSetupForm } from './LocalPinSetupDialog';
import * as css from './style.css';

type ScreenPinLockGateProps = {
  children: ReactNode;
};

type ScreenPinLockPageProps = {
  title: string;
  description: string;
  accountLabel: string;
  eyebrow: string;
  children: ReactNode;
};

function ScreenPinLockPage({
  title,
  description,
  accountLabel,
  eyebrow,
  children,
}: ScreenPinLockPageProps) {
  return (
    <SplashScreen>
      <Box className={css.ScreenShell} grow="Yes" alignItems="Center" justifyContent="Center">
        <Box className={css.ScreenCard} direction="Column" gap="500">
          <Box direction="Column" gap="300">
            <Box gap="300" alignItems="Center">
              <img className={css.BrandLogo} src={APP_LOGO_URL} alt={`${APP_DISPLAY_NAME} logo`} />
              <Box direction="Column" gap="50">
                <Text size="L400">{APP_DISPLAY_NAME}</Text>
                <Text className={css.Eyebrow} as="span">
                  {eyebrow}
                </Text>
              </Box>
            </Box>
            <Box direction="Column" gap="150">
              <Text size="H3">{title}</Text>
              <Text size="T300" priority="300">
                {description}
              </Text>
              <Text className={css.AccountLabel} size="T200" priority="400">
                {accountLabel}
              </Text>
            </Box>
          </Box>
          {children}
        </Box>
      </Box>
    </SplashScreen>
  );
}

export function ScreenPinLockGate({ children }: ScreenPinLockGateProps) {
  const mx = useMatrixClient();
  const session = getFallbackSession();
  const policyEvent = useAccountData(AccountDataEvent.CinnyAccountPinPolicy);
  const { screenLockState } = usePinLockSnapshot();

  const userId = mx.getUserId();
  const baseUrl = session?.baseUrl;

  if (!isDesktopPinLockSupported() || !userId || !baseUrl) {
    return <>{children}</>;
  }

  const accountLabel = getAccountPinLabel(baseUrl, userId);
  const localPinEnabled = hasAccountPin(baseUrl, userId);
  const policyContent = policyEvent?.getContent<CinnyAccountPinPolicyContent>();
  const policyEnabled = isAccountPinPolicyEnabled(policyContent);
  const remotePinConfig = getAccountPinPolicyConfig(policyContent);

  if (policyEnabled && !localPinEnabled) {
    if (remotePinConfig) {
      return (
        <ScreenPinLockPage
          title="验证 PIN 并进入"
          description="这个账号已启用 PIN 保护。输入你已经设置的 PIN 码后，才能继续进入当前账号。"
          accountLabel={accountLabel}
          eyebrow="账号级 PIN 验证"
        >
          <AccountPinForm
            baseUrl={baseUrl}
            userId={userId}
            submitLabel="验证并进入"
            pinConfig={remotePinConfig}
            onSuccess={() => {
              cacheAccountPinConfig(baseUrl, userId, remotePinConfig);
              clearScreenLock();
            }}
            autoFocus
          />
        </ScreenPinLockPage>
      );
    }

    return (
      <ScreenPinLockPage
        title="为这台设备设置 PIN"
        description="这个账号已经开启 PIN 保护。继续查看消息前，需要先为当前设备创建一个本地 PIN。"
        accountLabel={accountLabel}
        eyebrow="账号级 PIN 策略"
      >
        <LocalPinSetupForm
          baseUrl={baseUrl}
          userId={userId}
          submitLabel="启用并进入"
          onSuccess={() => undefined}
          autoFocus
        />
      </ScreenPinLockPage>
    );
  }

  if (screenLockState.locked && isAccountScreenLocked(baseUrl, userId)) {
    return (
      <ScreenPinLockPage
        title="已锁定"
        description="当前账号已经锁定。输入 PIN 码后，才能继续查看聊天内容。"
        accountLabel={accountLabel}
        eyebrow="锁屏保护"
      >
        <AccountPinForm
          baseUrl={baseUrl}
          userId={userId}
          submitLabel="解锁"
          onSuccess={() => clearScreenLock()}
          autoFocus
        />
      </ScreenPinLockPage>
    );
  }

  return <>{children}</>;
}

export const ScreenPinLockOverlay = ScreenPinLockGate;
