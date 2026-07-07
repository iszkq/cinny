import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Box,
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
  config,
} from 'folds';
import {
  ClientEvent,
  ClientEventHandlerMap,
  MatrixEvent,
  MatrixEventEvent,
  Room,
  RoomEvent,
  RoomEventHandlerMap,
} from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useClientConfig } from '../../hooks/useClientConfig';
import { getMemberDisplayName } from '../../utils/room';
import { createAgoraUid, buildAgoraRtcToken } from './agoraRtcToken';
import {
  AgoraClient,
  AgoraLocalAudioTrack,
  AgoraRemoteUser,
  loadAgoraRTC,
  setAgoraArea,
} from './agoraSdk';
import {
  DEFAULT_AGORA_VOICE_MONTHLY_FREE_MINUTES,
  addAgoraVoiceUsage,
  getAgoraVoiceRemainingSeconds,
} from './agoraVoiceUsage';
import * as css from './AgoraVoice.css';

const AGORA_VOICE_EVENT_TYPE = 'org.starfire.voice_call';
const AGORA_VOICE_VERSION = 1;
const QUOTA_EXHAUSTED_MESSAGE = '本月10000分钟免费额度已用完';
const RINGBACK_INTERVAL_MS = 3600;
const INCOMING_RING_INTERVAL_MS = 2600;
const SIGNAL_DISPATCH_TIMEOUT_MS = 1500;
const AGORA_TOKEN_TIMEOUT_MS = 10000;
const AGORA_SDK_LOAD_TIMEOUT_MS = 15000;
const AGORA_JOIN_TIMEOUT_MS = 20000;
const AGORA_MIC_TIMEOUT_MS = 20000;
const AGORA_PUBLISH_TIMEOUT_MS = 15000;
const AGORA_REMOTE_AUDIO_TIMEOUT_MS = 30000;

type VoiceAction = 'invite' | 'answer' | 'reject' | 'cancel' | 'hangup' | 'busy';
type RingToneKind = 'incoming' | 'outgoing';

type RingToneController = {
  stop: () => void;
};

type VoiceAudioWindow = Window & {
  webkitAudioContext?: new () => AudioContext;
};

type AgoraVoiceSignal = {
  version: 1;
  action: VoiceAction;
  callId: string;
  channel: string;
  roomId?: string;
  target: string;
  sender: string;
  createdAt: number;
  expiresAt?: number;
  reason?: string;
};

type VoiceCallPhase = 'incoming' | 'outgoing' | 'connecting' | 'active';

type VoiceCall = {
  callId: string;
  roomId: string;
  peerId: string;
  channel: string;
  direction: 'incoming' | 'outgoing';
  phase: VoiceCallPhase;
  createdAt: number;
  connectedAt?: number;
};

type AgoraSession = {
  callId: string;
  client: AgoraClient;
  localTrack: AgoraLocalAudioTrack;
  joinedAt: number;
  usageRecorded: boolean;
};

type Notice = {
  id: number;
  message: string;
};

type AgoraStepErrorCode =
  | 'token_timeout'
  | 'sdk_timeout'
  | 'join_timeout'
  | 'mic_timeout'
  | 'publish_timeout'
  | 'call_ended';

class AgoraStepError extends Error {
  public readonly code: AgoraStepErrorCode;

  public constructor(code: AgoraStepErrorCode, message: string) {
    super(message);
    this.name = 'AgoraStepError';
    this.code = code;
  }
}

type AgoraVoiceContextValue = {
  available: boolean;
  activeRoomId?: string;
  startCall: (room: Room) => Promise<void>;
};

type ToDeviceMatrixClient = {
  queueToDevice?: (batch: ToDeviceBatch) => Promise<void>;
};

type ToDeviceBatch = {
  eventType: string;
  batch: Array<{
    userId: string;
    deviceId: string;
    payload: unknown;
  }>;
};

type VoiceCryptoApi = {
  getUserDeviceInfo?: (
    userIds: string[],
    downloadUncached?: boolean
  ) => Promise<Map<string, Map<string, unknown>>>;
  encryptToDeviceMessages?: (
    eventType: string,
    devices: Array<{ userId: string; deviceId: string }>,
    payload: AgoraVoiceSignal
  ) => Promise<ToDeviceBatch>;
};

type VoiceMatrixClient = ToDeviceMatrixClient & {
  getCrypto?: () => VoiceCryptoApi | undefined;
};

const AgoraVoiceContext = createContext<AgoraVoiceContextValue>({
  available: false,
  startCall: async () => undefined,
});

const isSignalAction = (action: unknown): action is VoiceAction =>
  action === 'invite' ||
  action === 'answer' ||
  action === 'reject' ||
  action === 'cancel' ||
  action === 'hangup' ||
  action === 'busy';

