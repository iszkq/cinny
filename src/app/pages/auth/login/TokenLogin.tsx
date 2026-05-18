import {
  Box,
  Icon,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  color,
  config,
} from 'folds';
import React, { useCallback, useEffect, useState } from 'react';
import { MatrixError } from 'matrix-js-sdk';
import { useNavigate } from 'react-router-dom';
import { APP_WEB_DEVICE_NAME } from '../../../constants/branding';
import { useAutoDiscoveryInfo } from '../../../hooks/useAutoDiscoveryInfo';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { AccountPinDialog } from '../../../components/pin-lock';
import { hasAccountPin } from '../../../utils/pinLock';
import { completeLogin, CustomLoginResponse, LoginError, login } from './loginUtil';

function LoginTokenError({ message }: { message: string }) {
  return (
    <Box
      style={{
        backgroundColor: color.Critical.Container,
        color: color.Critical.OnContainer,
        padding: config.space.S300,
        borderRadius: config.radii.R400,
      }}
      justifyContent="Start"
      alignItems="Start"
      gap="300"
    >
      <Icon size="300" filled src={Icons.Warning} />
      <Box direction="Column" gap="100">
        <Text size="L400">令牌登录</Text>
        <Text size="T300">
          <b>{message}</b>
        </Text>
      </Box>
    </Box>
  );
}

type TokenLoginProps = {
  token: string;
};
export function TokenLogin({ token }: TokenLoginProps) {
  const discovery = useAutoDiscoveryInfo();
  const baseUrl = discovery['m.homeserver'].base_url;
  const navigate = useNavigate();
  const [pinProtectedLogin, setPinProtectedLogin] = useState<CustomLoginResponse>();
  const [handledSuccess, setHandledSuccess] = useState(false);

  const [loginState, startLogin] = useAsyncCallback<
    CustomLoginResponse,
    MatrixError,
    Parameters<typeof login>
  >(useCallback(login, []));
  const loginSuccessData =
    loginState.status === AsyncStatus.Success ? loginState.data : undefined;

  useEffect(() => {
    startLogin(baseUrl, {
      type: 'm.login.token',
      token,
      initial_device_display_name: APP_WEB_DEVICE_NAME,
    });
  }, [baseUrl, token, startLogin]);

  useEffect(() => {
    if (!loginSuccessData) {
      setHandledSuccess(false);
      setPinProtectedLogin(undefined);
      return;
    }

    if (handledSuccess) {
      return;
    }

    if (hasAccountPin(loginSuccessData.baseUrl, loginSuccessData.response.user_id)) {
      setPinProtectedLogin(loginSuccessData);
      setHandledSuccess(true);
      return;
    }

    setHandledSuccess(true);
    completeLogin(loginSuccessData, navigate);
  }, [handledSuccess, loginSuccessData, navigate]);

  return (
    <>
      {loginState.status === AsyncStatus.Error && (
        <>
          {loginState.error.errcode === LoginError.Forbidden && (
            <LoginTokenError message="登录令牌无效。" />
          )}
          {loginState.error.errcode === LoginError.UserDeactivated && (
            <LoginTokenError message="该账号已被停用。" />
          )}
          {loginState.error.errcode === LoginError.InvalidRequest && (
            <LoginTokenError message="登录失败，请求中的部分数据无效。" />
          )}
          {loginState.error.errcode === LoginError.RateLimited && (
            <LoginTokenError message="登录失败，请求过于频繁，请稍后再试。" />
          )}
          {loginState.error.errcode === LoginError.Unknown && (
            <LoginTokenError message="登录失败，原因未知。" />
          )}
        </>
      )}
      <Overlay open={loginState.status === AsyncStatus.Loading} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <Spinner size="600" variant="Secondary" />
        </OverlayCenter>
      </Overlay>

      {pinProtectedLogin && (
        <AccountPinDialog
          baseUrl={pinProtectedLogin.baseUrl}
          userId={pinProtectedLogin.response.user_id}
          title="登录受保护账号"
          description="这个账号已启用 PIN 保护，请先输入 PIN 码再进入。"
          submitLabel="继续登录"
          onCancel={() => setPinProtectedLogin(undefined)}
          onSuccess={() => completeLogin(pinProtectedLogin, navigate)}
        />
      )}
    </>
  );
}
