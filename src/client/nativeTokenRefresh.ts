import { MatrixError } from 'matrix-js-sdk';
import type { IRefreshTokenResponse } from 'matrix-js-sdk';
import type { Session } from '../app/state/sessions';
import { recordAndroidDiagnostic } from './androidDiagnostics';

// MatrixError is treated as terminal by this SDK's token refresher. Convert
// temporary HTTP errors to ordinary errors so sync can retry without logout.
export const isTerminalRefreshError = (error: unknown): boolean =>
  error instanceof MatrixError &&
  (error.errcode === 'M_UNKNOWN_TOKEN' ||
    error.errcode === 'M_FORBIDDEN' ||
    error.errcode === 'M_USER_DEACTIVATED' ||
    error.errcode === 'M_USER_LOCKED');

export function createNativeTokenRefresh(
  session: Session,
  request: (token: string) => Promise<IRefreshTokenResponse>,
  persist: (session: Session) => Promise<unknown>
) {
  return async (token: string) => {
    let response: IRefreshTokenResponse;
    try {
      response = await request(token);
    } catch (error) {
      const terminal = isTerminalRefreshError(error);
      recordAndroidDiagnostic('token_refresh_failed', {
        terminal,
        status: error instanceof MatrixError ? error.httpStatus ?? 0 : 0,
        code: error instanceof MatrixError ? error.errcode ?? 'unknown' : 'network',
      });
      if (terminal) throw error;
      throw new Error('登录凭据续期暂时失败，等待网络恢复后重试');
    }
    const nextRefreshToken = response.refresh_token || token;
    // Commit the complete pair before handing it back to the SDK. Never keep
    // the rotated refresh token only in native storage or a stale closure.
    localStorage.setItem('cinny_access_token', response.access_token);
    localStorage.setItem('cinny_refresh_token', nextRefreshToken);
    if (response.expires_in_ms !== undefined) {
      localStorage.setItem('cinny_expires_in_ms', String(response.expires_in_ms));
    } else localStorage.removeItem('cinny_expires_in_ms');
    await persist({
      ...session,
      accessToken: response.access_token,
      refreshToken: nextRefreshToken,
      expiresInMs: response.expires_in_ms,
    });
    recordAndroidDiagnostic('access_token_refreshed', {
      hasRotatedRefreshToken: !!response.refresh_token,
    });
    return {
      accessToken: response.access_token,
      refreshToken: nextRefreshToken,
      expiry:
        response.expires_in_ms === undefined
          ? undefined
          : new Date(Date.now() + response.expires_in_ms),
    };
  };
}