const parseSignal = (mEvent: MatrixEvent): AgoraVoiceSignal | undefined => {
  if (mEvent.getType() !== AGORA_VOICE_EVENT_TYPE) return undefined;

  const content = mEvent.getContent<Partial<AgoraVoiceSignal>>();
  if (
    content.version !== AGORA_VOICE_VERSION ||
    !isSignalAction(content.action) ||
    typeof content.callId !== 'string' ||
    typeof content.channel !== 'string' ||
    typeof content.target !== 'string' ||
    typeof content.sender !== 'string' ||
    typeof content.createdAt !== 'number'
  ) {
    return undefined;
  }

  return content as AgoraVoiceSignal;
};

const getRandomPart = (): string => Math.random().toString(36).slice(2, 10);

const createCallId = (): string => `${Date.now().toString(36)}-${getRandomPart()}`;

const createChannelName = (roomId: string, callId: string): string => {
  const roomHash = createAgoraUid(roomId).toString(36);
  const callHash = createAgoraUid(callId).toString(36);
  return `sfv-${roomHash}-${callHash}-${getRandomPart()}`;
};

const isAgoraUserUid = (user: AgoraRemoteUser, uid: number): boolean =>
  String(user.uid) === String(uid);

const getDirectPeerId = (room: Room, myUserId: string): string | undefined => {
  const joinedPeer = room.getJoinedMembers().find((member) => member.userId !== myUserId);
  if (joinedPeer) return joinedPeer.userId;

  return room
    .getMembers()
    .find(
      (member) =>
        member.userId !== myUserId &&
        (member.membership === 'join' || member.membership === 'invite')
    )?.userId;
};

