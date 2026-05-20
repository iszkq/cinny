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
          title="\u9a8c\u8bc1 PIN \u5e76\u8fdb\u5165"
          description="\u8fd9\u4e2a\u8d26\u53f7\u5df2\u542f\u7528 PIN \u4fdd\u62a4\u3002\u8f93\u5165\u4f60\u5df2\u7ecf\u8bbe\u7f6e\u7684 PIN \u7801\u540e\uff0c\u624d\u80fd\u7ee7\u7eed\u8fdb\u5165\u5f53\u524d\u8d26\u53f7\u3002"
          accountLabel={accountLabel}
          eyebrow="\u8d26\u53f7\u7ea7 PIN \u9a8c\u8bc1"
        >
          <AccountPinForm
            baseUrl={baseUrl}
            userId={userId}
            submitLabel="\u9a8c\u8bc1\u5e76\u8fdb\u5165"
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
        title="\u4e3a\u8fd9\u53f0\u8bbe\u5907\u8bbe\u7f6e PIN"
        description="\u8fd9\u4e2a\u8d26\u53f7\u5df2\u7ecf\u5f00\u542f PIN \u4fdd\u62a4\u3002\u7ee7\u7eed\u67e5\u770b\u6d88\u606f\u524d\uff0c\u9700\u8981\u5148\u4e3a\u5f53\u524d\u8bbe\u5907\u521b\u5efa\u4e00\u4e2a\u672c\u5730 PIN\u3002"
        accountLabel={accountLabel}
        eyebrow="\u8d26\u53f7\u7ea7 PIN \u7b56\u7565"
      >
        <LocalPinSetupForm
          baseUrl={baseUrl}
          userId={userId}
          submitLabel="\u542f\u7528\u5e76\u8fdb\u5165"
          onSuccess={() => undefined}
          autoFocus
        />
      </ScreenPinLockPage>
    );
  }

  if (screenLockState.locked && isAccountScreenLocked(baseUrl, userId)) {
    return (
      <ScreenPinLockPage
        title="\u5df2\u9501\u5b9a"
        description="\u5f53\u524d\u8d26\u53f7\u5df2\u7ecf\u9501\u5b9a\u3002\u8f93\u5165 PIN \u7801\u540e\uff0c\u624d\u80fd\u7ee7\u7eed\u67e5\u770b\u804a\u5929\u5185\u5bb9\u3002"
        accountLabel={accountLabel}
        eyebrow="\u9501\u5c4f\u4fdd\u62a4"
      >
        <AccountPinForm
          baseUrl={baseUrl}
          userId={userId}
          submitLabel="\u89e3\u9501"
          onSuccess={() => clearScreenLock()}
          autoFocus
        />
      </ScreenPinLockPage>
    );
  }

  return <>{children}</>;
}

export const ScreenPinLockOverlay = ScreenPinLockGate;
