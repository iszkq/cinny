import React, { useCallback, useState } from 'react';
import { Box, Button, color, config, Menu, Spinner, Text } from 'folds';
import { AuthDict, IMyDevice, MatrixError } from 'matrix-js-sdk';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { ActionUIA, ActionUIAFlowsLoader } from '../../../components/ActionUIA';
import { DeviceDeleteBtn, DeviceTile } from './DeviceTile';
import { AsyncState, AsyncStatus, useAsync } from '../../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useUIAMatrixError } from '../../../hooks/useUIAFlows';
import { DeviceVerificationStatus } from '../../../components/DeviceVerificationStatus';
import { VerifyOtherDeviceTile } from './Verification';
import { VerificationStatus } from '../../../hooks/useDeviceVerificationStatus';
import { useAuthMetadata } from '../../../hooks/useAuthMetadata';
import { withSearchParam } from '../../../pages/pathUtils';
import { useAccountManagementActions } from '../../../hooks/useAccountManagement';
import { SettingTile } from '../../../components/setting-tile';
import { openExternalUrl } from '../../../utils/desktop';

type OtherDevicesProps = {
  devices: IMyDevice[];
  refreshDeviceList: () => Promise<void>;
  showVerification?: boolean;
};
export function OtherDevices({ devices, refreshDeviceList, showVerification }: OtherDevicesProps) {
  const mx = useMatrixClient();
  const crypto = mx.getCrypto();
  const authMetadata = useAuthMetadata();
  const accountManagementActions = useAccountManagementActions();
  const [accountManagementError, setAccountManagementError] = useState<string>();

  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  const handleDashboardOIDC = useCallback(() => {
    const authUrl = authMetadata?.account_management_uri ?? authMetadata?.issuer;
    if (!authUrl) return;

    setAccountManagementError(undefined);
    void openExternalUrl(
      withSearchParam(authUrl, {
        action: accountManagementActions.sessionsList,
      })
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setAccountManagementError(`无法打开设备管理页面：${message}`);
    });
  }, [authMetadata, accountManagementActions]);

  const handleDeleteOIDC = useCallback(
    (deviceId: string) => {
      const authUrl = authMetadata?.account_management_uri ?? authMetadata?.issuer;
      if (!authUrl) return;

      setAccountManagementError(undefined);
      void openExternalUrl(
        withSearchParam(authUrl, {
          action: accountManagementActions.sessionEnd,
          device_id: deviceId,
        })
      ).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setAccountManagementError(`无法打开设备删除页面：${message}`);
      });
    },
    [authMetadata, accountManagementActions]
  );

  const handleToggleDelete = useCallback((deviceId: string) => {
    setDeleted((deviceIds) => {
      const newIds = new Set(deviceIds);
      if (newIds.has(deviceId)) {
        newIds.delete(deviceId);
      } else {
        newIds.add(deviceId);
      }
      return newIds;
    });
  }, []);

  const [deleteState, setDeleteState] = useState<AsyncState<void, MatrixError>>({
    status: AsyncStatus.Idle,
  });

  const deleteDevices = useAsync(
    useCallback(
      async (authDict?: AuthDict) => {
        await mx.deleteMultipleDevices(Array.from(deleted), authDict);
      },
      [mx, deleted]
    ),
    useCallback(
      (state: typeof deleteState) => {
        if (state.status === AsyncStatus.Success) {
          setDeleted(new Set());
          refreshDeviceList();
        }
        setDeleteState(state);
      },
      [refreshDeviceList]
    )
  );
  const [authData, deleteError] = useUIAMatrixError(
    deleteState.status === AsyncStatus.Error ? deleteState.error : undefined
  );
  const deleting = deleteState.status === AsyncStatus.Loading || authData !== undefined;

  const handleCancelDelete = () => setDeleted(new Set());
  const handleCancelAuth = useCallback(() => {
    setDeleteState({ status: AsyncStatus.Idle });
  }, []);

  return devices.length > 0 ? (
    <>
      <Box direction="Column" gap="100">
        <Text size="L400">其他设备</Text>
        {authMetadata && (
          <SequenceCard
            className={SequenceCardStyle}
            variant="SurfaceVariant"
            direction="Column"
            gap="400"
          >
            <SettingTile
              title="设备管理"
              description="在账户管理页面查看和管理设备。"
              after={
                <Button
                  size="300"
                  variant="Secondary"
                  fill="Soft"
                  radii="300"
                  outlined
                  onClick={handleDashboardOIDC}
                >
                  <Text size="B300">打开</Text>
                </Button>
              }
            />
          </SequenceCard>
        )}
        {accountManagementError && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            <b>{accountManagementError}</b>
          </Text>
        )}
        {devices
          .sort((d1, d2) => {
            if (!d1.last_seen_ts || !d2.last_seen_ts) return 0;
            return d1.last_seen_ts < d2.last_seen_ts ? 1 : -1;
          })
          .map((device) => (
            <SequenceCard
              key={device.device_id}
              className={SequenceCardStyle}
              variant={deleted.has(device.device_id) ? 'Critical' : 'SurfaceVariant'}
              direction="Column"
              gap="400"
            >
              <DeviceTile
                device={device}
                deleted={deleted.has(device.device_id)}
                refreshDeviceList={refreshDeviceList}
                disabled={deleting}
                options={
                  authMetadata ? (
                    <DeviceDeleteBtn
                      deviceId={device.device_id}
                      deleted={false}
                      onDeleteToggle={handleDeleteOIDC}
                    />
                  ) : (
                    <DeviceDeleteBtn
                      deviceId={device.device_id}
                      deleted={deleted.has(device.device_id)}
                      onDeleteToggle={handleToggleDelete}
                      disabled={deleting}
                    />
                  )
                }
              />
              {showVerification && crypto && (
                <DeviceVerificationStatus
                  crypto={crypto}
                  userId={mx.getSafeUserId()}
                  deviceId={device.device_id}
                >
                  {(status) =>
                    status === VerificationStatus.Unverified && (
                      <VerifyOtherDeviceTile crypto={crypto} deviceId={device.device_id} />
                    )
                  }
                </DeviceVerificationStatus>
              )}
            </SequenceCard>
          ))}
      </Box>
      {deleted.size > 0 && (
        <Menu
          style={{
            position: 'sticky',
            padding: config.space.S200,
            paddingLeft: config.space.S400,
            bottom: config.space.S400,
            left: config.space.S400,
            right: 0,
            zIndex: 1,
          }}
          variant="Critical"
        >
          <Box alignItems="Center" gap="400">
            <Box grow="Yes" direction="Column">
              {deleteError ? (
                <Text size="T200">
                  <b>设备退出失败，请重试。{deleteError.message}</b>
                </Text>
              ) : (
                <Text size="T200">
                  <b>退出所选设备（已选择 {deleted.size} 个）</b>
                </Text>
              )}
              {authData && (
                <ActionUIAFlowsLoader
                  authData={authData}
                  unsupported={() => (
                    <Text size="T200">客户端暂不支持完成此操作所需的身份验证步骤。</Text>
                  )}
                >
                  {(ongoingFlow) => (
                    <ActionUIA
                      authData={authData}
                      ongoingFlow={ongoingFlow}
                      action={deleteDevices}
                      onCancel={handleCancelAuth}
                    />
                  )}
                </ActionUIAFlowsLoader>
              )}
            </Box>
            <Box shrink="No" gap="200">
              <Button
                size="300"
                variant="Critical"
                fill="None"
                radii="300"
                disabled={deleting}
                onClick={handleCancelDelete}
              >
                <Text size="B300">取消</Text>
              </Button>
              <Button
                size="300"
                variant="Critical"
                radii="300"
                disabled={deleting}
                before={deleting && <Spinner variant="Critical" fill="Solid" size="100" />}
                onClick={() => deleteDevices()}
              >
                <Text size="B300">退出登录</Text>
              </Button>
            </Box>
          </Box>
        </Menu>
      )}
    </>
  ) : null;
}