const formatDuration = (startedAt?: number): string => {
  if (!startedAt) return '00:00';

  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(restSeconds).padStart(2, '0')}`;
};

const waitForSignalDispatch = (signals: Array<Promise<unknown> | undefined>): Promise<void> =>
  new Promise((resolve, reject) => {
    const pendingSignals = signals.filter((signal): signal is Promise<unknown> => !!signal);
    if (pendingSignals.length === 0) {
      resolve();
      return;
    }

    let settled = false;
    let rejectedCount = 0;
    let lastError: unknown;
    let timerId: number | undefined;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timerId !== undefined) window.clearTimeout(timerId);
      callback();
    };
    timerId = window.setTimeout(() => finish(resolve), SIGNAL_DISPATCH_TIMEOUT_MS);

    pendingSignals.forEach((signal) => {
      signal
        .then(() => finish(resolve))
        .catch((error) => {
          rejectedCount += 1;
          lastError = error;
          if (rejectedCount === pendingSignals.length) {
            finish(() => reject(lastError));
          }
        });
    });
  });

const withTimeout = <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  createTimeoutError: () => Error
): Promise<T> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const timerId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(createTimeoutError());
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timerId);
        resolve(value);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timerId);
        reject(error);
      });
  });

const getAgoraConnectErrorMessage = (error: unknown): string => {
  if (error instanceof AgoraStepError) {
    if (error.code === 'token_timeout') {
      return '声网 token 生成超时，请刷新后重试';
    }
    if (error.code === 'sdk_timeout') {
      return '声网 SDK 加载超时，请检查网络后重试';
    }
    if (error.code === 'join_timeout') {
      return '语音连接超时，请检查网络后重试';
    }
    if (error.code === 'mic_timeout') {
      return '麦克风授权超时，请允许浏览器使用麦克风后重试';
    }
    if (error.code === 'publish_timeout') {
      return '麦克风音频发布超时，请重试';
    }
    if (error.code === 'call_ended') {
      return '语音通话已结束';
    }
  }

  const rtcError = error as { name?: unknown; message?: unknown; code?: unknown };
  const name = typeof rtcError?.name === 'string' ? rtcError.name : '';
  const message = typeof rtcError?.message === 'string' ? rtcError.message : '';
  const code = typeof rtcError?.code === 'string' ? rtcError.code : '';
  const detail = `${name} ${code} ${message}`;

  if (/NotAllowedError|Permission|PERMISSION|NotReadableError|DEVICE_ACCESS_DENIED/i.test(detail)) {
    return '麦克风权限被拒绝，请允许浏览器使用麦克风后重试';
  }
  if (/NotFoundError|DevicesNotFoundError|DEVICE_NOT_FOUND|not found/i.test(detail)) {
    return '没有找到可用麦克风，请检查设备后重试';
  }
  if (/token|dynamic key|CAN_NOT_GET_GATEWAY_SERVER|INVALID/i.test(detail)) {
    return '声网鉴权或连接失败，请检查 App ID/证书后重试';
  }

  return '语音连接失败，请重试';
};

const isCallEndedError = (error: unknown): boolean =>
  error instanceof AgoraStepError && error.code === 'call_ended';

const sendToDeviceSignal = async (
  mx: VoiceMatrixClient,
  target: string,
  payload: AgoraVoiceSignal
): Promise<void> => {
  if (!mx.queueToDevice) return;

  const crypto = mx.getCrypto?.();
  const targetDevices = await crypto
    ?.getUserDeviceInfo?.([target], true)
    .then((devicesByUser) => devicesByUser.get(target))
    .catch(() => undefined);
  const devices = targetDevices
    ? Array.from(targetDevices.keys()).map((deviceId) => ({ userId: target, deviceId }))
    : [];

  if (crypto?.encryptToDeviceMessages && devices.length > 0) {
    const encryptedBatch = await crypto.encryptToDeviceMessages(
      AGORA_VOICE_EVENT_TYPE,
      devices,
      payload
    );
    await mx.queueToDevice(encryptedBatch);
    return;
  }

  await mx.queueToDevice({
    eventType: AGORA_VOICE_EVENT_TYPE,
    batch: [
      {
        userId: target,
        deviceId: '*',
        payload,
      },
    ],
  });
};

const playTone = (
  audioContext: AudioContext,
  destination: AudioNode,
  frequency: number,
  startAt: number,
  duration: number,
  volume: number
) => {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.03);
  gain.gain.setValueAtTime(volume, startAt + Math.max(0.04, duration - 0.05));
  gain.gain.linearRampToValueAtTime(0, startAt + duration);

  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.05);
};

const startRingTone = (kind: RingToneKind): RingToneController | undefined => {
  const AudioContextCtor = window.AudioContext ?? (window as VoiceAudioWindow).webkitAudioContext;
  if (!AudioContextCtor) return undefined;

  const audioContext = new AudioContextCtor();
  const masterGain = audioContext.createGain();
  const timers: number[] = [];
  const intervalMs = kind === 'incoming' ? INCOMING_RING_INTERVAL_MS : RINGBACK_INTERVAL_MS;

  masterGain.gain.value = kind === 'incoming' ? 0.07 : 0.045;
  masterGain.connect(audioContext.destination);

  const playPattern = () => {
    const now = audioContext.currentTime + 0.03;

    if (kind === 'outgoing') {
      playTone(audioContext, masterGain, 440, now, 1.05, 0.52);
      playTone(audioContext, masterGain, 480, now, 1.05, 0.46);
      return;
    }

    playTone(audioContext, masterGain, 659, now, 0.24, 0.55);
    playTone(audioContext, masterGain, 784, now + 0.32, 0.24, 0.5);
    playTone(audioContext, masterGain, 659, now + 0.76, 0.24, 0.48);
    playTone(audioContext, masterGain, 784, now + 1.08, 0.24, 0.44);
  };

  void audioContext.resume().catch(() => undefined);
  playPattern();
  timers.push(window.setInterval(playPattern, intervalMs));

  return {
    stop: () => {
      timers.forEach((timerId) => window.clearInterval(timerId));
      masterGain.disconnect();
      void audioContext.close().catch(() => undefined);
    },
  };
};

type IncomingCallDialogProps = {
  peerName: string;
  onAccept: () => void;
  onReject: () => void;
};

function IncomingCallDialog({ peerName, onAccept, onReject }: IncomingCallDialogProps) {
  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <Dialog className={css.Dialog} variant="Surface">
          <Header
            variant="Surface"
            size="500"
            style={{
              padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
              borderBottomWidth: config.borderWidth.B300,
            }}
          >
            <Box grow="Yes" alignItems="Center" gap="200" style={{ minWidth: 0 }}>
              <Icon src={Icons.Phone} filled />
              <Text size="H4" truncate>
                {'语音通话'}
              </Text>
            </Box>
            <IconButton size="300" radii="300" onClick={onReject}>
              <Icon src={Icons.Cross} />
            </IconButton>
          </Header>
          <Box className={css.DialogBody} direction="Column" alignItems="Center" gap="500">
            <Box className={css.IncomingHero} direction="Column" alignItems="Center" gap="300">
              <Box className={css.CallBadge}>
                <Icon size="600" src={Icons.Phone} filled />
              </Box>
              <Text size="B400" truncate>
                {peerName}
              </Text>
              <Text size="T200" priority="300">
                {'正在邀请你语音通话'}
              </Text>
            </Box>
            <Box className={css.IncomingActions} justifyContent="Center" gap="700">
              <Box className={css.Action} direction="Column" alignItems="Center" gap="150">
                <IconButton
                  className={css.RoundAction}
                  size="500"
                  radii="Pill"
                  variant="Critical"
                  fill="Solid"
                  onClick={onReject}
                >
                  <Icon size="400" src={Icons.PhoneDown} filled />
                </IconButton>
                <Text size="L400">{'拒绝'}</Text>
              </Box>
              <Box className={css.Action} direction="Column" alignItems="Center" gap="150">
                <IconButton
                  className={css.RoundAction}
                  size="500"
                  radii="Pill"
                  variant="Success"
                  fill="Solid"
                  onClick={onAccept}
                >
                  <Icon size="400" src={Icons.Phone} filled />
                </IconButton>
                <Text size="L400">{'接听'}</Text>
              </Box>
            </Box>
          </Box>
        </Dialog>
      </OverlayCenter>
    </Overlay>
  );
}

type ActiveCallPanelProps = {
  call: VoiceCall;
  peerName: string;
  micEnabled: boolean;
  onToggleMic: () => void;
  onHangup: () => void;
};

function ActiveCallPanel({
  call,
  peerName,
  micEnabled,
  onToggleMic,
  onHangup,
}: ActiveCallPanelProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (call.phase !== 'active') return undefined;

    const timerId = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => {
      window.clearInterval(timerId);
    };
  }, [call.phase]);

  const status =
    call.phase === 'outgoing'
      ? '等待对方接听'
      : call.phase === 'connecting'
        ? '连接中'
        : formatDuration(call.connectedAt);

  return (
    <Box className={css.FloatingCall} alignItems="Center" gap="300">
      <Box grow="Yes" alignItems="Center" gap="200" style={{ minWidth: 0 }}>
        <Box className={css.FloatingBadge}>
          <Icon size="200" src={Icons.Phone} filled />
        </Box>
        <Box direction="Column" style={{ minWidth: 0 }}>
          <Text size="B400" truncate>
            {peerName}
          </Text>
          <Box alignItems="Center" gap="100">
            <Text size="T200" priority="300">
              {call.phase === 'active' ? '通话中' : status}
            </Text>
            {call.phase === 'active' && (
              <Text className={css.TimerPill} as="span" size="T200">
                {status}
              </Text>
            )}
          </Box>
        </Box>
      </Box>
      {(call.phase === 'connecting' || call.phase === 'outgoing') && <Spinner size="200" />}
      <IconButton
        size="400"
        radii="400"
        variant={micEnabled ? 'Surface' : 'Warning'}
        fill="Soft"
        outlined
        disabled={call.phase !== 'active'}
        onClick={onToggleMic}
      >
        <Icon size="300" src={micEnabled ? Icons.Mic : Icons.MicMute} filled={!micEnabled} />
      </IconButton>
      <IconButton size="400" radii="400" variant="Critical" fill="Soft" outlined onClick={onHangup}>
        <Icon size="300" src={Icons.PhoneDown} filled />
      </IconButton>
    </Box>
  );
}

type AgoraVoiceProviderProps = {
  children?: ReactNode;
};

export function AgoraVoiceProvider({ children }: AgoraVoiceProviderProps) {
  const mx = useMatrixClient();
  const { agoraVoice } = useClientConfig();
  const myUserId = mx.getSafeUserId();
  const available = Boolean(agoraVoice?.appId);
  const monthlyFreeMinutes =
    agoraVoice?.monthlyFreeMinutes ?? DEFAULT_AGORA_VOICE_MONTHLY_FREE_MINUTES;
  const timeoutMs = Math.max(10, agoraVoice?.timeoutSeconds ?? 60) * 1000;

  const [call, setCall] = useState<VoiceCall>();
  const [notice, setNotice] = useState<Notice>();
  const [micEnabled, setMicEnabled] = useState(true);
  const callRef = useRef<VoiceCall>();
  const timeoutRef = useRef<number>();
  const noticeTimeoutRef = useRef<number>();
  const ringToneRef = useRef<RingToneController>();
  const agoraSessionRef = useRef<AgoraSession>();
  const handledSignalKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  const showNotice = useCallback((message: string) => {
    setNotice({ id: Date.now(), message });
    if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = window.setTimeout(() => setNotice(undefined), 3600);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
    },
    []
  );

  const stopRingTone = useCallback(() => {
    ringToneRef.current?.stop();
    ringToneRef.current = undefined;
  }, []);

  useEffect(() => {
    stopRingTone();

    if (call?.phase === 'outgoing') {
      ringToneRef.current = startRingTone('outgoing');
      return stopRingTone;
    }

    if (call?.phase === 'incoming') {
      ringToneRef.current = startRingTone('incoming');
      return stopRingTone;
    }

    return undefined;
  }, [call?.phase, stopRingTone]);

  const showRemainingNotice = useCallback(
    (remainingSeconds: number) => {
      if (remainingSeconds <= 0) {
        showNotice(QUOTA_EXHAUSTED_MESSAGE);
        return;
      }

      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      showNotice(`本月免费语音预计还剩 ${remainingMinutes} 分钟`);
    },
    [showNotice]
  );

  const clearCallTimeout = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const updateCall = useCallback((nextCall?: VoiceCall) => {
    callRef.current = nextCall;
    setCall(nextCall);
  }, []);

  const sendSignal = useCallback(
    async (
      roomId: string,
      target: string,
      signal: Omit<AgoraVoiceSignal, 'version' | 'roomId' | 'target' | 'sender' | 'createdAt'>
    ) => {
      const content: AgoraVoiceSignal = {
        version: AGORA_VOICE_VERSION,
        target,
        sender: myUserId,
        createdAt: Date.now(),
        ...signal,
      };

      const deviceSignal = sendToDeviceSignal(mx as VoiceMatrixClient, target, {
        ...content,
        roomId,
      });
      void deviceSignal?.catch(() => undefined);
      const roomSignal = mx.sendEvent(roomId, AGORA_VOICE_EVENT_TYPE as never, content as never);
      void roomSignal.catch(() => undefined);

      await waitForSignalDispatch([deviceSignal, roomSignal]);
    },
    [mx, myUserId]
  );

  const recordUsage = useCallback(
    (session: AgoraSession) => {
      if (session.usageRecorded) return;

      const seconds = Math.max(1, Math.ceil((Date.now() - session.joinedAt) / 1000));
      session.usageRecorded = true;
      const remainingSeconds = addAgoraVoiceUsage(myUserId, seconds, monthlyFreeMinutes);
      showRemainingNotice(remainingSeconds);
    },
    [monthlyFreeMinutes, myUserId, showRemainingNotice]
  );

  const leaveAgora = useCallback(
    async (callId?: string, shouldRecordUsage = true) => {
      const session = agoraSessionRef.current;
      if (!session || (callId && session.callId !== callId)) return;

      agoraSessionRef.current = undefined;
      if (shouldRecordUsage) recordUsage(session);

      session.client.removeAllListeners?.();
      session.localTrack.close();
      await session.client.leave().catch(() => undefined);
      setMicEnabled(true);
    },
    [recordUsage]
  );

  const finishCall = useCallback(
    (message?: string, shouldRecordUsage = true) => {
      const currentCall = callRef.current;
      clearCallTimeout();
      updateCall(undefined);

      if (currentCall) {
        void leaveAgora(currentCall.callId, shouldRecordUsage);
      }
      if (message) showNotice(message);
    },
    [clearCallTimeout, leaveAgora, showNotice, updateCall]
  );

  const armCallTimeout = useCallback(
    (voiceCall: VoiceCall, onTimeout: () => void) => {
      clearCallTimeout();
      timeoutRef.current = window.setTimeout(() => {
        if (callRef.current?.callId === voiceCall.callId) {
          onTimeout();
        }
      }, timeoutMs);
    },
    [clearCallTimeout, timeoutMs]
  );

  const markCallActive = useCallback(
    (voiceCall: VoiceCall) => {
      const currentCall = callRef.current;
      if (!currentCall || currentCall.callId !== voiceCall.callId) return;

      clearCallTimeout();
      updateCall({
        ...currentCall,
        phase: 'active',
        connectedAt: currentCall.connectedAt ?? Date.now(),
      });
    },
    [clearCallTimeout, updateCall]
  );

  const armRemoteAudioTimeout = useCallback(
    (voiceCall: VoiceCall) => {
      clearCallTimeout();
      timeoutRef.current = window.setTimeout(() => {
        const currentCall = callRef.current;
        if (
          !currentCall ||
          currentCall.callId !== voiceCall.callId ||
          currentCall.phase !== 'connecting'
        ) {
          return;
        }

        void sendSignal(currentCall.roomId, currentCall.peerId, {
          action: 'hangup',
          callId: currentCall.callId,
          channel: currentCall.channel,
          reason: 'connect_failed',
        }).catch(() => undefined);
        finishCall('语音连接超时，请重试', false);
      }, AGORA_REMOTE_AUDIO_TIMEOUT_MS);
    },
    [clearCallTimeout, finishCall, sendSignal]
  );

  const joinAgora = useCallback(
    async (voiceCall: VoiceCall) => {
      const { appId, appCertificate, area } = agoraVoice ?? {};
      if (!appId) throw new Error('声网 App ID 未配置。');

      const uid = createAgoraUid(myUserId);
      const peerUid = createAgoraUid(voiceCall.peerId);
      const token = appCertificate
        ? await withTimeout(
            buildAgoraRtcToken(appId, appCertificate, voiceCall.channel, uid),
            AGORA_TOKEN_TIMEOUT_MS,
            () => new AgoraStepError('token_timeout', 'Agora token generation timed out.')
          )
        : null;
      const AgoraRTC = await withTimeout(
        loadAgoraRTC(),
        AGORA_SDK_LOAD_TIMEOUT_MS,
        () => new AgoraStepError('sdk_timeout', 'Agora SDK load timed out.')
      );
      setAgoraArea(AgoraRTC, area);

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      let localTrack: AgoraLocalAudioTrack | undefined;
      let joined = false;
      let remoteAudioReady = false;

      try {
        client.on('user-published', (user, mediaType) => {
          if (mediaType !== 'audio' || !isAgoraUserUid(user, peerUid)) return;

          void client
            .subscribe(user, 'audio')
            .then(() => {
              remoteAudioReady = true;
              user.audioTrack?.play();
              markCallActive(voiceCall);
            })
            .catch(() => undefined);
        });
        client.on('user-left', (user?: AgoraRemoteUser) => {
          if (user && !isAgoraUserUid(user, peerUid)) return;

          const currentCall = callRef.current;
          if (currentCall?.callId === voiceCall.callId) {
            finishCall(undefined, currentCall.phase === 'active');
          }
        });

        await withTimeout(
          client.join(appId, voiceCall.channel, token, uid),
          AGORA_JOIN_TIMEOUT_MS,
          () => new AgoraStepError('join_timeout', 'Agora channel join timed out.')
        );
        joined = true;
        localTrack = await withTimeout(
          AgoraRTC.createMicrophoneAudioTrack(),
          AGORA_MIC_TIMEOUT_MS,
          () => new AgoraStepError('mic_timeout', 'Agora microphone creation timed out.')
        );
        await withTimeout(
          client.publish([localTrack]),
          AGORA_PUBLISH_TIMEOUT_MS,
          () => new AgoraStepError('publish_timeout', 'Agora audio publish timed out.')
        );
        if (callRef.current?.callId !== voiceCall.callId) {
          throw new AgoraStepError('call_ended', 'Call ended before Agora join completed.');
        }

        agoraSessionRef.current = {
          callId: voiceCall.callId,
          client,
          localTrack,
          joinedAt: Date.now(),
          usageRecorded: false,
        };
        setMicEnabled(true);
        if (remoteAudioReady) {
          markCallActive(voiceCall);
        } else {
          updateCall({
            ...voiceCall,
            phase: 'connecting',
            connectedAt: undefined,
          });
          armRemoteAudioTimeout(voiceCall);
        }
      } catch (error) {
        client.removeAllListeners?.();
        localTrack?.close();
        if (joined) {
          await client.leave().catch(() => undefined);
        }
        throw error;
      }
    },
    [agoraVoice, armRemoteAudioTimeout, finishCall, markCallActive, myUserId, updateCall]
  );

  const rejectIncomingCall = useCallback(async () => {
    const currentCall = callRef.current;
    if (!currentCall || currentCall.phase !== 'incoming') return;

    await sendSignal(currentCall.roomId, currentCall.peerId, {
      action: 'reject',
      callId: currentCall.callId,
      channel: currentCall.channel,
    }).catch(() => undefined);
    finishCall(undefined, false);
  }, [finishCall, sendSignal]);

  const acceptIncomingCall = useCallback(async () => {
    const currentCall = callRef.current;
    if (!currentCall || currentCall.phase !== 'incoming') return;

    clearCallTimeout();
    const connectingCall: VoiceCall = {
      ...currentCall,
      phase: 'connecting',
    };
    updateCall(connectingCall);

    let joined = false;

    try {
      await joinAgora(connectingCall);
      joined = true;
      await sendSignal(currentCall.roomId, currentCall.peerId, {
        action: 'answer',
        callId: currentCall.callId,
        channel: currentCall.channel,
      });
    } catch (error) {
      if (isCallEndedError(error)) return;

      await sendSignal(currentCall.roomId, currentCall.peerId, {
        action: joined ? 'hangup' : 'reject',
        callId: currentCall.callId,
        channel: currentCall.channel,
        reason: 'connect_failed',
      }).catch(() => undefined);
      finishCall(getAgoraConnectErrorMessage(error), false);
    }
  }, [clearCallTimeout, finishCall, joinAgora, sendSignal, updateCall]);

  const hangupCall = useCallback(async () => {
    const currentCall = callRef.current;
    if (!currentCall) return;

    const actions: VoiceAction[] =
      currentCall.phase === 'incoming'
        ? ['reject']
        : currentCall.phase === 'outgoing'
          ? ['cancel', 'hangup']
          : currentCall.phase === 'connecting'
            ? ['hangup', 'cancel']
            : ['hangup'];

    await Promise.all(
      actions.map((action) =>
        sendSignal(currentCall.roomId, currentCall.peerId, {
          action,
          callId: currentCall.callId,
          channel: currentCall.channel,
        }).catch(() => undefined)
      )
    );
    finishCall(undefined, currentCall.phase === 'active');
  }, [finishCall, sendSignal]);

  const toggleMic = useCallback(() => {
    const session = agoraSessionRef.current;
    if (!session) return;

    const nextEnabled = !micEnabled;
    setMicEnabled(nextEnabled);
    void session.localTrack.setEnabled(nextEnabled).catch(() => {
      setMicEnabled(!nextEnabled);
    });
  }, [micEnabled]);

  const handleSignal = useCallback(
    (mEvent: MatrixEvent, room?: Room) => {
      if (!room) return;

      const signal = parseSignal(mEvent);
      const sender = mEvent.getSender();
      if (!signal || !sender || sender === myUserId || signal.target !== myUserId) return;

      const signalKey =
        mEvent.getId() ?? `${room.roomId}:${signal.callId}:${signal.action}:${sender}`;
      if (handledSignalKeysRef.current.has(signalKey)) return;
      handledSignalKeysRef.current.add(signalKey);
      if (handledSignalKeysRef.current.size > 200) {
        const [oldestSignalKey] = handledSignalKeysRef.current;
        handledSignalKeysRef.current.delete(oldestSignalKey);
      }

      if (signal.action === 'invite') {
        if (typeof signal.expiresAt === 'number' && Date.now() > signal.expiresAt) return;

        const peerId = getDirectPeerId(room, myUserId);
        if (peerId !== sender) return;

        if (getAgoraVoiceRemainingSeconds(myUserId, monthlyFreeMinutes) <= 0) {
          void sendSignal(room.roomId, sender, {
            action: 'reject',
            callId: signal.callId,
            channel: signal.channel,
            reason: 'quota',
          }).catch(() => undefined);
          return;
        }

        const currentCall = callRef.current;
        if (currentCall && currentCall.peerId === sender && currentCall.phase !== 'active') {
          finishCall(undefined, false);
        } else if (currentCall) {
          void sendSignal(room.roomId, sender, {
            action: 'busy',
            callId: signal.callId,
            channel: signal.channel,
          }).catch(() => undefined);
          return;
        }

        const incomingCall: VoiceCall = {
          callId: signal.callId,
          roomId: room.roomId,
          peerId: sender,
          channel: signal.channel,
          direction: 'incoming',
          phase: 'incoming',
          createdAt: signal.createdAt,
        };
        updateCall(incomingCall);
        armCallTimeout(incomingCall, () => {
          void sendSignal(room.roomId, sender, {
            action: 'reject',
            callId: signal.callId,
            channel: signal.channel,
            reason: 'timeout',
          }).catch(() => undefined);
          finishCall(undefined, false);
        });
        return;
      }

      const currentCall = callRef.current;
      if (!currentCall || currentCall.callId !== signal.callId) return;

      if (signal.action === 'answer' && currentCall.phase === 'outgoing') {
        clearCallTimeout();
        const connectingCall: VoiceCall = {
          ...currentCall,
          phase: 'connecting',
        };
        updateCall(connectingCall);
        void joinAgora(connectingCall).catch(async (error) => {
          if (isCallEndedError(error)) return;

          await sendSignal(currentCall.roomId, currentCall.peerId, {
            action: 'hangup',
            callId: currentCall.callId,
            channel: currentCall.channel,
            reason: 'connect_failed',
          }).catch(() => undefined);
          finishCall(getAgoraConnectErrorMessage(error), false);
        });
        return;
      }

      if (signal.action === 'reject' || signal.action === 'busy') {
        const message =
          signal.reason === 'timeout'
            ? '对方未接听'
            : signal.reason === 'quota'
              ? QUOTA_EXHAUSTED_MESSAGE
              : signal.reason === 'connect_failed'
                ? '对方语音连接失败'
                : signal.action === 'busy'
                  ? '对方正在通话中'
                  : '对方已拒绝';
        finishCall(message, false);
        return;
      }

      if (signal.action === 'cancel') {
        finishCall(undefined, false);
        return;
      }

      if (signal.action === 'hangup') {
        const failedToConnect = signal.reason === 'connect_failed';
        finishCall(failedToConnect ? '对方语音连接失败' : undefined, !failedToConnect);
      }
    },
    [
      armCallTimeout,
      clearCallTimeout,
      finishCall,
      joinAgora,
      monthlyFreeMinutes,
      myUserId,
      sendSignal,
      updateCall,
    ]
  );

  useEffect(() => {
    const handlePossiblyEncryptedSignal = (mEvent: MatrixEvent, room?: Room) => {
      handleSignal(mEvent, room);
      if (room && mEvent.isEncrypted() && mEvent.getType() !== AGORA_VOICE_EVENT_TYPE) {
        void mx
          .decryptEventIfNeeded(mEvent)
          .then(() => handleSignal(mEvent, room))
          .catch(() => undefined);
      }
    };

    const handleDecrypted = (mEvent: MatrixEvent) => {
      if (mEvent.isDecryptionFailure()) return;

      const roomId = mEvent.getRoomId();
      if (!roomId) return;

      const room = mx.getRoom(roomId);
      if (!room) return;

      handleSignal(mEvent, room);
    };

    const handleClientEvent: ClientEventHandlerMap[ClientEvent.Event] = (mEvent) => {
      const roomId = mEvent.getRoomId();
      if (!roomId) return;

      const room = mx.getRoom(roomId);
      if (!room) return;

      handlePossiblyEncryptedSignal(mEvent, room);
    };

    const handleToDeviceEvent: ClientEventHandlerMap[ClientEvent.ToDeviceEvent] = (mEvent) => {
      const handleDecryptedToDeviceSignal = () => {
        const signal = parseSignal(mEvent);
        if (!signal || signal.target !== myUserId || typeof signal.roomId !== 'string') return;

        const room = mx.getRoom(signal.roomId);
        if (!room) return;

        handleSignal(mEvent, room);
      };

      if (mEvent.isEncrypted() && mEvent.getType() !== AGORA_VOICE_EVENT_TYPE) {
        void mx
          .decryptEventIfNeeded(mEvent)
          .then(handleDecryptedToDeviceSignal)
          .catch(() => undefined);
        return;
      }

      handleDecryptedToDeviceSignal();
    };

    const handleTimelineEvent: RoomEventHandlerMap[RoomEvent.Timeline] = (
      mEvent,
      room,
      toStartOfTimeline,
      removed,
      data
    ) => {
      if (toStartOfTimeline || removed || !data.liveEvent) return;

      handlePossiblyEncryptedSignal(mEvent, room);
    };

    mx.on(ClientEvent.Event, handleClientEvent);
    mx.on(ClientEvent.ToDeviceEvent, handleToDeviceEvent);
    mx.on(RoomEvent.Timeline, handleTimelineEvent);
    mx.on(MatrixEventEvent.Decrypted, handleDecrypted);
    return () => {
      mx.off(ClientEvent.Event, handleClientEvent);
      mx.off(ClientEvent.ToDeviceEvent, handleToDeviceEvent);
      mx.removeListener(RoomEvent.Timeline, handleTimelineEvent);
      mx.off(MatrixEventEvent.Decrypted, handleDecrypted);
    };
  }, [handleSignal, mx]);

  useEffect(
    () => () => {
      clearCallTimeout();
      void leaveAgora(callRef.current?.callId, true);
    },
    [clearCallTimeout, leaveAgora]
  );

  const startCall = useCallback(
    async (room: Room) => {
      if (!available || !agoraVoice?.appId) {
        showNotice('语音通话未配置');
        return;
      }

      if (getAgoraVoiceRemainingSeconds(myUserId, monthlyFreeMinutes) <= 0) {
        showNotice(QUOTA_EXHAUSTED_MESSAGE);
        return;
      }

      if (callRef.current) {
        showNotice('当前已有语音通话');
        return;
      }

      const peerId = getDirectPeerId(room, myUserId);
      if (!peerId) {
        showNotice('未找到可呼叫的私聊对象');
        return;
      }

      const callId = createCallId();
      const channel = createChannelName(room.roomId, callId);
      const outgoingCall: VoiceCall = {
        callId,
        roomId: room.roomId,
        peerId,
        channel,
        direction: 'outgoing',
        phase: 'outgoing',
        createdAt: Date.now(),
      };

      updateCall(outgoingCall);
      try {
        await sendSignal(room.roomId, peerId, {
          action: 'invite',
          callId,
          channel,
          expiresAt: Date.now() + timeoutMs,
        });
        armCallTimeout(outgoingCall, () => {
          void sendSignal(room.roomId, peerId, {
            action: 'cancel',
            callId,
            channel,
            reason: 'timeout',
          }).catch(() => undefined);
          finishCall('对方未接听', false);
        });
      } catch {
        finishCall('发起语音通话失败，请重试', false);
      }
    },
    [
      agoraVoice?.appId,
      armCallTimeout,
      available,
      finishCall,
      monthlyFreeMinutes,
      myUserId,
      sendSignal,
      showNotice,
      timeoutMs,
      updateCall,
    ]
  );

  const value = useMemo<AgoraVoiceContextValue>(
    () => ({
      available,
      activeRoomId: call?.roomId,
      startCall,
    }),
    [available, call?.roomId, startCall]
  );

  const callRoom = call ? mx.getRoom(call.roomId) : undefined;
  const peerName =
    call && callRoom ? getMemberDisplayName(callRoom, call.peerId) ?? call.peerId : call?.peerId;

  return (
    <AgoraVoiceContext.Provider value={value}>
      {children}
      {call?.phase === 'incoming' && peerName && (
        <IncomingCallDialog
          peerName={peerName}
          onAccept={() => void acceptIncomingCall()}
          onReject={() => void rejectIncomingCall()}
        />
      )}
      {call && call.phase !== 'incoming' && peerName && (
        <ActiveCallPanel
          call={call}
          peerName={peerName}
          micEnabled={micEnabled}
          onToggleMic={toggleMic}
          onHangup={() => void hangupCall()}
        />
      )}
      {!call && notice && (
        <Box className={css.Toast} alignItems="Center" gap="200">
          <Icon size="100" src={Icons.Info} />
          <Text size="T200">{notice.message}</Text>
        </Box>
      )}
    </AgoraVoiceContext.Provider>
  );
}

export function useAgoraVoice(): AgoraVoiceContextValue {
  return useContext(AgoraVoiceContext);
}
