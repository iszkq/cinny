import React, { FormEventHandler, forwardRef, useCallback, useState } from 'react';
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
import FileSaver from 'file-saver';
import to from 'await-to-js';
import { AuthDict, IAuthData, MatrixError, UIAuthCallback } from 'matrix-js-sdk';
import { PasswordInput } from './password-input';
import { ContainerColor } from '../styles/ContainerColor.css';
import { copyToClipboard } from '../utils/dom';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { clearSecretStorageKeys } from '../../client/secretStorageKeys';
import { persistAndroidCryptoState } from '../../client/initMatrix';
import { ActionUIA, ActionUIAFlowsLoader } from './ActionUIA';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { useAlive } from '../hooks/useAlive';
import { UseStateProvider } from './UseStateProvider';

type UIACallback<T> = (
  authDict: AuthDict | null
) => Promise<[IAuthData, undefined] | [undefined, T]>;

type PerformAction<T> = (authDict: AuthDict | null) => Promise<T>;

type UIAAction<T> = {
  authData: IAuthData;
  callback: UIACallback<T>;
  cancelCallback: () => void;
};

function makeUIAAction<T>(
  authData: IAuthData,
  performAction: PerformAction<T>,
  resolve: (data: T) => void,
  reject: (error?: any) => void
): UIAAction<T> {
  const action: UIAAction<T> = {
    authData,
    callback: async (authDict) => {
      const [error, data] = await to<T, MatrixError | Error>(performAction(authDict));

      if (error instanceof MatrixError && error.httpStatus === 401) {
        return [error.data as IAuthData, undefined];
      }

      if (error) {
        reject(error);
        throw error;
      }

      resolve(data);
      return [undefined, data];
    },
    cancelCallback: reject,
  };

  return action;
}

