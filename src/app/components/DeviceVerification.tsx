import {
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
  useVerifierCancel,
  useVerifierShowSas,
} from '../hooks/useVerificationRequest';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { ContainerColor } from '../styles/ContainerColor.css';

const DialogHeaderStyles: CSSProperties = {
  padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
  borderBottomWidth: config.borderWidth.B300,
};

const SAS_EMOJI_NAME_CN: Record<string, string> = {
  Dog: '狗',
  Cat: '猫',
  Lion: '狮子',
  Horse: '马',
  Unicorn: '独角兽',
  Pig: '猪',
  Elephant: '大象',
  Rabbit: '兔子',
  Panda: '熊猫',
  Rooster: '公鸡',
  Penguin: '企鹅',
  Turtle: '乌龟',
  Fish: '鱼',
  Octopus: '章鱼',
  Butterfly: '蝴蝶',
  Flower: '花',
  Tree: '树',
  Cactus: '仙人掌',
  Mushroom: '蘑菇',
  Globe: '地球',
  Moon: '月亮',
  Sun: '太阳',
  Cloud: '云',
  Fire: '火',
  Banana: '香蕉',
  Apple: '苹果',
  Strawberry: '草莓',
  Corn: '玉米',
  Pizza: '披萨',
  Cake: '蛋糕',
  Heart: '爱心',
  Smiley: '笑脸',
  Robot: '机器人',
  Hat: '帽子',
  Glasses: '眼镜',
  Spanner: '扳手',
  Santa: '圣诞老人',
  ThumbsUp: '点赞',
  Umbrella: '雨伞',
  Hourglass: '沙漏',
  Clock: '时钟',
  Gift: '礼物',
  LightBulb: '灯泡',
  Book: '书',
  Pencil: '铅笔',
  Paperclip: '回形针',
  Scissors: '剪刀',
  Lock: '锁',
  Key: '钥匙',
  Hammer: '锤子',
  Telephone: '电话',
  Flag: '旗帜',
  Train: '火车',
  Bicycle: '自行车',
  Aeroplane: '飞机',
  Rocket: '火箭',
  Trophy: '奖杯',
  Ball: '球',
  Guitar: '吉他',
  Trumpet: '小号',
  Bell: '铃铛',
  Anchor: '船锚',
  Headphones: '耳机',
  Folder: '文件夹',
  Pin: '图钉',
};

const translateSasEmojiName = (name: string): string =>
  SAS_EMOJI_NAME_CN[name.replace(/[\s_-]/g, '')] ?? name;

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
      <WaitingMessage message="正在等待另一台设备接受请求……" />
    </Box>
  );
}

type VerificationAcceptProps = {
  onAccept: () => Promise<void>;
};
function VerificationAccept({ onAccept }: VerificationAcceptProps) {
  const [acceptState, accept] = useAsyncCallback(onAccept);

  const accepting = acceptState.status === AsyncStatus.Loading;
  return (
    <Box direction="Column" gap="400">
      <Text>点击“接受”开始验证。</Text>
      <Button
        variant="Primary"
        fill="Solid"
        onClick={accept}
        before={accepting && <Spinner size="100" variant="Primary" fill="Solid" />}
        disabled={accepting}
      >
        <Text size="B400">接受</Text>
      </Button>
    </Box>
  );
}

function VerificationWaitStart() {
  return (
    <Box direction="Column" gap="400">
      <Text>验证请求已接受。</Text>
      <WaitingMessage message="正在等待另一台设备响应……" />
    </Box>
  );
}

type VerificationStartProps = {
  onStart: () => Promise<void>;
};
function AutoVerificationStart({ onStart }: VerificationStartProps) {
  useEffect(() => {
    onStart();
  }, [onStart]);

  return (
    <Box direction="Column" gap="400">
      <WaitingMessage message="正在启动表情符号对比验证……" />
    </Box>
  );
}

function CompareEmoji({ sasData }: { sasData: ShowSasCallbacks }) {
  const [confirmState, confirm] = useAsyncCallback(useCallback(() => sasData.confirm(), [sasData]));

  const confirming =
    confirmState.status === AsyncStatus.Loading || confirmState.status === AsyncStatus.Success;

  return (
    <Box direction="Column" gap="400">
      <Text>请确认两台设备显示的表情符号及顺序完全一致：</Text>
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
            <Text size="T200">{translateSasEmojiName(name)}</Text>
          </Box>
        ))}
      </Box>
      <Box direction="Column" gap="200">
        <Button
          variant="Primary"
          fill="Soft"
          onClick={confirm}
          disabled={confirming}
          before={confirming && <Spinner size="100" variant="Primary" />}
        >
          <Text size="B400">完全一致</Text>
        </Button>
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
  onCancel: () => void;
};
function SasVerification({ verifier, onCancel }: SasVerificationProps) {
  const [sasData, setSasData] = useState<ShowSasCallbacks>();

  useVerifierShowSas(verifier, setSasData);
  useVerifierCancel(verifier, onCancel);

  useEffect(() => {
    verifier.verify();
  }, [verifier]);

  if (sasData) {
    return <CompareEmoji sasData={sasData} />;
  }

  return (
    <Box direction="Column" gap="400">
      <WaitingMessage message="正在启动表情符号对比验证……" />
    </Box>
  );
}

type VerificationDoneProps = {
  onExit: () => void;
};
function VerificationDone({ onExit }: VerificationDoneProps) {
  return (
    <Box direction="Column" gap="400">
      <div>
        <Text>设备验证成功。</Text>
      </div>
      <Button variant="Primary" fill="Solid" onClick={onExit}>
        <Text size="B400">完成</Text>
      </Button>
    </Box>
  );
}

type VerificationCanceledProps = {
  onClose: () => void;
};
function VerificationCanceled({ onClose }: VerificationCanceledProps) {
  return (
    <Box direction="Column" gap="400">
      <Text>验证已取消。</Text>
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
  const phase = useVerificationRequestPhase(request);

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
                  <SasVerification verifier={request.verifier} onCancel={handleCancel} />
                ) : (
                  <VerificationUnexpected
                    message="验证已经开始，但验证器不可用。"
                    onClose={handleCancel}
                  />
                ))}
              {phase === VerificationPhase.Done && <VerificationDone onExit={onExit} />}
              {phase === VerificationPhase.Cancelled && (
                <VerificationCanceled onClose={handleCancel} />
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
