import React, { useCallback, useState } from 'react';
import { Box, Button, config, Menu, Spinner, Text } from 'folds';
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

  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  const handleDashboardOIDC = useCallback(() => {
    const authUrl = authMetadata?.account_management_uri ?? authMetadata?.issuer;
    if (!authUrl) return;

    window.open(
      withSearchParam(authUrl, {
        action: accountManagementActions.sessionsList,
      }),
      '_blank'
    );
  }, [authMetadata, accountManagementActions]);

  const handleDeleteOIDC = useCallback(
    (deviceId: string) => {
      const authUrl = authMetadata?.account_management_uri ?? authMetadata?.issuer;
      if (!authUrl) return;

      window.open(
        withSearchParam(authUrl, {
          action: accountManagementActions.sessionEnd,
          device_id: deviceId,
        }),
        '_blank'
      );
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
        <Text size="L400">{'\u5176\u4ed6\u8bbe\u5907'}</Text>
        {authMetadata && (
          <SequenceCard
            className={SequenceCardStyle}
            variant="SurfaceVariant"
            direction="Column"
            gap="400"
          >
            <SettingTile
              title={'\u8bbe\u5907\u9762\u677f'}
              description={'\u5728 OIDC \u8bbe\u5907\u9762\u677f\u4e2d\u7ba1\u7406\u4f60\u7684\u8bbe\u5907\u3002'}
              after={
                <Button
                  size="300"
                  variant="Secondary"
                  fill="Soft"
                  radii="300"
                  outlined
                  onClick={handleDashboardOIDC}
                >
                  <Text size="B300">{'\u6253\u5f00'}</Text>
                </Button>
              }
            />
          </SequenceCard>
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
                  <b>
                    {'\u9000\u51fa\u8bbe\u5907\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002'} {deleteError.message}
                  </b>
                </Text>
              ) : (
                <Text size="T200">
                  <b>
                    {`\u9000\u51fa\u5df2\u9009\u8bbe\u5907\uff08\u5df2\u9009 ${deleted.size} \u4e2a\uff09`}
                  </b>
                </Text>
              )}
              {authData && (
                <ActionUIAFlowsLoader
                  authData={authData}
                  unsupported={() => (
                    <Text size="T200">
                      {'\u5ba2\u6237\u7aef\u6682\u4e0d\u652f\u6301\u6267\u884c\u8be5\u64cd\u4f5c\u6240\u9700\u7684\u9a8c\u8bc1\u6d41\u7a0b\u3002'}
                    </Text>
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
                <Text size="B300">{'\u53d6\u6d88'}</Text>
              </Button>
              <Button
                size="300"
                variant="Critical"
                radii="300"
                disabled={deleting}
                before={deleting && <Spinner variant="Critical" fill="Solid" size="100" />}
                onClick={() => deleteDevices()}
              >
                <Text size="B300">{'\u9000\u51fa\u767b\u5f55'}</Text>
              </Button>
            </Box>
          </Box>
        </Menu>
      )}
    </>
  ) : null;
}
