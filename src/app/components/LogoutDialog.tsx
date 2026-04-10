import React, { forwardRef, useCallback } from 'react';
import { Dialog, Header, config, Box, Text, Button, Spinner, color } from 'folds';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { logoutClient } from '../../client/initMatrix';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { useCrossSigningActive } from '../hooks/useCrossSigning';
import { InfoCard } from './info-card';
import {
  useDeviceVerificationStatus,
  VerificationStatus,
} from '../hooks/useDeviceVerificationStatus';

type LogoutDialogProps = {
  handleClose: () => void;
};
export const LogoutDialog = forwardRef<HTMLDivElement, LogoutDialogProps>(
  ({ handleClose }, ref) => {
    const mx = useMatrixClient();
    const hasEncryptedRoom = !!mx.getRooms().find((room) => room.hasEncryptionStateEvent());
    const crossSigningActive = useCrossSigningActive();
    const verificationStatus = useDeviceVerificationStatus(
      mx.getCrypto(),
      mx.getSafeUserId(),
      mx.getDeviceId() ?? undefined
    );

    const [logoutState, logout] = useAsyncCallback<void, Error, []>(
      useCallback(async () => {
        await logoutClient(mx);
      }, [mx])
    );

    const ongoingLogout = logoutState.status === AsyncStatus.Loading;

    return (
      <Dialog variant="Surface" ref={ref}>
        <Header
          style={{
            padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
            borderBottomWidth: config.borderWidth.B300,
          }}
          variant="Surface"
          size="500"
        >
          <Box grow="Yes">
            <Text size="H4">{'\u9000\u51fa\u767b\u5f55'}</Text>
          </Box>
        </Header>
        <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
          {hasEncryptedRoom &&
            (crossSigningActive ? (
              verificationStatus === VerificationStatus.Unverified && (
                <InfoCard
                  variant="Critical"
                  title="\u8bbe\u5907\u672a\u9a8c\u8bc1"
                  description="\u8bf7\u5148\u9a8c\u8bc1\u8bbe\u5907\uff0c\u518d\u9000\u51fa\u767b\u5f55\uff0c\u4ee5\u514d\u4e22\u5931\u52a0\u5bc6\u6d88\u606f\u3002"
                />
              )
            ) : (
              <InfoCard
                variant="Critical"
                title="\u63d0\u793a"
                description="\u8bf7\u5148\u5f00\u542f\u8bbe\u5907\u9a8c\u8bc1\uff0c\u6216\u4ece\u8bbe\u7f6e\u4e2d\u5bfc\u51fa\u52a0\u5bc6\u6570\u636e\uff0c\u907f\u514d\u65e0\u6cd5\u518d\u6b21\u8bbf\u95ee\u6d88\u606f\u3002"
              />
            ))}
          <Text priority="400">{'\u4f60\u5373\u5c06\u9000\u51fa\u767b\u5f55\uff0c\u786e\u5b9a\u7ee7\u7eed\u5417\uff1f'}</Text>
          {logoutState.status === AsyncStatus.Error && (
            <Text style={{ color: color.Critical.Main }} size="T300">
              {'\u9000\u51fa\u767b\u5f55\u5931\u8d25\uff01'} {logoutState.error.message}
            </Text>
          )}
          <Box direction="Column" gap="200">
            <Button
              variant="Critical"
              onClick={logout}
              disabled={ongoingLogout}
              before={ongoingLogout && <Spinner variant="Critical" fill="Solid" size="200" />}
            >
              <Text size="B400">{'\u9000\u51fa\u767b\u5f55'}</Text>
            </Button>
            <Button variant="Secondary" fill="Soft" onClick={handleClose} disabled={ongoingLogout}>
              <Text size="B400">{'\u53d6\u6d88'}</Text>
            </Button>
          </Box>
        </Box>
      </Dialog>
    );
  }
);
