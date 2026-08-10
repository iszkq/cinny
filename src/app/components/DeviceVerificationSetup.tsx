import React, { FormEventHandler, forwardRef, useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  Header,
  Box,
  Text,
  IconButton,
  Icon,
  Icons,
  config,
  Button,
  Chip,
  color,
  Spinner,
} from 'folds';
import { AuthDict, IAuthData, MatrixClient, MatrixError, UIAuthCallback } from 'matrix-js-sdk';
import type { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';
import { PasswordInput } from './password-input';
import { ContainerColor } from '../styles/ContainerColor.css';
import { copyToClipboard } from '../utils/dom';
import { clearSecretStorageKeys } from '../../client/secretStorageKeys';
import { ActionUIA, ActionUIAFlowsLoader } from './ActionUIA';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { UseStateProvider } from './UseStateProvider';
import { saveDownloadedFile } from '../utils/saveDownloadedFile';
import { isClientSyncReady } from '../hooks/useClientSyncReady';
import { runCryptoInitializationExclusive } from '../utils/cryptoInitializationGate';

const SECURITY_SYNC_NOT_READY_MESSAGE =
  '安全设置仍在同步，请等待连接稳定后再试。尚未开始写入本次设置。';

const assertSecuritySyncReady = (mx: MatrixClient): void => {
  if (!isClientSyncReady(mx.getSyncState())) {
    throw new Error(SECURITY_SYNC_NOT_READY_MESSAGE);
  }
};

type UIACallback<T> = (
  authDict: AuthDict | null
) => Promise<[IAuthData, undefined] | [undefined, T]>;

type PerformAction<T> = (authDict: AuthDict | null) => Promise<T>;

type UIAAction<T> = {
  authData: IAuthData;
  callback: UIACallback<T>;
  cancelCallback: () => void;
};

const UIA_CANCELLED_MESSAGE = '身份验证已取消。本次安全设置没有全部完成，请保存恢复密钥。';
const UIA_ALREADY_SETTLED_MESSAGE = '本次身份验证已结束，请重新打开设置查看结果。';

function makeUIAAction<T>(
  authData: IAuthData,
  performAction: PerformAction<T>,
  resolve: (data: T) => void,
  reject: (error: Error) => void
): UIAAction<T> {
  let settled = false;
  let settledError: Error | undefined;
  let activeRequest: ReturnType<UIACallback<T>> | undefined;

  const action: UIAAction<T> = {
    authData,
    callback: (authDict) => {
      if (settled) {
        return Promise.reject(settledError ?? new Error(UIA_ALREADY_SETTLED_MESSAGE));
      }
      // Reopening the dialog while a UIA request is in progress must reattach
      // to that request instead of sending another authentication attempt.
      if (activeRequest) return activeRequest;

      const request: ReturnType<UIACallback<T>> = (async () => {
        try {
          const data = await performAction(authDict);
          if (settled) {
            throw settledError ?? new Error(UIA_ALREADY_SETTLED_MESSAGE);
          }
          settled = true;
          resolve(data);
          return [undefined, data];
        } catch (cause) {
          if (settled) {
            throw settledError ?? new Error(UIA_ALREADY_SETTLED_MESSAGE);
          }
          if (cause instanceof MatrixError && cause.httpStatus === 401) {
            return [cause.data as IAuthData, undefined];
          }

          const error = cause instanceof Error ? cause : new Error('身份验证失败，请稍后重试。');
          settled = true;
          settledError = error;
          reject(error);
          throw error;
        }
      })();
      activeRequest = request;
      const clearActiveRequest = () => {
        if (activeRequest === request) activeRequest = undefined;
      };
      request.then(clearActiveRequest, clearActiveRequest);
      return request;
    },
    cancelCallback: () => {
      if (settled) return;
      const error = new Error(UIA_CANCELLED_MESSAGE);
      settled = true;
      settledError = error;
      reject(error);
    },
  };

  return action;
}

enum VerificationSetupStatus {
  Running = 'running',
  Success = 'success',
  Error = 'error',
}

enum VerificationSetupFlow {
  Enable = 'enable',
  Reset = 'reset',
}

type VerificationSetupSession = {
  flow: VerificationSetupFlow;
  status: VerificationSetupStatus;
  task: Promise<string>;
  recoveryKey?: string;
  error?: Error;
  uiaAction?: UIAAction<void>;
  nextAuthData?: IAuthData;
};

type VerificationSetupListener = () => void;

// The SDK crypto instance has the same lifetime as the logged-in Matrix
// client. Keeping the transaction here lets a newly mounted dialog reattach
// to the exact same destructive setup operation and UIA challenge.
const verificationSetupSessions = new WeakMap<CryptoApi, VerificationSetupSession>();
const verificationSetupListeners = new WeakMap<CryptoApi, Set<VerificationSetupListener>>();

const notifyVerificationSetup = (crypto: CryptoApi): void => {
  verificationSetupListeners.get(crypto)?.forEach((listener) => listener());
};

const subscribeVerificationSetup = (
  crypto: CryptoApi,
  listener: VerificationSetupListener
): (() => void) => {
  let listeners = verificationSetupListeners.get(crypto);
  if (!listeners) {
    listeners = new Set();
    verificationSetupListeners.set(crypto, listeners);
  }
  listeners.add(listener);
  // Close the render/effect race if the task changed before subscription.
  listener();

  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) verificationSetupListeners.delete(crypto);
  };
};

