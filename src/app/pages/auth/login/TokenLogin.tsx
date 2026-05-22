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
import {
  markAccountPinVerified,
  resolveAccountPinLoginRequirement,
} from '../../../utils/pinLock';
import { completeLogin, CustomLoginResponse, LoginError, login } from './loginUtil';

const copy = {
  title: '\u4ee4\u724c\u767b\u5f55',
  forbidden: '\u767b\u5f55\u4ee4\u724c\u65e0\u6548\u3002',
  userDeactivated: '\u8be5\u8d26\u6237\u5df2\u88ab\u505c\u7528\u3002',
  invalidRequest: '\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u6c42\u4e2d\u7684\u90e8\u5206\u6570\u636e\u65e0\u6548\u3002',
  rateLimited: '\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002',
  unknown: '\u767b\u5f55\u5931\u8d25\uff0c\u539f\u56e0\u672a\u77e5\u3002',
  pinTitle: '\u9a8c\u8bc1 PIN \u5e76\u767b\u5f55',
  pinDescription:
    '\u8fd9\u4e2a\u8d26\u6237\u5df2\u542f\u7528 PIN \u4fdd\u62a4\uff0c\u8bf7\u5148\u8f93\u5165\u5df2\u7ecf\u8bbe\u7f6e\u7684 PIN \u7801\u540e\u518d\u8fdb\u5165\u3002',
  continueLogin: '\u7ee7\u7eed\u767b\u5f55',
} as const;

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
        <Text size="L400">{copy.title}</Text>
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
  const [resolvingPinRequirement, setResolvingPinRequirement] = useState(false);

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
      setResolvingPinRequirement(false);
      return;
    }

    if (handledSuccess) {
      return;
    }

    let disposed = false;
    setResolvingPinRequirement(true);

    resolveAccountPinLoginRequirement(
      loginSuccessData.baseUrl,
      loginSuccessData.response.user_id,
      loginSuccessData.response.access_token
    )
      .then((requirement) => {
        if (disposed) {
          return;
        }

        if (requirement === 'prompt') {
          setPinProtectedLogin(loginSuccessData);
          setHandledSuccess(true);
          return;
        }

        setHandledSuccess(true);
        completeLogin(loginSuccessData, navigate);
      })
      .catch(() => {
        if (disposed) {
          return;
        }

        setHandledSuccess(true);
        completeLogin(loginSuccessData, navigate);
      })
      .finally(() => {
        if (!disposed) {
          setResolvingPinRequirement(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [handledSuccess, loginSuccessData, navigate]);

  return (
    <>
      {loginState.status === AsyncStatus.Error && (
        <>
          {loginState.error.errcode === LoginError.Forbidden && (
            <LoginTokenError message={copy.forbidden} />
          )}
          {loginState.error.errcode === LoginError.UserDeactivated && (
            <LoginTokenError message={copy.userDeactivated} />
          )}
          {loginState.error.errcode === LoginError.InvalidRequest && (
            <LoginTokenError message={copy.invalidRequest} />
          )}
          {loginState.error.errcode === LoginError.RateLimited && (
            <LoginTokenError message={copy.rateLimited} />
          )}
          {loginState.error.errcode === LoginError.Unknown && (
            <LoginTokenError message={copy.unknown} />
          )}
        </>
      )}

      <Overlay
        open={loginState.status === AsyncStatus.Loading || resolvingPinRequirement}
        backdrop={<OverlayBackdrop />}
      >
        <OverlayCenter>
          <Spinner size="600" variant="Secondary" />
        </OverlayCenter>
      </Overlay>

      {pinProtectedLogin && (
        <AccountPinDialog
          baseUrl={pinProtectedLogin.baseUrl}
          userId={pinProtectedLogin.response.user_id}
          title={copy.pinTitle}
          description={copy.pinDescription}
          submitLabel={copy.continueLogin}
          onCancel={() => setPinProtectedLogin(undefined)}
          onSuccess={() => {
            markAccountPinVerified(
              pinProtectedLogin.baseUrl,
              pinProtectedLogin.response.user_id
            );
            completeLogin(pinProtectedLogin, navigate);
          }}
        />
      )}
    </>
  );
}
