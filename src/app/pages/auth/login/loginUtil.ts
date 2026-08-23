import to from 'await-to-js';
import { LoginRequest, LoginResponse, MatrixError, createClient } from 'matrix-js-sdk';
import { useEffect } from 'react';
import { NavigateFunction, useNavigate } from 'react-router-dom';
import { ClientConfig, clientAllowedServer } from '../../../hooks/useClientConfig';
import { autoDiscovery, specVersions } from '../../../cs-api';
import { ErrorCode } from '../../../cs-errorcode';
import {
  deleteAfterLoginRedirectPath,
  getAfterLoginRedirectPath,
} from '../../afterLoginRedirectPath';
import { getHomePath } from '../../pathUtils';
import {
  getFallbackSessionIdentity,
  isFallbackSessionSoftLoggedOut,
  setFallbackSession,
} from '../../../state/sessions';
import {
  allowNewRustCryptoStore,
  hasPersistedRustCryptoStore,
} from '../../../../client/rustCryptoStore';

export enum GetBaseUrlError {
  NotAllow = 'NotAllow',
  NotFound = 'NotFound',
}
export const factoryGetBaseUrl = (clientConfig: ClientConfig, server: string) => {
  const getBaseUrl = async (): Promise<string> => {
    if (!clientAllowedServer(clientConfig, server)) {
      throw new Error(GetBaseUrlError.NotAllow);
    }

    const [, discovery] = await to(autoDiscovery(fetch, server));

    let mxIdBaseUrl: string | undefined;
    const [, discoveryInfo] = discovery ?? [];

    if (discoveryInfo) {
      mxIdBaseUrl = discoveryInfo['m.homeserver'].base_url;
    }

    if (!mxIdBaseUrl) {
      throw new Error(GetBaseUrlError.NotFound);
    }
    const [, versions] = await to(specVersions(fetch, mxIdBaseUrl));
    if (!versions) {
      throw new Error(GetBaseUrlError.NotFound);
    }
    return mxIdBaseUrl;
  };
  return getBaseUrl;
};

export enum LoginError {
  ServerNotAllowed = 'ServerNotAllowed',
  InvalidServer = 'InvalidServer',
  Forbidden = 'Forbidden',
  UserDeactivated = 'UserDeactivated',
  InvalidRequest = 'InvalidRequest',
  RateLimited = 'RateLimited',
  Unknown = 'Unknown',
}

export type CustomLoginResponse = {
  baseUrl: string;
  response: LoginResponse;
  reusedDeviceId: boolean;
};

const normalizeHomeserverUrl = (url: string): string => url.replace(/\/+$/, '');

const getLoginUser = (data: LoginRequest): string | undefined => {
  const loginData = data as LoginRequest & {
    user?: unknown;
    identifier?: { type?: unknown; user?: unknown };
  };
  if (loginData.identifier?.type === 'm.id.user' && typeof loginData.identifier.user === 'string') {
    return loginData.identifier.user;
  }
  return typeof loginData.user === 'string' ? loginData.user : undefined;
};

const loginMatchesSavedUser = (data: LoginRequest, savedUserId: string): boolean => {
  const loginUser = getLoginUser(data);
  if (!loginUser) return false;
  if (loginUser.startsWith('@')) return loginUser === savedUserId;

  const separator = savedUserId.indexOf(':');
  const savedLocalpart = separator > 1 ? savedUserId.slice(1, separator) : undefined;
  return loginUser === savedLocalpart;
};

const reusedDeviceStillHasServerKeys = async (
  baseUrl: string,
  loginResponse: LoginResponse
): Promise<boolean> => {
  const authenticatedClient = createClient({
    baseUrl,
    accessToken: loginResponse.access_token,
    userId: loginResponse.user_id,
    deviceId: loginResponse.device_id,
  });
  try {
    const keys = await authenticatedClient.downloadKeysForUsers([loginResponse.user_id]);
    return Boolean(keys.device_keys?.[loginResponse.user_id]?.[loginResponse.device_id]);
  } catch {
    // A transient key-query failure is not evidence that a device is invalid.
    // Let normal startup retry instead of creating an unnecessary new device.
    return true;
  }
};