const useVerificationSetupSession = (
  crypto: CryptoApi | undefined,
  flow: VerificationSetupFlow
): VerificationSetupSession | undefined => {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!crypto) return undefined;
    return subscribeVerificationSetup(crypto, () => forceUpdate((version) => version + 1));
  }, [crypto]);

  if (!crypto) return undefined;
  const session = verificationSetupSessions.get(crypto);
  return session?.flow === flow ? session : undefined;
};

const setSessionUIAAction = (
  crypto: CryptoApi,
  session: VerificationSetupSession,
  uiaAction: UIAAction<void> | undefined
): void => {
  if (verificationSetupSessions.get(crypto) !== session) return;
  session.uiaAction = uiaAction;
  session.nextAuthData = undefined;
  notifyVerificationSetup(crypto);
};

const createAuthUploadDeviceSigningKeys =
  (crypto: CryptoApi, session: VerificationSetupSession): UIAuthCallback<void> =>
  (makeRequest) =>
    new Promise<void>((resolve, reject) => {
      let settled = false;

      const settleSuccess = () => {
        if (settled) return;
        settled = true;
        setSessionUIAAction(crypto, session, undefined);
        resolve();
      };
      const settleFailure = (cause: unknown) => {
        if (settled) return;
        settled = true;
        setSessionUIAAction(crypto, session, undefined);
        reject(cause instanceof Error ? cause : new Error('身份验证失败，请稍后重试。'));
      };

      Promise.resolve()
        .then(() => makeRequest(null))
        .then(settleSuccess)
        .catch((cause: unknown) => {
          if (cause instanceof MatrixError && cause.httpStatus === 401) {
            const action = makeUIAAction(
              cause.data as IAuthData,
              makeRequest as PerformAction<void>,
              settleSuccess,
              settleFailure
            );
            setSessionUIAAction(crypto, session, action);
            return;
          }
          settleFailure(cause);
        });
    });

const performVerificationSetup = async (
  mx: MatrixClient,
  crypto: CryptoApi,
  session: VerificationSetupSession,
  passphrase: string | undefined
): Promise<string> => {
  assertSecuritySyncReady(mx);
  const recoveryKeyData = await crypto.createRecoveryKeyFromPassphrase(passphrase);
  if (!recoveryKeyData.encodedPrivateKey) {
    throw new Error('生成恢复密钥失败，请稍后重试。');
  }
  assertSecuritySyncReady(mx);

  // Persist the key in the module session before the first write. Closing the
  // dialog from here on only detaches the UI; it never cancels the transaction.
  session.recoveryKey = recoveryKeyData.encodedPrivateKey;
  notifyVerificationSetup(crypto);
  clearSecretStorageKeys();

  await crypto.bootstrapSecretStorage({
    createSecretStorageKey: async () => recoveryKeyData,
    setupNewSecretStorage: true,
  });

  await crypto.bootstrapCrossSigning({
    authUploadDeviceSigningKeys: createAuthUploadDeviceSigningKeys(crypto, session),
    setupNewCrossSigning: true,
  });

  await crypto.resetKeyBackup();
  return recoveryKeyData.encodedPrivateKey;
};

