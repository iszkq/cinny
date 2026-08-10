import React, { MouseEventHandler, useCallback, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  config,
  Icon,
  Icons,
  Spinner,
  Text,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  IconButton,
  RectCords,
  PopOut,
  Menu,
  MenuItem,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { CryptoApi, VerificationRequest } from 'matrix-js-sdk/lib/crypto-api';
import { VerificationStatus } from '../../../hooks/useDeviceVerificationStatus';
import { InfoCard } from '../../../components/info-card';
import {
  ManualVerificationMethod,
  ManualVerificationTile,
} from '../../../components/ManualVerification';
import { SecretStorageKeyContent } from '../../../../types/matrix/accountData';
import { AsyncState, AsyncStatus, useAsync } from '../../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { DeviceVerification } from '../../../components/DeviceVerification';
import {
  DeviceVerificationReset,
  DeviceVerificationSetup,
} from '../../../components/DeviceVerificationSetup';
import { stopPropagation } from '../../../utils/keyboard';
import { useAuthMetadata } from '../../../hooks/useAuthMetadata';
import { withSearchParam } from '../../../pages/pathUtils';
import { useAccountManagementActions } from '../../../hooks/useAccountManagement';
import { openExternalUrl } from '../../../utils/desktop';
import { isDesktopUpdaterSupported } from '../../../utils/desktopUpdater';

type VerificationStatusBadgeProps = {
  verificationStatus: VerificationStatus;
  otherUnverifiedCount?: number;
};
export function VerificationStatusBadge({
  verificationStatus,
  otherUnverifiedCount,
}: VerificationStatusBadgeProps) {
  if (
    verificationStatus === VerificationStatus.Unknown ||
    typeof otherUnverifiedCount !== 'number'
  ) {
    return <Spinner size="400" variant="Secondary" />;
  }
  if (verificationStatus === VerificationStatus.Unverified) {
    return (
      <Badge variant="Critical" fill="Solid" size="500">
        <Text size="L400">本机未验证</Text>
      </Badge>
    );
  }

  if (otherUnverifiedCount > 0) {
    return (
      <Box gap="200" alignItems="Center" wrap="Wrap">
        <Badge variant="Success" fill="Solid" size="500">
          <Text size="L400">本机已验证</Text>
        </Badge>
        <Badge variant="Warning" fill="Solid" size="500">
          <Text size="L400">{`${otherUnverifiedCount} 台其他设备未验证`}</Text>
        </Badge>
      </Box>
    );
  }

  return (
    <Badge variant="Success" fill="Solid" size="500">
      <Text size="L400">全部设备已验证</Text>
    </Badge>
  );
}

function LearnStartVerificationFromOtherDevice() {
  return (
    <Box direction="Column">
      <Text size="T200">
        {'\u4ece\u5176\u4ed6\u8bbe\u5907\u53d1\u8d77\u9a8c\u8bc1\u7684\u6b65\u9aa4\uff1a'}
      </Text>
      <Text as="div" size="T200">
        <ul style={{ margin: `${config.space.S100} 0` }}>
          <li>{'\u6253\u5f00\u53e6\u4e00\u53f0\u5df2\u9a8c\u8bc1\u7684\u8bbe\u5907\u3002'}</li>
          <li>
            {'\u6253\u5f00'} <i>{'\u8bbe\u7f6e'}</i>。
          </li>
          <li>
            {'\u5728'} <i>{'\u8bbe\u5907 / \u4f1a\u8bdd'}</i>{' '}
            {'\u4e2d\u627e\u5230\u8fd9\u53f0\u8bbe\u5907\u3002'}
          </li>
          <li>{'\u5f00\u59cb\u9a8c\u8bc1\u3002'}</li>
        </ul>
      </Text>
      <Text size="T200">
        {
          '\u5982\u679c\u4f60\u8fd8\u6ca1\u6709\u4efb\u4f55\u5df2\u9a8c\u8bc1\u8bbe\u5907\uff0c\u8bf7\u70b9\u51fb'
        }{' '}
        <i>{'\u201c\u624b\u52a8\u9a8c\u8bc1\u201d'}</i> {'\u6309\u94ae\u3002'}
      </Text>
    </Box>
  );
}

type VerifyCurrentDeviceTileProps = {
  secretStorageKeyId: string;
  secretStorageKeyContent: SecretStorageKeyContent;
};
export function VerifyCurrentDeviceTile({
  secretStorageKeyId,
  secretStorageKeyContent,
}: VerifyCurrentDeviceTileProps) {
  const [learnMore, setLearnMore] = useState(false);

  const [manualVerification, setManualVerification] = useState(false);
  const handleCancelVerification = () => setManualVerification(false);

  return (
    <>
      <InfoCard
        variant="Critical"
        title={'\u672a\u9a8c\u8bc1'}
        description={
          <>
            {
              '\u53ef\u4ee5\u4ece\u5176\u4ed6\u8bbe\u5907\u53d1\u8d77\u9a8c\u8bc1\uff0c\u6216\u8005\u76f4\u63a5\u624b\u52a8\u9a8c\u8bc1\u3002'
            }{' '}
            <Text as="a" size="T200" onClick={() => setLearnMore(!learnMore)}>
              <b>{learnMore ? '\u6536\u8d77' : '\u4e86\u89e3\u66f4\u591a'}</b>
            </Text>
          </>
        }
        after={
          !manualVerification && (
            <Button
              size="300"
              variant="Critical"
              fill="Soft"
              radii="300"
              outlined
              onClick={() => setManualVerification(true)}
            >
              <Text as="span" size="B300">
                {'\u624b\u52a8\u9a8c\u8bc1'}
              </Text>
            </Button>
          )
        }
      >
        {learnMore && <LearnStartVerificationFromOtherDevice />}
      </InfoCard>
      {manualVerification && (
        <ManualVerificationTile
          secretStorageKeyId={secretStorageKeyId}
          secretStorageKeyContent={secretStorageKeyContent}
          options={
            <Chip
              type="button"
              variant="Secondary"
              fill="Soft"
              radii="Pill"
              onClick={handleCancelVerification}
            >
              <Icon size="100" src={Icons.Cross} />
            </Chip>
          }
        />
      )}
    </>
  );
}

type RecoveryKeyAccessTileProps = {
  secretStorageKeyId: string;
  secretStorageKeyContent: SecretStorageKeyContent;
};
export function RecoveryKeyAccessTile({
  secretStorageKeyId,
  secretStorageKeyContent,
}: RecoveryKeyAccessTileProps) {
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  return (
    <>
      <InfoCard
        variant="Surface"
        title="恢复密钥"
        description="用于重新验证这台当前设备并恢复旧消息；不会自动验证下方列出的其他设备。"
        after={
          !recoveryOpen && (
            <Button
              size="300"
              variant="Primary"
              fill="Soft"
              radii="300"
              outlined
              onClick={() => setRecoveryOpen(true)}
            >
              <Text as="span" size="B300">
                输入恢复密钥
              </Text>
            </Button>
          )
        }
      />
      {recoveryOpen && (
        <ManualVerificationTile
          secretStorageKeyId={secretStorageKeyId}
          secretStorageKeyContent={secretStorageKeyContent}
          initialMethod={ManualVerificationMethod.RecoveryKey}
          options={
            <Chip
              type="button"
              variant="Secondary"
              fill="Soft"
              radii="Pill"
              onClick={() => setRecoveryOpen(false)}
            >
              <Icon size="100" src={Icons.Cross} />
            </Chip>
          }
        />
      )}
    </>
  );
}

type VerifyOtherDeviceTileProps = {
  crypto: CryptoApi;
  deviceId: string;
};
export function VerifyOtherDeviceTile({ crypto, deviceId }: VerifyOtherDeviceTileProps) {
  const mx = useMatrixClient();
  const [requestState, setRequestState] = useState<AsyncState<VerificationRequest, Error>>({
    status: AsyncStatus.Idle,
  });

  const requestVerification = useAsync<VerificationRequest, Error, []>(
    useCallback(() => {
      // Reuse an incoming/in-flight request for this exact device instead of
      // creating a competing SAS transaction. Two parallel transactions can
      // otherwise leave one device showing "completed" and the other one
      // showing "cancelled" after Matrix resolves the race.
      const existingRequest = crypto
        .getVerificationRequestsToDeviceInProgress(mx.getSafeUserId())
        .find((request) => request.otherDeviceId === deviceId && request.pending);
      if (existingRequest) {
        return Promise.resolve(existingRequest);
      }

      const requestPromise = crypto.requestDeviceVerification(mx.getSafeUserId(), deviceId);
      return requestPromise;
    }, [mx, crypto, deviceId]),
    setRequestState
  );

  const handleExit = useCallback(() => {
    setRequestState({
      status: AsyncStatus.Idle,
    });
  }, []);

  const requesting = requestState.status === AsyncStatus.Loading;
  return (
    <InfoCard
      variant="Warning"
      title={'\u672a\u9a8c\u8bc1'}
      description={
        '\u9a8c\u8bc1\u8bbe\u5907\u8eab\u4efd\uff0c\u5e76\u6388\u4e88\u52a0\u5bc6\u6d88\u606f\u7684\u8bbf\u95ee\u6743\u9650\u3002'
      }
      after={
        <Button
          size="300"
          variant="Warning"
          radii="300"
          onClick={requestVerification}
          before={requesting && <Spinner size="100" variant="Warning" fill="Solid" />}
          disabled={requesting}
        >
          <Text as="span" size="B300">
            {'\u9a8c\u8bc1'}
          </Text>
        </Button>
      }
    >
      {requestState.status === AsyncStatus.Error && (
        <Text size="T200">{requestState.error.message}</Text>
      )}
      {requestState.status === AsyncStatus.Success && (
        <DeviceVerification request={requestState.data} onExit={handleExit} />
      )}
    </InfoCard>
  );
}

type EnableVerificationProps = {
  visible: boolean;
};
export function EnableVerification({ visible }: EnableVerificationProps) {
  const [open, setOpen] = useState(false);

  const handleCancel = useCallback(() => setOpen(false), []);

  return (
    <>
      {visible && (
        <Button size="300" radii="300" onClick={() => setOpen(true)}>
          <Text as="span" size="B300">
            {'\u542f\u7528'}
          </Text>
        </Button>
      )}
      {open && (
        <Overlay open backdrop={<OverlayBackdrop />}>
          <OverlayCenter>
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                clickOutsideDeactivates: false,
                escapeDeactivates: false,
              }}
            >
              <DeviceVerificationSetup onCancel={handleCancel} />
            </FocusTrap>
          </OverlayCenter>
        </Overlay>
      )}
    </>
  );
}

