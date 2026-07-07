export type AgoraAreaCode =
  | 'GLOBAL'
  | 'ASIA'
  | 'CHINA'
  | 'EUROPE'
  | 'NORTH_AMERICA'
  | 'JAPAN'
  | 'INDIA'
  | 'KOREA'
  | 'HKMC'
  | 'US'
  | 'OCEANIA'
  | 'SOUTH_AMERICA'
  | 'AFRICA';

export type AgoraRemoteUser = {
  uid: number | string;
  audioTrack?: {
    play: () => void;
    stop?: () => void;
  };
};

export type AgoraLocalAudioTrack = {
  close: () => void;
  setEnabled: (enabled: boolean) => Promise<void>;
};

export type AgoraClient = {
  join: (
    appId: string,
    channel: string,
    token: string | null,
    uid: number
  ) => Promise<number | string>;
  publish: (tracks: AgoraLocalAudioTrack[]) => Promise<void>;
  subscribe: (user: AgoraRemoteUser, mediaType: 'audio') => Promise<void>;
  leave: () => Promise<void>;
  on: (event: string, listener: (...args: any[]) => void) => void;
  removeAllListeners?: () => void;
};

export type AgoraRTCFactory = {
  AREAS?: Record<AgoraAreaCode, string>;
  setArea?: (area: unknown) => void;
  createClient: (options: { mode: 'rtc'; codec: 'vp8' }) => AgoraClient;
  createMicrophoneAudioTrack: () => Promise<AgoraLocalAudioTrack>;
};

type AgoraWindow = Window & {
  AgoraRTC?: AgoraRTCFactory;
};

const AGORA_RTC_SCRIPT_ID = 'agora-rtc-sdk-ng';
const AGORA_RTC_SCRIPT_URL = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.24.0.js';

let sdkPromise: Promise<AgoraRTCFactory> | undefined;

export const loadAgoraRTC = (): Promise<AgoraRTCFactory> => {
  if ((window as AgoraWindow).AgoraRTC) {
    return Promise.resolve((window as AgoraWindow).AgoraRTC as AgoraRTCFactory);
  }

  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(AGORA_RTC_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement('script');

    script.id = AGORA_RTC_SCRIPT_ID;
    script.src = AGORA_RTC_SCRIPT_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';

    script.addEventListener(
      'load',
      () => {
        const AgoraRTC = (window as AgoraWindow).AgoraRTC;
        if (AgoraRTC) {
          resolve(AgoraRTC);
          return;
        }
        reject(new Error('声网 SDK 加载失败。'));
      },
      { once: true }
    );
    script.addEventListener('error', () => reject(new Error('声网 SDK 加载失败。')), {
      once: true,
    });

    if (!existingScript) {
      document.head.appendChild(script);
    }
  });

  return sdkPromise;
};

export const setAgoraArea = (AgoraRTC: AgoraRTCFactory, area?: AgoraAreaCode): void => {
  if (!area || area === 'GLOBAL' || !AgoraRTC.setArea) return;

  const areaCode = AgoraRTC.AREAS?.[area] ?? area;
  try {
    AgoraRTC.setArea({ areaCode: [areaCode] });
  } catch {
    AgoraRTC.setArea(areaCode);
  }
};
