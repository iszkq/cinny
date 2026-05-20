import React, { ReactNode, useCallback, useState } from 'react';
import { Box, Text } from 'folds';
import { APP_DISPLAY_NAME, APP_LOGO_URL } from '../../constants/branding';
import { useAccountData } from '../../hooks/useAccountData';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { usePinLockSnapshot } from '../../hooks/usePinLockSnapshot';
import { getFallbackSession } from '../../state/sessions';
import {
  cacheAccountPinConfig,
  clearScreenLock,
  consumeRecentAccountPinVerification,
  getAccountPinConfig,
  getAccountPinKey,
  getAccountPinLabel,
  getAccountPinPolicyConfig,
  isAccountPinPolicyEnabled,
  isAccountScreenLocked,
  isDesktopPinLockSupported,
} from '../../utils/pinLock';
import {
  AccountDataEvent,
  CinnyAccountPinPolicyContent,
} from '../../../types/matrix/accountData';
import { SplashScreen } from '../splash-screen';
import { AccountPinForm } from './AccountPinDialog';
import * as css from './style.css';

const copy = {
  entryTitle: '\u9a8c\u8bc1 PIN \u5e76\u8fdb\u5165',
  entryDescription:
    '\u5f53\u524d\u8d26\u6237\u5df2\u542f\u7528 PIN \u4fdd\u62a4\u3002\u8f93\u5165\u4f60\u5df2\u7ecf\u8bbe\u7f6e\u7684 PIN \u7801\u540e\uff0c\u624d\u80fd\u7ee7\u7eed\u8fdb\u5165\u5f53\u524d\u8d26\u6237\u3002',
  entryEyebrow:
    '\u8d26\u6237\u7ea7 PIN \u9a8c\u8bc1',
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
  const [verifiedAccountKey, setVerifiedAccountKey] = useState<string | undefined>(() => {
    if (!baseUrl || !userId) {
      return undefined;
    }

    return consumeRecentAccountPinVerification(baseUrl, userId)
      ? getAccountPinKey(baseUrl, userId)
      : undefined;
  });

  if (!isDesktopPinLockSupported() || !userId || !baseUrl) {
    return <>{children}</>;
  }

  const accountKey = getAccountPinKey(baseUrl, userId);
  const accountLabel = getAccountPinLabel(baseUrl, userId);
  const policyContent = policyEvent?.getContent<CinnyAccountPinPolicyContent>();
  const policyEnabled = isAccountPinPolicyEnabled(policyContent);
  const remotePinConfig = getAccountPinPolicyConfig(policyContent);
  const localPinConfig = getAccountPinConfig(baseUrl, userId);
  let activePinConfig = localPinConfig;
  if (policyEvent) {
    activePinConfig = policyEnabled ? remotePinConfig ?? localPinConfig : undefined;
  }
  const manuallyLocked =
    Boolean(activePinConfig) && screenLockState.locked && isAccountScreenLocked(baseUrl, userId);
  const entryVerificationRequired =
    Boolean(activePinConfig) && verifiedAccountKey !== accountKey && !manuallyLocked;

  const handleVerifySuccess = useCallback(() => {
    if (remotePinConfig) {
      cacheAccountPinConfig(baseUrl, userId, remotePinConfig);
    }

    setVerifiedAccountKey(accountKey);
    clearScreenLock();
  }, [accountKey, baseUrl, remotePinConfig, userId]);

  if (entryVerificationRequired && activePinConfig) {
    return (
      <ScreenPinLockPage
        title={copy.entryTitle}
        description={copy.entryDescription}
        accountLabel={accountLabel}
        eyebrow={policyEnabled ? copy.entryEyebrow : copy.fallbackEntryEyebrow}
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
        accountLabel={accountLabel}
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

  return <>{children}</>;
}

export const ScreenPinLockOverlay = ScreenPinLockGate;