const startVerificationSetup = (
  mx: MatrixClient,
  crypto: CryptoApi,
  flow: VerificationSetupFlow,
  passphrase: string | undefined
): Promise<string> => {
  const existingSession = verificationSetupSessions.get(crypto);
  if (existingSession?.flow === flow) return existingSession.task;
  if (existingSession?.status === VerificationSetupStatus.Running) {
    return Promise.reject(
      new Error('另一项安全设置正在进行，请先返回原来的窗口继续或取消身份验证。')
    );
  }
  // A terminal result belongs only to the flow that created it. Starting the
  // other flow is an explicit boundary and must never reuse an old key/result.
  if (existingSession) verificationSetupSessions.delete(crypto);

  let session: VerificationSetupSession;
  const task = runCryptoInitializationExclusive(crypto, () =>
    performVerificationSetup(mx, crypto, session, passphrase)
  );
  session = {
    flow,
    status: VerificationSetupStatus.Running,
    task,
  };
  verificationSetupSessions.set(crypto, session);
  notifyVerificationSetup(crypto);

  task.then(
    (recoveryKey) => {
      if (verificationSetupSessions.get(crypto) !== session) return;
      session.status = VerificationSetupStatus.Success;
      session.recoveryKey = recoveryKey;
      session.error = undefined;
      setSessionUIAAction(crypto, session, undefined);
      notifyVerificationSetup(crypto);
    },
    (cause: unknown) => {
      if (verificationSetupSessions.get(crypto) !== session) return;
      session.status = VerificationSetupStatus.Error;
      session.error = cause instanceof Error ? cause : new Error('安全设置失败，请稍后重试。');
      setSessionUIAAction(crypto, session, undefined);
      notifyVerificationSetup(crypto);
    }
  );

  return task;
};

const clearTerminalVerificationSetup = (
  crypto: CryptoApi | undefined,
  flow: VerificationSetupFlow
): void => {
  if (!crypto) return;
  const session = verificationSetupSessions.get(crypto);
  // A running transaction may already have written Secret Storage. It must
  // stay attached to the crypto instance until it explicitly settles.
  if (!session || session.flow !== flow || session.status === VerificationSetupStatus.Running) {
    return;
  }
  verificationSetupSessions.delete(crypto);
  notifyVerificationSetup(crypto);
};

