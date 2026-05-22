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
import {
  markAccountPinVerified,
  resolveAccountPinLoginRequirement,
} from '../../../utils/pinLock';
import { AccountPinDialog } from '../../../components/pin-lock';

const copy = {
  hintTitle: '\u63d0\u793a',
  usernameLabel: '\u7528\u6237\u540d\uff1a',
  matrixIdLabel: 'Matrix ID\uff1a',
  emailLabel: '\u90ae\u7bb1\uff1a',
  usernameField: '\u7528\u6237\u540d',
  passwordField: '\u5bc6\u7801',
  serverNotAllowed:
    '\u5f53\u524d\u5ba2\u6237\u7aef\u5b9e\u4f8b\u4e0d\u5141\u8bb8\u4f7f\u7528\u81ea\u5b9a\u4e49\u670d\u52a1\u5668\u767b\u5f55\u3002',
  invalidServer: '\u672a\u80fd\u627e\u5230\u5bf9\u5e94\u7684 Matrix ID \u670d\u52a1\u5668\u3002',
  forbidden: '\u7528\u6237\u540d\u6216\u5bc6\u7801\u9519\u8bef\u3002',
  userDeactivated: '\u8be5\u8d26\u6237\u5df2\u88ab\u505c\u7528\u3002',
  invalidRequest: '\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u6c42\u4e2d\u7684\u90e8\u5206\u6570\u636e\u65e0\u6548\u3002',
  rateLimited: '\u767b\u5f55\u5931\u8d25\uff0c\u5f53\u524d\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002',
  unknown: '\u767b\u5f55\u5931\u8d25\uff0c\u539f\u56e0\u672a\u77e5\u3002',
  forgotPassword: '\u5fd8\u8bb0\u5bc6\u7801\uff1f',
  login: '\u767b\u5f55',
  pinTitle: '\u9a8c\u8bc1 PIN \u5e76\u767b\u5f55',
  pinDescription:
    '\u8fd9\u4e2a\u8d26\u6237\u5df2\u542f\u7528 PIN \u4fdd\u62a4\uff0c\u8bf7\u5148\u8f93\u5165\u5df2\u7ecf\u8bbe\u7f6e\u7684 PIN \u7801\u540e\u518d\u8fdb\u5165\u3002',
  continueLogin: '\u7ee7\u7eed\u767b\u5f55',
} as const;

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
              <Text size="L400">{copy.hintTitle}</Text>
            </Header>
            <Box
              style={{ padding: config.space.S200, paddingTop: 0 }}
              direction="Column"
              tabIndex={0}
              gap="100"
            >
              <Text size="T300">
                <Text as="span" size="Inherit" priority="300">
                  {copy.usernameLabel}
                </Text>{' '}
                user123
              </Text>
              <Text size="T300">
                <Text as="span" size="Inherit" priority="300">
                  {copy.matrixIdLabel}
                </Text>{' '}
                {`@user123:${server}`}
              </Text>
              <Text size="T300">
                <Text as="span" size="Inherit" priority="300">
                  {copy.emailLabel}
                </Text>{' '}
                {`user123@${server}`}
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
          {copy.usernameField}
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
              <FieldError message={copy.serverNotAllowed} />
            )}
            {loginState.error.errcode === LoginError.InvalidServer && (
              <FieldError message={copy.invalidServer} />
            )}
          </>
        )}
      </Box>

      <Box direction="Column" gap="100">
        <Text as="label" size="L400" priority="300">
          {copy.passwordField}
        </Text>
        <PasswordInput name="passwordInput" variant="Background" size="500" outlined required />
        <Box alignItems="Start" justifyContent="SpaceBetween" gap="200">
          {loginState.status === AsyncStatus.Error && (
            <>
              {loginState.error.errcode === LoginError.Forbidden && (
                <FieldError message={copy.forbidden} />
              )}
              {loginState.error.errcode === LoginError.UserDeactivated && (
                <FieldError message={copy.userDeactivated} />
              )}
              {loginState.error.errcode === LoginError.InvalidRequest && (
                <FieldError message={copy.invalidRequest} />
              )}
              {loginState.error.errcode === LoginError.RateLimited && (
                <FieldError message={copy.rateLimited} />
              )}
              {loginState.error.errcode === LoginError.Unknown && (
                <FieldError message={copy.unknown} />
              )}
            </>
          )}
          <Box grow="Yes" shrink="No" justifyContent="End">
            <Text as="span" size="T200" priority="400" align="Right">
              <Link to={getResetPasswordPath(server)}>{copy.forgotPassword}</Link>
            </Text>
          </Box>
        </Box>
      </Box>

      <Button type="submit" variant="Primary" size="500">
        <Text as="span" size="B500">
          {copy.login}
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
    </Box>
  );
}