export function DeviceVerificationOptions() {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const authMetadata = useAuthMetadata();
  const accountManagementActions = useAccountManagementActions();

  const [reset, setReset] = useState(false);

  const openManagementUrl = useCallback((url: string) => {
    if (isDesktopUpdaterSupported()) {
      void openExternalUrl(url);
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const handleCancelReset = useCallback(() => {
    setReset(false);
  }, []);

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (event) => {
    setMenuCords(event.currentTarget.getBoundingClientRect());
  };

  const handleReset = () => {
    setMenuCords(undefined);

    if (authMetadata) {
      const authUrl = authMetadata.account_management_uri ?? authMetadata.issuer;
      openManagementUrl(
        withSearchParam(authUrl, {
          action: accountManagementActions.crossSigningReset,
        })
      );
      return;
    }

    setReset(true);
  };

  return (
    <>
      <IconButton
        aria-pressed={!!menuCords}
        variant="SurfaceVariant"
        size="300"
        radii="300"
        onClick={handleMenu}
      >
        <Icon size="100" src={Icons.VerticalDots} />
      </IconButton>
      <PopOut
        anchor={menuCords}
        offset={5}
        position="Bottom"
        align="Center"
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setMenuCords(undefined),
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
              isKeyBackward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                <MenuItem
                  variant="Critical"
                  onClick={handleReset}
                  size="300"
                  radii="300"
                  fill="None"
                >
                  <Text as="span" size="T300" truncate>
                    {'\u91cd\u7f6e'}
                  </Text>
                </MenuItem>
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
      {reset && (
        <Overlay open backdrop={<OverlayBackdrop />}>
          <OverlayCenter>
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                clickOutsideDeactivates: false,
                escapeDeactivates: false,
              }}
            >
              <DeviceVerificationReset onCancel={handleCancelReset} />
            </FocusTrap>
          </OverlayCenter>
        </Overlay>
      )}
    </>
  );
}