type SetupVerificationProps = {
  flow: VerificationSetupFlow;
  onComplete: (recoveryKey: string) => void;
};
function SetupVerification({ flow, onComplete }: SetupVerificationProps) {
  const mx = useMatrixClient();
  const crypto = mx.getCrypto();
  const session = useVerificationSetupSession(crypto, flow);
  const [localError, setLocalError] = useState<Error>();
  const generatedRecoveryKey = session?.recoveryKey;
  const uiaAction = session?.uiaAction;
  const nextAuthData = session?.nextAuthData;

  useEffect(() => {
    if (session?.status === VerificationSetupStatus.Success && session.recoveryKey !== undefined) {
      onComplete(session.recoveryKey);
    }
  }, [onComplete, session?.recoveryKey, session?.status]);

  const handleAction = useCallback(
    (authDict: AuthDict) => {
      const action = session?.uiaAction;
      if (!crypto || !session || !action) {
        setLocalError(new Error('缺少身份验证上下文，请重试。'));
        return;
      }
      action
        .callback(authDict)
        .then(([authData]) => {
          if (
            authData &&
            verificationSetupSessions.get(crypto) === session &&
            session.uiaAction === action
          ) {
            session.nextAuthData = authData;
            notifyVerificationSetup(crypto);
          }
        })
        // The module-level setup task owns and displays terminal failures.
        .catch(() => undefined);
    },
    [crypto, session]
  );

  const loading = session?.status === VerificationSetupStatus.Running;
  const setupError =
    localError ?? (session?.status === VerificationSetupStatus.Error ? session.error : undefined);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (loading || session?.status === VerificationSetupStatus.Success) return;

    const target = evt.target as HTMLFormElement | undefined;
    const passphraseInput = target?.passphraseInput as HTMLInputElement | undefined;
    let passphrase: string | undefined;
    if (passphraseInput && passphraseInput.value.length > 0) {
      passphrase = passphraseInput.value;
    }

    if (!crypto) {
      setLocalError(new Error('未找到加密模块，请刷新后重试。'));
      return;
    }
    setLocalError(undefined);
    if (session?.status === VerificationSetupStatus.Error) {
      clearTerminalVerificationSetup(crypto, flow);
    }
    startVerificationSetup(mx, crypto, flow, passphrase).catch((cause: unknown) => {
      const activeSession = verificationSetupSessions.get(crypto);
      if (activeSession?.flow === flow) return;
      setLocalError(cause instanceof Error ? cause : new Error('安全设置失败，请稍后重试。'));
    });
  };

  return (
    <Box as="form" onSubmit={handleSubmit} direction="Column" gap="400">
      <Text size="T300">
        如果暂时无法访问其他已验证设备，请先生成一份<b>恢复密钥</b>用于手动验证。
        你也可以额外设置一条更容易记住的恢复口令。
      </Text>
      <Box direction="Column" gap="100">
        <Text size="L400">恢复口令（可选）</Text>
        <PasswordInput name="passphraseInput" size="400" readOnly={loading} />
      </Box>
      <Button
        type="submit"
        disabled={loading || session?.status === VerificationSetupStatus.Success}
        before={loading && <Spinner size="200" variant="Primary" fill="Solid" />}
      >
        <Text size="B400">
          {session?.status === VerificationSetupStatus.Error ? '重新尝试' : '继续'}
        </Text>
      </Button>
      {setupError && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          <b>{setupError.message}</b>
        </Text>
      )}
      {generatedRecoveryKey && (
        <Box direction="Column" gap="200">
          <Text size="T200" style={{ color: color.Warning.Main }}>
            <b>
              {session?.status === VerificationSetupStatus.Error
                ? '后续安全设置未能全部完成，但本次写入可能已经使用了下面的恢复密钥。请先保存；若重新尝试，请以最新生成的密钥为准。'
                : '安全设置正在完成。请现在保存下面的恢复密钥；你可以关闭窗口，重新打开后会继续显示并完成同一次设置。'}
            </b>
          </Text>
          <RecoveryKeyDisplay recoveryKey={generatedRecoveryKey} />
        </Box>
      )}
      {uiaAction && (
        <ActionUIAFlowsLoader
          authData={nextAuthData ?? uiaAction.authData}
          unsupported={() => <Text size="T200">当前客户端暂不支持完成这一步身份验证。</Text>}
        >
          {(ongoingFlow) => (
            <ActionUIA
              authData={nextAuthData ?? uiaAction.authData}
              ongoingFlow={ongoingFlow}
              action={handleAction}
              onCancel={uiaAction.cancelCallback}
            />
          )}
        </ActionUIAFlowsLoader>
      )}
    </Box>
  );
}

type RecoveryKeyDisplayProps = {
  recoveryKey: string;
};
function RecoveryKeyDisplay({ recoveryKey }: RecoveryKeyDisplayProps) {
  const [show, setShow] = useState(false);

  const handleCopy = () => {
    copyToClipboard(recoveryKey);
  };

  const handleDownload = async () => {
    const blob = new Blob([recoveryKey], {
      type: 'text/plain;charset=us-ascii',
    });
    await saveDownloadedFile(blob, 'recovery-key.txt');
  };

  const safeToDisplayKey = show ? recoveryKey : recoveryKey.replace(/[^\s]/g, '*');

  return (
    <Box direction="Column" gap="400">
      <Text size="T300">
        请妥善保管恢复密钥。以后如果无法访问其他已验证设备，就需要靠它来恢复身份验证。
      </Text>
      <Box direction="Column" gap="100">
        <Text size="L400">恢复密钥</Text>
        <Box
          className={ContainerColor({ variant: 'SurfaceVariant' })}
          style={{
            padding: config.space.S300,
            borderRadius: config.radii.R400,
          }}
          alignItems="Center"
          justifyContent="Center"
          gap="400"
        >
          <Text style={{ fontFamily: 'monospace' }} size="T200" priority="300">
            {safeToDisplayKey}
          </Text>
          <Chip onClick={() => setShow(!show)} variant="Secondary" radii="Pill">
            <Text size="B300">{show ? '隐藏' : '显示'}</Text>
          </Chip>
        </Box>
      </Box>
      <Box direction="Column" gap="200">
        <Button onClick={handleCopy}>
          <Text size="B400">复制</Text>
        </Button>
        <Button onClick={handleDownload} fill="Soft">
          <Text size="B400">下载</Text>
        </Button>
      </Box>
    </Box>
  );
}

