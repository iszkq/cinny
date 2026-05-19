import React, { FormEventHandler, MouseEventHandler, useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Menu,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  RectCords,
  Spinner,
  Text,
  config,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { Link, useNavigate } from 'react-router-dom';
import { MatrixError } from 'matrix-js-sdk';
import { getMxIdLocalPart, getMxIdServer, isUserId } from '../../../utils/matrix';
import { EMAIL_REGEX } from '../../../utils/regex';
import { useAutoDiscoveryInfo } from '../../../hooks/useAutoDiscoveryInfo';
import { APP_WEB_DEVICE_NAME } from '../../../constants/branding';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useAuthServer } from '../../../hooks/useAuthServer';
import { useClientConfig } from '../../../hooks/useClientConfig';
import {
  completeLogin,
  CustomLoginResponse,
  LoginError,
  factoryGetBaseUrl,
  login,
} from './loginUtil';
import { PasswordInput } from '../../../components/password-input';
import { FieldError } from '../FiledError';
import { getResetPasswordPath } from '../../pathUtils';
import { stopPropagation } from '../../../utils/keyboard';
import { resolveAccountPinLoginRequirement } from '../../../utils/pinLock';
import { AccountPinDialog, LocalPinSetupDialog } from '../../../components/pin-lock';

function UsernameHint({ server }: { server: string }) {
  const [anchor, setAnchor] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLElement> = (evt) => {
    setAnchor(evt.currentTarget.getBoundingClientRect());
  };
  return (
    <PopOut
      anchor={anchor}
      position="Top"
      align="End"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setAnchor(undefined),
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu>
            <Header size="300" style={{ padding: `0 ${config.space.S200}` }}>
              <Text size="L400">提示</Text>
            </Header>
            <Box
              style={{ padding: config.space.S200, paddingTop: 0 }}
              direction="Column"
              tabIndex={0}
              gap="100"
            >
              <Text size="T300">
                <Text as="span" size="Inherit" priority="300">
                  用户名：
                </Text>{' '}
                user123
              </Text>
              <Text size="T300">
                <Text as="span" size="Inherit" priority="300">
                  Matrix ID：
                </Text>
                {` @user123:${server}`}
              </Text>
              <Text size="T300">
                <Text as="span" size="Inherit" priority="300">
                  邮箱：
                </Text>
                {` user123@${server}`}
              </Text>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <IconButton
        tabIndex={-1}
        onClick={handleOpenMenu}
        type="button"
        variant="Background"
        size="300"
        radii="300"
        aria-pressed={!!anchor}
      >
        <Icon style={{ opacity: config.opacity.P300 }} size="100" src={Icons.Info} />
      </IconButton>
    </PopOut>
  );
}

