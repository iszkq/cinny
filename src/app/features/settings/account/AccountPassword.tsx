import React, { FormEventHandler, useCallback, useMemo, useState } from 'react';
import { AuthDict, IAuthData, MatrixError } from 'matrix-js-sdk';
import {
  Box,
  Button,
  color,
  config,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Switch,
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { ActionUIA, pickUIAFlow } from '../../../components/ActionUIA';
import { PasswordInput } from '../../../components/password-input';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { useCapabilities } from '../../../hooks/useCapabilities';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { stopPropagation } from '../../../utils/keyboard';
import { SequenceCardStyle } from '../styles.css';

type ChangePasswordDialogProps = {
  requestClose: () => void;
  onSuccess: () => void;
};

function ChangePasswordDialog({ requestClose, onSuccess }: ChangePasswordDialogProps) {
  const mx = useMatrixClient();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [logoutDevices, setLogoutDevices] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [authData, setAuthData] = useState<IAuthData>();

  const ongoingFlow = useMemo(
    () => (authData ? pickUIAFlow(authData.flows ?? []) : undefined),
    [authData]
  );

  const changePassword = useCallback(
    async (authDict: AuthDict = {}) => {
      setSubmitting(true);
      setError(undefined);

      try {
        await mx.setPassword(authDict, newPassword, logoutDevices);
        setAuthData(undefined);
        onSuccess();
      } catch (errorValue) {
        if (errorValue instanceof MatrixError && errorValue.httpStatus === 401) {
          const nextAuthData = errorValue.data as IAuthData;
          if (pickUIAFlow(nextAuthData.flows ?? [])) {
            setAuthData(nextAuthData);
          } else {
            setAuthData(undefined);
            setError('服务器要求的身份验证方式暂不受此客户端支持。');
          }
        } else {
          setAuthData(undefined);
          setError(errorValue instanceof Error ? errorValue.message : '密码修改失败，请稍后重试。');
        }
      } finally {
        setSubmitting(false);
      }
    },
    [logoutDevices, mx, newPassword, onSuccess]
  );

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    setError(undefined);

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致。');
      return;
    }
    if (!newPassword) {
      setError('请输入新密码。');
      return;
    }

    changePassword().catch(() => undefined);
  };

  const handleCancelAuth = () => {
    setAuthData(undefined);
    setSubmitting(false);
  };

  return (
    <>
      <Overlay open={!authData} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: requestClose,
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Dialog variant="Surface">
              <Header
                style={{ padding: `0 ${config.space.S200} 0 ${config.space.S400}` }}
                variant="Surface"
                size="500"
              >
                <Box grow="Yes">
                  <Text size="H4">修改登录密码</Text>
                </Box>
                <IconButton size="300" onClick={requestClose} radii="300">
                  <Icon src={Icons.Cross} />
                </IconButton>
              </Header>
              <Box
                as="form"
                onSubmit={handleSubmit}
                style={{ padding: `0 ${config.space.S400} ${config.space.S400}` }}
                direction="Column"
                gap="400"
              >
                <Text size="T200" priority="300">
                  保存前，服务器会要求你使用当前密码或单点登录重新验证身份。
                </Text>
                <Box direction="Column" gap="100">
                  <Text size="L400">新密码</Text>
                  <PasswordInput
                    value={newPassword}
                    onChange={(evt) => setNewPassword(evt.currentTarget.value)}
                    autoComplete="new-password"
                    size="500"
                    outlined
                    autoFocus
                    required
                    disabled={submitting}
                  />
                </Box>
                <Box direction="Column" gap="100">
                  <Text size="L400">确认新密码</Text>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={(evt) => setConfirmPassword(evt.currentTarget.value)}
                    autoComplete="new-password"
                    size="500"
                    outlined
                    required
                    disabled={submitting}
                  />
                </Box>
                <SettingTile
                  title="退出其他设备"
                  description="开启后，修改成功时会撤销其他设备的登录会话；当前设备保持登录。"
                  after={
                    <Switch
                      variant="Primary"
                      value={logoutDevices}
                      onChange={setLogoutDevices}
                      disabled={submitting}
                    />
                  }
                />
                {error && (
                  <Box alignItems="Center" gap="100" style={{ color: color.Critical.Main }}>
                    <Icon size="50" src={Icons.Warning} filled />
                    <Text size="T200" style={{ color: color.Critical.Main }}>
                      <b>{error}</b>
                    </Text>
                  </Box>
                )}
                <Box justifyContent="End" gap="200">
                  <Button
                    type="button"
                    variant="Secondary"
                    fill="Soft"
                    onClick={requestClose}
                    disabled={submitting}
                  >
                    <Text size="B400">取消</Text>
                  </Button>
                  <Button
                    type="submit"
                    variant="Primary"
                    disabled={submitting || !newPassword || !confirmPassword}
                    before={submitting && <Spinner size="100" variant="Primary" fill="Solid" />}
                  >
                    <Text size="B400">继续验证</Text>
                  </Button>
                </Box>
              </Box>
            </Dialog>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
      {authData && ongoingFlow && (
        <ActionUIA
          authData={authData}
          ongoingFlow={ongoingFlow}
          action={(authDict) => changePassword(authDict).catch(() => undefined)}
          onCancel={handleCancelAuth}
        />
      )}
    </>
  );
}

export function AccountPassword() {
  const capabilities = useCapabilities();
  const [changePassword, setChangePassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const passwordChangeDisabled = capabilities['m.change_password']?.enabled === false;

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">登录与安全</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="登录密码"
          description={
            passwordChangeDisabled
              ? '当前服务器不允许客户端修改登录密码。'
              : '修改 Matrix 账号密码。操作前需要重新验证你的身份。'
          }
          after={
            <Box alignItems="Center" gap="200">
              {passwordChanged && (
                <Text size="T200" style={{ color: color.Success.Main }}>
                  已修改
                </Text>
              )}
              <Button
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="300"
                disabled={passwordChangeDisabled}
                onClick={() => {
                  setPasswordChanged(false);
                  setChangePassword(true);
                }}
              >
                <Text size="B300">修改密码</Text>
              </Button>
            </Box>
          }
        />
      </SequenceCard>
      {changePassword && (
        <ChangePasswordDialog
          requestClose={() => setChangePassword(false)}
          onSuccess={() => {
            setPasswordChanged(true);
            setChangePassword(false);
          }}
        />
      )}
    </Box>
  );
}