type DeviceVerificationSetupProps = {
  onCancel: () => void;
};
export const DeviceVerificationSetup = forwardRef<HTMLDivElement, DeviceVerificationSetupProps>(
  ({ onCancel }, ref) => {
    const mx = useMatrixClient();
    const crypto = mx.getCrypto();
    const [recoveryKey, setRecoveryKey] = useState<string>();
    const handleCancel = useCallback(() => {
      clearTerminalVerificationSetup(crypto, VerificationSetupFlow.Enable);
      onCancel();
    }, [crypto, onCancel]);

    return (
      <Dialog ref={ref}>
        <Header
          style={{
            padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
            borderBottomWidth: config.borderWidth.B300,
          }}
          variant="Surface"
          size="500"
        >
          <Box grow="Yes">
            <Text size="H4">启用设备验证</Text>
          </Box>
          <IconButton size="300" radii="300" onClick={handleCancel}>
            <Icon src={Icons.Cross} />
          </IconButton>
        </Header>
        <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
          {recoveryKey ? (
            <RecoveryKeyDisplay recoveryKey={recoveryKey} />
          ) : (
            <SetupVerification flow={VerificationSetupFlow.Enable} onComplete={setRecoveryKey} />
          )}
        </Box>
      </Dialog>
    );
  }
);
type DeviceVerificationResetProps = {
  onCancel: () => void;
};
export const DeviceVerificationReset = forwardRef<HTMLDivElement, DeviceVerificationResetProps>(
  ({ onCancel }, ref) => {
    const mx = useMatrixClient();
    const crypto = mx.getCrypto();
    const [reset, setReset] = useState(false);
    const handleCancel = useCallback(() => {
      clearTerminalVerificationSetup(crypto, VerificationSetupFlow.Reset);
      onCancel();
    }, [crypto, onCancel]);

    return (
      <Dialog ref={ref}>
        <Header
          style={{
            padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
            borderBottomWidth: config.borderWidth.B300,
          }}
          variant="Surface"
          size="500"
        >
          <Box grow="Yes">
            <Text size="H4">重置设备验证</Text>
          </Box>
          <IconButton size="300" radii="300" onClick={handleCancel}>
            <Icon src={Icons.Cross} />
          </IconButton>
        </Header>
        {reset ? (
          <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
            <UseStateProvider initial={undefined}>
              {(recoveryKey: string | undefined, setRecoveryKey) =>
                recoveryKey ? (
                  <RecoveryKeyDisplay recoveryKey={recoveryKey} />
                ) : (
                  <SetupVerification
                    flow={VerificationSetupFlow.Reset}
                    onComplete={setRecoveryKey}
                  />
                )
              }
            </UseStateProvider>
          </Box>
        ) : (
          <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
            <Box direction="Column" gap="200">
              <Text size="H1">请谨慎操作</Text>
              <Text size="T300">重置设备验证是不可撤销的操作。</Text>
              <Text size="T300">
                你已验证过的联系人都会看到安全提醒，同时现有的加密备份也会失效。除非你已经丢失
                <b>恢复密钥</b>、<b>恢复口令</b>
                ，并且也无法使用任何已验证设备，否则通常不建议这样做。
              </Text>
            </Box>
            <Button variant="Critical" onClick={() => setReset(true)}>
              <Text size="B400">确认重置</Text>
            </Button>
          </Box>
        )}
      </Dialog>
    );
  }
);
