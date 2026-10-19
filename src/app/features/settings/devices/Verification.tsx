import { requestIOSDeviceVerification, iosVerificationError } from '../../../utils/iosVerification';
import { isNativeApp } from '../../../utils/nativePlatform';
import React, { MouseEventHandler, useCallback, useState, useRef, useEffect } from 'react';
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
        <Text size="L400">{otherUnverifiedCount} 个其他设备未验证</Text>
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
            选择另一台设备发起验证，或使用恢复密钥。{' '}
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
                {isNativeApp() ? '恢复密钥／口令' : '手动验证'}
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
  const [open, setOpen] = useState(false);

  return (
    <>
      <InfoCard
        variant="Surface"
        title="恢复密钥"
        description="输入恢复密钥或恢复口令，重新连接加密备份并恢复历史消息密钥。"
        after={
          !open && (
            <Button
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              outlined
              onClick={() => setOpen(true)}
            >
              <Text as="span" size="B300">
                输入恢复密钥
              </Text>
            </Button>
          )
        }
      />
      {open && (
        <ManualVerificationTile
          secretStorageKeyId={secretStorageKeyId}
          secretStorageKeyContent={secretStorageKeyContent}
          title="连接加密备份"
          description="请输入恢复密钥；如果账户使用恢复口令，也可以在右侧切换。"
          options={
            <Chip
              type="button"
              variant="Secondary"
              fill="Soft"
              radii="Pill"
              onClick={() => setOpen(false)}
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
      const requestPromise = requestIOSDeviceVerification(mx, deviceId);
      return requestPromise;
    }, [mx, deviceId]),
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

export function AndroidOwnDeviceVerification() {
  const mx = useMatrixClient();
  const [request, setRequest] = useState<VerificationRequest>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const begin = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const crypto = mx.getCrypto();
      if (!crypto) throw new Error('加密模块尚未就绪，请稍后重试。');
      setRequest(await crypto.requestOwnUserVerification());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法发起设备验证，请检查网络后重试。');
    } finally {
      setBusy(false);
    }
  };
  return (
    <InfoCard
      variant="Warning"
      title="用另一台设备验证"
      description="打开另一台已验证、登录相同账号的设备并接受请求，即可扫码或对比表情／数字。没有其他设备时仍可使用恢复密钥。"
      after={
        <Button disabled={busy} onClick={() => void begin()}>
          <Text>{busy ? '正在发送请求…' : '扫码／表情／数字验证'}</Text>
        </Button>
      }
    >
      {error && <Text role="alert">{error}</Text>}
      {request && <DeviceVerification request={request} onExit={() => setRequest(undefined)} />}
    </InfoCard>
  );
}

export function IOSOwnDeviceVerification() {
  const mx = useMatrixClient();
  const [devices, setDevices] = useState<{ device_id: string; display_name?: string }[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [request, setRequest] = useState<VerificationRequest>();
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await mx.getDevices();
      if (alive.current)
        setDevices(response.devices.filter((device) => device.device_id !== mx.getDeviceId()));
    } catch (reason) {
      if (alive.current) setError(iosVerificationError(reason));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const begin = async (deviceId: string) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await requestIOSDeviceVerification(mx, deviceId);
      if (alive.current) setRequest(next);
      else await next.cancel().catch(() => undefined);
    } catch (reason) {
      if (alive.current) setError(iosVerificationError(reason));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <InfoCard
      variant="Warning"
      title="用另一台设备验证"
      description="先选择登录同一账号的另一台已验证设备，再在该设备接受请求并扫码或对比表情／数字。"
      after={
        <Button disabled={busy} onClick={() => void load()}>
          <Text>{busy ? '正在连接…' : devices ? '刷新设备列表' : '选择另一台设备验证'}</Text>
        </Button>
      }
    >
      {error && (
        <Text
          role="alert"
          style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text' }}
        >
          {error}
        </Text>
      )}
      {devices?.length === 0 && (
        <Text>没有找到其他登录设备。请保持原来已验证的 Element 设备登录后刷新列表。</Text>
      )}
      {devices?.map((device) => (
        <Button key={device.device_id} disabled={busy} onClick={() => void begin(device.device_id)}>
          <Text>
            {device.display_name || '未命名设备'} · {device.device_id}
          </Text>
        </Button>
      ))}
      {request && <DeviceVerification request={request} onExit={() => setRequest(undefined)} />}
    </InfoCard>
  );
}