type SetupVerificationProps = {
  onComplete: (recoveryKey: string) => void;
};
function SetupVerification({ onComplete }: SetupVerificationProps) {
  const mx = useMatrixClient();
  const alive = useAlive();

  const [uiaAction, setUIAAction] = useState<UIAAction<void>>();
  const [nextAuthData, setNextAuthData] = useState<IAuthData | null>(); // null means no next action.

  const handleAction = useCallback(
    async (authDict: AuthDict) => {
      if (!uiaAction) {
        throw new Error('身份验证数据缺失。');
      }
      if (alive()) {
        setNextAuthData(null);
      }
      const [authData] = await uiaAction.callback(authDict);

      if (alive() && authData) {
        setNextAuthData(authData);
      }
    },
    [uiaAction, alive]
  );

  const resetUIA = useCallback(() => {
    if (!alive()) return;
    setUIAAction(undefined);
    setNextAuthData(undefined);
  }, [alive]);

  const authUploadDeviceSigningKeys: UIAuthCallback<void> = useCallback(
    (makeRequest) =>
      new Promise<void>((resolve, reject) => {
        makeRequest(null)
          .then(() => {
            resolve();
            resetUIA();
          })
          .catch((error) => {
            if (error instanceof MatrixError && error.httpStatus === 401) {
              const authData = error.data as IAuthData;
              const action = makeUIAAction(
                authData,
                makeRequest as PerformAction<void>,
                resolve,
                (err) => {
                  resetUIA();
                  reject(err);
                }
              );
              if (alive()) {
                setUIAAction(action);
              } else {
                reject(new Error('身份验证失败，无法设置设备验证。'));
              }
              return;
            }
            reject(error);
          });
      }),
    [alive, resetUIA]
  );

  const [setupState, setup] = useAsyncCallback<void, Error, [string | undefined]>(
    useCallback(
      async (passphrase) => {
        const crypto = mx.getCrypto();
        if (!crypto) throw new Error('加密模块不可用。');

        const recoveryKeyData = await crypto.createRecoveryKeyFromPassphrase(passphrase);
        if (!recoveryKeyData.encodedPrivateKey) {
          throw new Error('无法创建恢复密钥。');
        }
        await clearSecretStorageKeys();

        await crypto.bootstrapSecretStorage({
          createSecretStorageKey: async () => recoveryKeyData,
          setupNewSecretStorage: true,
        });

        await crypto.bootstrapCrossSigning({
          authUploadDeviceSigningKeys,
          setupNewCrossSigning: true,
        });

        await crypto.resetKeyBackup();
        await persistAndroidCryptoState(mx, true);

        onComplete(recoveryKeyData.encodedPrivateKey);
      },
      [mx, onComplete, authUploadDeviceSigningKeys]
    )
  );

  const loading = setupState.status === AsyncStatus.Loading;

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (loading) return;

    const target = evt.target as HTMLFormElement | undefined;
    const passphraseInput = target?.passphraseInput as HTMLInputElement | undefined;
    let passphrase: string | undefined;
    if (passphraseInput && passphraseInput.value.length > 0) {
      passphrase = passphraseInput.value;
    }

    setup(passphrase);
  };

  return (
    <Box as="form" onSubmit={handleSubmit} direction="Column" gap="400">
      <Text size="T300">
        生成一份<b>恢复密钥</b>
        。当你无法使用其他设备时，可以用它验证身份；也可以设置一个更容易记住的恢复口令。
      </Text>
      <Box direction="Column" gap="100">
        <Text size="L400">恢复口令（可选）</Text>
        <PasswordInput name="passphraseInput" size="400" readOnly={loading} />
      </Box>
      <Button
        type="submit"
        disabled={loading}
        before={loading && <Spinner size="200" variant="Primary" fill="Solid" />}
      >
        <Text size="B400">继续</Text>
      </Button>
      {setupState.status === AsyncStatus.Error && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          <b>{setupState.error ? setupState.error.message : '发生未知错误。'}</b>
        </Text>
      )}
      {nextAuthData !== null && uiaAction && (
        <ActionUIAFlowsLoader
          authData={nextAuthData ?? uiaAction.authData}
          unsupported={() => <Text size="T200">客户端暂不支持完成此操作所需的身份验证步骤。</Text>}
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

  const handleDownload = () => {
    const blob = new Blob([recoveryKey], {
      type: 'text/plain;charset=us-ascii',
    });
    FileSaver.saveAs(blob, 'recovery-key.txt');
  };

  const safeToDisplayKey = show ? recoveryKey : recoveryKey.replace(/[^\s]/g, '*');

  return (
    <Box direction="Column" gap="400">
      <Text size="T300">
        请将恢复密钥妥善保存在安全位置。当你无法使用其他设备时，需要用它验证身份。
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
    const [recoveryKey, setRecoveryKey] = useState<string>();

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
            <Text size="H4">设置设备验证</Text>
          </Box>
          <IconButton size="300" radii="300" onClick={onCancel}>
            <Icon src={Icons.Cross} />
          </IconButton>
        </Header>
        <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
          {recoveryKey ? (
            <RecoveryKeyDisplay recoveryKey={recoveryKey} />
          ) : (
            <SetupVerification onComplete={setRecoveryKey} />
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
    const [reset, setReset] = useState(false);

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
          <IconButton size="300" radii="300" onClick={onCancel}>
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
                  <SetupVerification onComplete={setRecoveryKey} />
                )
              }
            </UseStateProvider>
          </Box>
        ) : (
          <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
            <Box direction="Column" gap="200">
              <Text size="H1">✋🧑‍🚒🤚</Text>
              <Text size="T300">重置设备验证是一项不可撤销的操作。</Text>
              <Text size="T300">
                已与你互相验证的联系人会看到安全警告，现有的加密备份也会失效。除非你已经丢失
                <b>恢复密钥</b>、<b>恢复口令</b>以及所有可用于验证的设备，否则请不要执行此操作。
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
