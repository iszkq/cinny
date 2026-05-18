import React from 'react';
import { Box } from 'folds';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { getFallbackSession } from '../../state/sessions';
import { usePinLockSnapshot } from '../../hooks/usePinLockSnapshot';
import { clearScreenLock, isAccountScreenLocked } from '../../utils/pinLock';
import { SplashScreen } from '../splash-screen';
import { AccountPinDialog } from './AccountPinDialog';

export function ScreenPinLockOverlay() {
  const mx = useMatrixClient();
  const session = getFallbackSession();
  const { screenLockState } = usePinLockSnapshot();

  const userId = mx.getUserId();
  const baseUrl = session?.baseUrl;

  if (!userId || !baseUrl || !screenLockState.locked) {
    return null;
  }

  if (!isAccountScreenLocked(baseUrl, userId)) {
    return null;
  }

  return (
    <Box
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
      }}
    >
      <SplashScreen>
        <div />
      </SplashScreen>
      <AccountPinDialog
        baseUrl={baseUrl}
        userId={userId}
        title="已锁定"
        description="当前账号已被锁定，输入 PIN 码后才能继续查看内容。"
        submitLabel="解锁"
        onSuccess={() => clearScreenLock()}
      />
    </Box>
  );
}