export const login = async (
  serverBaseUrl: string | (() => Promise<string>),
  data: LoginRequest
): Promise<CustomLoginResponse> => {
  const [urlError, url] =
    typeof serverBaseUrl === 'function' ? await to(serverBaseUrl()) : [undefined, serverBaseUrl];
  if (urlError) {
    throw new MatrixError({
      errcode:
        urlError.message === GetBaseUrlError.NotAllow
          ? LoginError.ServerNotAllowed
          : LoginError.InvalidServer,
    });
  }

  const savedIdentity = getFallbackSessionIdentity();
  const mayReuseDeviceId =
    isFallbackSessionSoftLoggedOut() &&
    !!savedIdentity &&
    normalizeHomeserverUrl(savedIdentity.baseUrl) === normalizeHomeserverUrl(url) &&
    data.device_id === undefined &&
    loginMatchesSavedUser(data, savedIdentity.userId);
  const canReuseDeviceId = mayReuseDeviceId && (await hasPersistedRustCryptoStore(savedIdentity));
  let reusedDeviceId = canReuseDeviceId;
  // Reusing a Matrix device is safe only for an explicit server-issued soft
  // logout. A normal login with the same username must receive a new device:
  // the old server-side device or its device keys may have been deleted while
  // the local Rust Crypto database still exists.
  const loginRequest: LoginRequest = canReuseDeviceId
    ? { ...data, device_id: savedIdentity!.deviceId }
    : data;

  let mx = createClient({ baseUrl: url });
  let [err, res] = await to<LoginResponse, MatrixError>(mx.loginRequest(loginRequest));

  // A homeserver can reject a stale/deleted device id with the same 403 used
  // for invalid credentials. Retry once without the old device id so a valid
  // password is not reported as incorrect after device state was reset.
  if (err?.httpStatus === 403 && canReuseDeviceId) {
    mx = createClient({ baseUrl: url });
    [err, res] = await to<LoginResponse, MatrixError>(mx.loginRequest(data));
    reusedDeviceId = false;
  }

  // Some homeservers accept a reused device_id even when its E2EE device keys
  // have disappeared. The local Rust store then believes those keys are still
  // uploaded, leaving the device unable to receive new room keys. Replace that
  // split-brain session with a newly-issued device before client startup.
  if (!err && res && reusedDeviceId && !(await reusedDeviceStillHasServerKeys(url, res))) {
    const staleClient = createClient({
      baseUrl: url,
      accessToken: res.access_token,
      userId: res.user_id,
      deviceId: res.device_id,
    });
    await staleClient.logout().catch(() => undefined);
    mx = createClient({ baseUrl: url });
    [err, res] = await to<LoginResponse, MatrixError>(mx.loginRequest(data));
    reusedDeviceId = false;
  }

  if (err) {
    if (err.httpStatus === 400) {
      throw new MatrixError({
        errcode: LoginError.InvalidRequest,
      });
    }
    if (err.httpStatus === 429) {
      throw new MatrixError({
        errcode: LoginError.RateLimited,
      });
    }
    if (err.errcode === ErrorCode.M_USER_DEACTIVATED) {
      throw new MatrixError({
        errcode: LoginError.UserDeactivated,
      });
    }

    if (err.httpStatus === 403) {
      throw new MatrixError({
        errcode: LoginError.Forbidden,
        error: err.data?.error ?? err.message,
      });
    }

    throw new MatrixError({
      errcode: LoginError.Unknown,
    });
  }
  if (!res) {
    throw new MatrixError({
      errcode: LoginError.Unknown,
    });
  }
  return {
    baseUrl: url,
    response: res,
    reusedDeviceId,
  };
};

export const completeLogin = (data: CustomLoginResponse, navigate: NavigateFunction) => {
  const { response: loginRes, baseUrl: loginBaseUrl } = data;
  setFallbackSession(loginRes.access_token, loginRes.device_id, loginRes.user_id, loginBaseUrl);
  if (!data.reusedDeviceId) {
    allowNewRustCryptoStore({ userId: loginRes.user_id, deviceId: loginRes.device_id });
  }
  const afterLoginRedirectUrl = getAfterLoginRedirectPath();
  deleteAfterLoginRedirectPath();
  navigate(afterLoginRedirectUrl ?? getHomePath(), { replace: true });
};

export const useLoginComplete = (data?: CustomLoginResponse) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (data) {
      completeLogin(data, navigate);
    }
  }, [data, navigate]);
};
