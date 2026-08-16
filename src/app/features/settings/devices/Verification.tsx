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
import { ManualVerificationTile } from '../../../components/ManualVerification';
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
        <Text size="L400">未验证</Text>
      </Badge>
    );
  }

  if (otherUnverifiedCount > 0) {
    return (
      <Badge variant="Warning" fill="Solid" size="500">
        <Text size="L400">{otherUnverifiedCount} 个未验证</Text>
      </Badge>
    );
  }

  return (
    <Badge variant="Success" fill="Solid" size="500">
      <Text size="L400">已验证</Text>
    </Badge>
  );
}

function LearnStartVerificationFromOtherDevice() {
  return (
    <Box direction="Column">
      <Text size="T200">从其他设备发起验证的步骤：</Text>
      <Text as="div" size="T200">
        <ul style={{ margin: `${config.space.S100} 0` }}>
          <li>打开另一台已经验证的设备。</li>
          <li>
            打开<i>设置</i>。
          </li>
          <li>
            在<i>设备/会话</i>中找到当前设备。
          </li>
          <li>发起设备验证。</li>
        </ul>
      </Text>
      <Text size="T200">
        如果没有其他已验证设备，请点击<i>“手动验证”</i>。
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
        title="未验证"
        description={
          <>
            请从其他设备发起验证，或使用恢复密钥手动验证。{' '}
            <Text as="a" size="T200" onClick={() => setLearnMore(!learnMore)}>
              <b>{learnMore ? '收起说明' : '了解更多'}</b>
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
                手动验证
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
      title="未验证"
      description="验证设备身份，并允许该设备访问加密消息。"
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
            验证
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
            启用
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
      void openExternalUrl(
        withSearchParam(authUrl, {
          action: accountManagementActions.crossSigningReset,
        })
      ).catch(() => undefined);
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
                    重置
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
