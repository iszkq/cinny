import {
  CryptoEvent,
  ShowSasCallbacks,
  VerificationPhase,
  VerificationRequest,
  Verifier,
} from 'matrix-js-sdk/lib/crypto-api';
import React, { CSSProperties, useCallback, useEffect, useState } from 'react';
import { VerificationMethod } from 'matrix-js-sdk/lib/types';
import {
  Box,
  Button,
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
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import {
  useVerificationRequestPhase,
  useVerificationRequestReceived,
  useVerifierShowSas,
} from '../hooks/useVerificationRequest';
import { AsyncState, AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { ContainerColor } from '../styles/ContainerColor.css';
import { useMatrixClient } from '../hooks/useMatrixClient';
import {
  CompletedDeviceVerificationResult,
  persistCompletedDeviceVerification,
} from '../utils/matrix-crypto';

const DialogHeaderStyles: CSSProperties = {
  padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
  borderBottomWidth: config.borderWidth.B300,
};

type WaitingMessageProps = {
  message: string;
};
function WaitingMessage({ message }: WaitingMessageProps) {
  return (
    <Box alignItems="Center" gap="200">
      <Spinner variant="Secondary" size="200" />
      <Text size="T300">{message}</Text>
    </Box>
  );
}

type VerificationUnexpectedProps = { message: string; onClose: () => void };
function VerificationUnexpected({ message, onClose }: VerificationUnexpectedProps) {
  return (
    <Box direction="Column" gap="400">
      <Text>{message}</Text>
      <Button variant="Secondary" fill="Soft" onClick={onClose}>
        <Text size="B400">关闭</Text>
      </Button>
    </Box>
  );
}

function VerificationWaitAccept() {
  return (
    <Box direction="Column" gap="400">
      <Text>请在另一台设备上接受验证请求。</Text>
      <Text size="T200">
        这里正在验证另一台设备，必须由目标设备接受；恢复密钥只用于恢复当前设备和加密备份。
      </Text>
      <WaitingMessage message="正在等待另一台设备接受验证请求..." />
    </Box>
  );
}

type VerificationAcceptProps = {
  onAccept: () => Promise<void>;
};
function VerificationAccept({ onAccept }: VerificationAcceptProps) {
  const [acceptState, accept] = useAsyncCallback<void, Error, []>(onAccept);

  const accepting = acceptState.status === AsyncStatus.Loading;
  return (
    <Box direction="Column" gap="400">
      <Text>点击“接受”开始设备验证。</Text>
      <Button
        variant="Primary"
        fill="Solid"
        onClick={() => {
          accept().catch(() => undefined);
        }}
        before={accepting && <Spinner size="100" variant="Primary" fill="Solid" />}
        disabled={accepting}
      >
        <Text size="B400">接受</Text>
      </Button>
      {acceptState.status === AsyncStatus.Error && (
        <Text size="T200">接受验证请求失败：{acceptState.error.message}</Text>
      )}
    </Box>
  );
}

function VerificationWaitStart() {
  return (
    <Box direction="Column" gap="400">
      <Text>验证请求已被接受。</Text>
      <WaitingMessage message="正在等待另一台设备继续响应..." />
    </Box>
  );
}

type VerificationStartProps = {
  onStart: () => Promise<void>;
};
function AutoVerificationStart({ onStart }: VerificationStartProps) {
  const [startState, start] = useAsyncCallback<void, Error, []>(onStart);

  useEffect(() => {
    start().catch(() => undefined);
  }, [start]);

  if (startState.status === AsyncStatus.Error) {
    return (
      <Box direction="Column" gap="400">
        <Text>启动设备验证失败：{startState.error.message}</Text>
        <Button
          variant="Primary"
          fill="Soft"
          onClick={() => {
            start().catch(() => undefined);
          }}
        >
          <Text size="B400">重试</Text>
        </Button>
      </Box>
    );
  }

  return (
    <Box direction="Column" gap="400">
      <WaitingMessage message="正在启动表情比对验证..." />
    </Box>
  );
}

function CompareEmoji({ sasData }: { sasData: ShowSasCallbacks }) {
  const [confirmState, confirm] = useAsyncCallback<void, Error, []>(
    useCallback(() => sasData.confirm(), [sasData])
  );

  const confirming =
    confirmState.status === AsyncStatus.Loading || confirmState.status === AsyncStatus.Success;

  return (
    <Box direction="Column" gap="400">
      <Text>请确认两台设备上显示的表情和顺序完全一致：</Text>
      <Box
        className={ContainerColor({ variant: 'SurfaceVariant' })}
        style={{
          borderRadius: config.radii.R400,
          padding: config.space.S500,
        }}
        gap="700"
        wrap="Wrap"
        justifyContent="Center"
      >
        {sasData.sas.emoji?.map(([emoji, name], index) => (
          <Box
            // eslint-disable-next-line react/no-array-index-key
            key={`${emoji}${name}${index}`}
            direction="Column"
            gap="100"
            justifyContent="Center"
            alignItems="Center"
          >
            <Text size="H1">{emoji}</Text>
            <Text size="T200">{name}</Text>
          </Box>
        ))}
      </Box>
      <Box direction="Column" gap="200">
        <Button
          variant="Primary"
          fill="Soft"
          onClick={() => {
            confirm().catch(() => undefined);
          }}
          disabled={confirming}
          before={confirming && <Spinner size="100" variant="Primary" />}
        >
          <Text size="B400">一致</Text>
        </Button>
        {confirmState.status === AsyncStatus.Error && (
          <Text size="T200">确认失败：{confirmState.error.message}</Text>
        )}
        <Button
          variant="Primary"
          fill="Soft"
          onClick={() => sasData.mismatch()}
          disabled={confirming}
        >
          <Text size="B400">不一致</Text>
        </Button>
      </Box>
    </Box>
  );
}

type SasVerificationProps = {
  verifier: Verifier;
};
function SasVerification({ verifier }: SasVerificationProps) {
  const [sasData, setSasData] = useState<ShowSasCallbacks>();

  useVerifierShowSas(verifier, setSasData);

  useEffect(() => {
    // Cancellation is already reflected by VerificationRequest.phase. Do not
    // call request.cancel() again from the verifier rejection: during SAS
    // tie-breaking or final synchronization that can cancel the winning flow.
    verifier.verify().catch(() => undefined);
  }, [verifier]);

  if (sasData) {
    return <CompareEmoji sasData={sasData} />;
  }

  return (
    <Box direction="Column" gap="400">
      <WaitingMessage message="正在启动表情比对验证..." />
    </Box>
  );
}

type VerificationDoneProps = {
  state: AsyncState<CompletedDeviceVerificationResult, Error>;
  onRetry: () => void;
  onExit: () => void;
};
function VerificationDone({ state, onRetry, onExit }: VerificationDoneProps) {
  if (state.status === AsyncStatus.Idle || state.status === AsyncStatus.Loading) {
    return (
      <Box direction="Column" gap="400">
        <WaitingMessage message="表情验证已通过，正在保存设备可信状态..." />
        <Text size="T200">可关闭此窗口，可信状态仍会在后台继续保存。</Text>
      </Box>
    );
  }

  if (state.status === AsyncStatus.Error) {
    return (
      <Box direction="Column" gap="400">
        <Text>表情验证已通过，但设备可信状态保存失败。</Text>
        <Text size="T200">{state.error.message}</Text>
        <Button variant="Primary" fill="Solid" onClick={onRetry}>
          <Text size="B400">重新保存</Text>
        </Button>
      </Box>
    );
  }

  return (
    <Box direction="Column" gap="400">
      <div>
        <Text>设备验证已完成，可信状态已保存。</Text>
      </div>
      {!state.data.crossSigningSynced && (
        <Text size="T200">本机可信状态已保存；跨设备签名会在加密数据同步后自动补齐。</Text>
      )}
      <Button variant="Primary" fill="Solid" onClick={onExit}>
        <Text size="B400">完成</Text>
      </Button>
    </Box>
  );
}

type VerificationCanceledProps = {
  request: VerificationRequest;
  onClose: () => void;
};
function VerificationCanceled({ request, onClose }: VerificationCanceledProps) {
  const message = (() => {
    if (request.cancellationCode === 'm.accepted') {
      return '此请求已由另一台设备或另一个验证窗口接管，请在仍在进行的验证窗口中完成操作。';
    }
    if (request.cancellationCode === 'm.timeout') {
      return '设备验证已超时。请保持两台设备在线并重新发起验证。';
    }
    if (request.cancellationCode === 'm.mismatched_sas') {
      return '两台设备确认的表情不一致，验证已安全取消。';
    }
    return '设备验证已取消，本次请求没有写入任何错误的可信状态。';
  })();

  return (
    <Box direction="Column" gap="400">
      <Text>{message}</Text>
      <Button variant="Secondary" fill="Soft" onClick={onClose}>
        <Text size="B400">关闭</Text>
      </Button>
    </Box>
  );
}

type DeviceVerificationProps = {
  request: VerificationRequest;
  onExit: () => void;
};
export function DeviceVerification({ request, onExit }: DeviceVerificationProps) {
  const mx = useMatrixClient();
  const phase = useVerificationRequestPhase(request);

  const persistVerification = useCallback(async () => {
    const crypto = mx.getCrypto();
    if (!crypto) {
      throw new Error('未找到加密模块，请重新打开应用后重试。');
    }

    const result = await persistCompletedDeviceVerification(
      crypto,
      request,
      mx.getDeviceId() ?? undefined
    );
    mx.emit(CryptoEvent.DevicesUpdated, [request.otherUserId], false);
    return result;
  }, [mx, request]);
  const [persistState, runPersistVerification] = useAsyncCallback<
    CompletedDeviceVerificationResult,
    Error,
    []
  >(persistVerification);

  useEffect(() => {
    if (phase === VerificationPhase.Done && persistState.status === AsyncStatus.Idle) {
      runPersistVerification().catch(() => undefined);
    }
  }, [phase, persistState.status, runPersistVerification]);

  const handleCancel = useCallback(() => {
    if (request.phase !== VerificationPhase.Done && request.phase !== VerificationPhase.Cancelled) {
      request.cancel();
    }
    onExit();
  }, [request, onExit]);

  const handleAccept = useCallback(() => request.accept(), [request]);
  const handleStart = useCallback(async () => {
    await request.startVerification(VerificationMethod.Sas);
  }, [request]);

  const handleDone = useCallback(() => onExit(), [onExit]);

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: false,
            escapeDeactivates: false,
          }}
        >
          <Dialog variant="Surface">
            <Header style={DialogHeaderStyles} variant="Surface" size="500">
              <Box grow="Yes">
                <Text size="H4">设备验证</Text>
              </Box>
              <IconButton size="300" radii="300" onClick={handleCancel}>
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              {phase === VerificationPhase.Requested &&
                (request.initiatedByMe ? (
                  <VerificationWaitAccept />
                ) : (
                  <VerificationAccept onAccept={handleAccept} />
                ))}
              {phase === VerificationPhase.Ready &&
                (request.initiatedByMe ? (
                  <AutoVerificationStart onStart={handleStart} />
                ) : (
                  <VerificationWaitStart />
                ))}
              {phase === VerificationPhase.Started &&
                (request.verifier ? (
                  <SasVerification verifier={request.verifier} />
                ) : (
                  <VerificationUnexpected
                    message="验证流程出现异常：验证已开始，但缺少验证器。"
                    onClose={handleCancel}
                  />
                ))}
              {phase === VerificationPhase.Done && (
                <VerificationDone
                  state={persistState}
                  onRetry={() => {
                    runPersistVerification().catch(() => undefined);
                  }}
                  onExit={handleDone}
                />
              )}
              {phase === VerificationPhase.Cancelled && (
                <VerificationCanceled request={request} onClose={handleCancel} />
              )}
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

export function ReceiveSelfDeviceVerification() {
  const [request, setRequest] = useState<VerificationRequest>();

  useVerificationRequestReceived(setRequest);

  const handleExit = useCallback(() => {
    setRequest(undefined);
  }, []);

  if (!request) return null;

  if (!request.isSelfVerification) {
    return null;
  }

  return <DeviceVerification request={request} onExit={handleExit} />;
}