type PasswordLoginFormProps = {
  defaultUsername?: string;
  defaultEmail?: string;
};
export function PasswordLoginForm({ defaultUsername, defaultEmail }: PasswordLoginFormProps) {
  const server = useAuthServer();
  const clientConfig = useClientConfig();
  const navigate = useNavigate();

  const serverDiscovery = useAutoDiscoveryInfo();
  const baseUrl = serverDiscovery['m.homeserver'].base_url;
  const [pinProtectedLogin, setPinProtectedLogin] = useState<CustomLoginResponse>();
  const [pinSetupRequiredLogin, setPinSetupRequiredLogin] = useState<CustomLoginResponse>();
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
    if (!loginSuccessData) {
      setHandledSuccess(false);
      setPinProtectedLogin(undefined);
      setPinSetupRequiredLogin(undefined);
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

        if (requirement === 'setup') {
          setPinSetupRequiredLogin(loginSuccessData);
          setHandledSuccess(true);
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

  const handleUsernameLogin = (username: string, password: string) => {
    startLogin(baseUrl, {
      type: 'm.login.password',
      identifier: {
        type: 'm.id.user',
        user: username,
      },
      password,
      initial_device_display_name: APP_WEB_DEVICE_NAME,
    });
  };

  const handleMxIdLogin = async (mxId: string, password: string) => {
    const mxIdServer = getMxIdServer(mxId);
    const mxIdUsername = getMxIdLocalPart(mxId);
    if (!mxIdServer || !mxIdUsername) return;

    const getBaseUrl = factoryGetBaseUrl(clientConfig, mxIdServer);

    startLogin(getBaseUrl, {
      type: 'm.login.password',
      identifier: {
        type: 'm.id.user',
        user: mxIdUsername,
      },
      password,
      initial_device_display_name: APP_WEB_DEVICE_NAME,
    });
  };
  const handleEmailLogin = (email: string, password: string) => {
    startLogin(baseUrl, {
      type: 'm.login.password',
      identifier: {
        type: 'm.id.thirdparty',
        medium: 'email',
        address: email,
      },
      password,
      initial_device_display_name: APP_WEB_DEVICE_NAME,
    });
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const { usernameInput, passwordInput } = evt.target as HTMLFormElement & {
      usernameInput: HTMLInputElement;
      passwordInput: HTMLInputElement;
    };

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username) {
      usernameInput.focus();
      return;
    }
    if (!password) {
      passwordInput.focus();
      return;
    }

    if (isUserId(username)) {
      handleMxIdLogin(username, password);
      return;
    }
    if (EMAIL_REGEX.test(username)) {
      handleEmailLogin(username, password);
      return;
    }
    handleUsernameLogin(username, password);
  };

  return (
    <Box as="form" onSubmit={handleSubmit} direction="Inherit" gap="400">
      <Box direction="Column" gap="100">
        <Text as="label" size="L400" priority="300">
          用户名
        </Text>
        <Input
          defaultValue={defaultUsername ?? defaultEmail}
          style={{ paddingRight: config.space.S300 }}
          name="usernameInput"
          variant="Background"
          size="500"
          required
          outlined
          after={<UsernameHint server={server} />}
        />
        {loginState.status === AsyncStatus.Error && (
          <>
            {loginState.error.errcode === LoginError.ServerNotAllowed && (
              <FieldError message="当前客户端实例不允许使用自定义服务器登录。" />
            )}
            {loginState.error.errcode === LoginError.InvalidServer && (
              <FieldError message="未能找到对应的 Matrix ID 服务器。" />
            )}
          </>
        )}
      </Box>
      <Box direction="Column" gap="100">
        <Text as="label" size="L400" priority="300">
          密码
        </Text>
        <PasswordInput name="passwordInput" variant="Background" size="500" outlined required />
        <Box alignItems="Start" justifyContent="SpaceBetween" gap="200">
          {loginState.status === AsyncStatus.Error && (
            <>
              {loginState.error.errcode === LoginError.Forbidden && (
                <FieldError message="用户名或密码错误。" />
              )}
              {loginState.error.errcode === LoginError.UserDeactivated && (
                <FieldError message="该账号已被停用。" />
              )}
              {loginState.error.errcode === LoginError.InvalidRequest && (
                <FieldError message="登录失败，请求中的部分数据无效。" />
              )}
              {loginState.error.errcode === LoginError.RateLimited && (
                <FieldError message="登录失败，当前请求过于频繁，请稍后再试。" />
              )}
              {loginState.error.errcode === LoginError.Unknown && (
                <FieldError message="登录失败，原因未知。" />
              )}
            </>
          )}
          <Box grow="Yes" shrink="No" justifyContent="End">
            <Text as="span" size="T200" priority="400" align="Right">
              <Link to={getResetPasswordPath(server)}>忘记密码？</Link>
            </Text>
          </Box>
        </Box>
      </Box>
      <Button type="submit" variant="Primary" size="500">
        <Text as="span" size="B500">
          登录
        </Text>
      </Button>

      <Overlay
        open={loginState.status === AsyncStatus.Loading || resolvingPinRequirement}
        backdrop={<OverlayBackdrop />}
      >
        <OverlayCenter>
          <Spinner variant="Secondary" size="600" />
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
      {pinSetupRequiredLogin && (
        <LocalPinSetupDialog
          baseUrl={pinSetupRequiredLogin.baseUrl}
          userId={pinSetupRequiredLogin.response.user_id}
          title="为这台设备设置 PIN"
          description="这个账号已开启账号级 PIN 保护。进入前，需要先在当前设备上创建本地 PIN。PIN 码只保存在这台设备里。"
          submitLabel="设置并进入"
          onCancel={() => setPinSetupRequiredLogin(undefined)}
          onSuccess={() => completeLogin(pinSetupRequiredLogin, navigate)}
        />
      )}
    </Box>
  );
}
