import { ClientEvent } from 'matrix-js-sdk';
import { CryptoEvent, type VerificationRequest } from 'matrix-js-sdk/lib/crypto-api';
import type { MatrixClient } from 'matrix-js-sdk';
import { recordAndroidDiagnostic } from '../../client/androidDiagnostics';

export async function requestIOSDeviceVerification(mx: MatrixClient, deviceId: string) {
  const crypto = mx.getCrypto();
  if (!crypto) throw new Error('加密模块尚未就绪。');
  if (deviceId === mx.getDeviceId()) throw new Error('请选择另一台设备。');
  let stage = 'target_request';
  try {
    // A known peer needs no forced key query. In particular, do not make a
    // healthy verification depend on the iOS failing preflight from build 15.
    let request;
    try {
      recordAndroidDiagnostic('ios_verification_target_request');
      request = await crypto.requestDeviceVerification(mx.getSafeUserId(), deviceId);
    } catch (error) {
      // Only a missing device cache warrants a key refresh. Never resend after
      // an ambiguous network failure: the original request may have arrived.
      if (!(error instanceof Error) || !/Not a known device/.test(error.message)) throw error;
      stage = 'cross_signing_query';
      recordAndroidDiagnostic('ios_verification_keys_refresh');
      await crypto.userHasCrossSigningKeys(mx.getSafeUserId(), true);
      stage = 'device_query';
      await crypto.getUserDeviceInfo([mx.getSafeUserId()], true);
      stage = 'target_request_after_query';
      recordAndroidDiagnostic('ios_verification_target_request');
      request = await crypto.requestDeviceVerification(mx.getSafeUserId(), deviceId);
    }
    recordAndroidDiagnostic('ios_verification_request_sent');
    return request;
  } catch (error) {
    recordAndroidDiagnostic('ios_verification_request_failed', {
      stage,
      ownershipError: error instanceof Error && /ownership|borrowed/.test(error.message),
      name: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
  }
}

export function normalizeIOSRecoveryKey(value: string): string {
  // Base58 never contains whitespace. iOS Notes/paste can insert newlines,
  // non-breaking spaces and invisible word separators into grouped keys.
  return value.replace(/[\s\u200B-\u200D\uFEFF]/g, '');
}

export function iosVerificationError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/ownership|borrowed|moved value|null pointer|out of bounds|unreachable/i.test(message)) {
    return '加密模块内部操作冲突，本次验证未完成。请关闭此窗口后复制苹果诊断信息；这不是恢复密钥错误。';
  }
  if (/Not a known device/.test(message))
    return '尚未取得这台设备的加密公钥，请刷新设备列表后再试。';
  return message || '验证请求未能发出，请检查连接后重试。';
}

export const IOS_VERIFICATION_REFRESH_EVENT = 'cinny-ios-verification-refreshed';

export function observeIOSIdentityChanges(mx: MatrixClient, userId: string, changed: () => void) {
  // Leave the Rust callback before querying Rust again; coalesce identity,
  // device and backup notifications produced by the same key response.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      changed();
    }, 0);
  };
  const identityChanged = (id: string) => {
    if (id === userId) schedule();
  };
  mx.on(CryptoEvent.UserTrustStatusChanged, identityChanged);
  mx.on(CryptoEvent.KeysChanged, schedule);
  mx.on(CryptoEvent.KeyBackupDecryptionKeyCached, schedule);
  window.addEventListener(IOS_VERIFICATION_REFRESH_EVENT, schedule);
  window.addEventListener('calculator-native-resume', schedule);
  return () => {
    clearTimeout(timer);
    mx.removeListener(CryptoEvent.UserTrustStatusChanged, identityChanged);
    mx.removeListener(CryptoEvent.KeysChanged, schedule);
    mx.removeListener(CryptoEvent.KeyBackupDecryptionKeyCached, schedule);
    window.removeEventListener(IOS_VERIFICATION_REFRESH_EVENT, schedule);
    window.removeEventListener('calculator-native-resume', schedule);
  };
}

export async function refreshIOSVerificationAfterDone(mx: MatrixClient) {
  try {
    const crypto = mx.getCrypto();
    if (!crypto) return;
    // Verification already updates Rust trust. Do not force the failing
    // preflight again, and never manufacture local trust with setDeviceVerified.
    await crypto.checkKeyBackupAndEnable();
    recordAndroidDiagnostic('ios_verification_state_refreshed');
  } catch (error) {
    recordAndroidDiagnostic('ios_verification_state_refresh_failed', {
      name: error instanceof Error ? error.name : 'unknown',
    });
  } finally {
    window.dispatchEvent(new Event(IOS_VERIFICATION_REFRESH_EVENT));
  }
}

// Requests can arrive during initial sync, before the React dialog mounts.
// Recover those from the SDK rather than requiring the sender to start over.
export function observeIOSPendingVerification(
  mx: MatrixClient,
  received: (request: VerificationRequest) => void
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const seen = new Set<string>();
  let liveRequest: VerificationRequest | undefined;
  const scan = () => {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      try {
        const requests = liveRequest
          ? [liveRequest]
          : mx.getCrypto()?.getVerificationRequestsToDeviceInProgress(mx.getSafeUserId()) ?? [];
        liveRequest = undefined;
        const request = requests.find(
          (item) => !item.initiatedByMe && item.pending && !seen.has(item.transactionId ?? '')
        );
        if (request) {
          seen.add(request.transactionId ?? '');
          recordAndroidDiagnostic('ios_verification_pending_received');
          received(request);
        }
      } catch (error) {
        recordAndroidDiagnostic('ios_verification_pending_scan_failed', {
          name: error instanceof Error ? error.name : 'unknown',
        });
      }
    }, 0);
  };
  const onLiveRequest = (request: VerificationRequest) => {
    liveRequest = request;
    recordAndroidDiagnostic('ios_verification_request_received');
    scan();
  };
  mx.on(CryptoEvent.VerificationRequestReceived, onLiveRequest);
  mx.on(ClientEvent.Sync, scan);
  window.addEventListener('calculator-native-resume', scan);
  scan();
  return () => {
    clearTimeout(timer);
    mx.removeListener(CryptoEvent.VerificationRequestReceived, onLiveRequest);
    mx.removeListener(ClientEvent.Sync, scan);
    window.removeEventListener('calculator-native-resume', scan);
  };
}
