import { createContext, useContext } from 'react';

export type HashRouterConfig = {
  enabled?: boolean;
  basename?: string;
};

export type AgoraVoiceConfig = {
  appId?: string;
  appCertificate?: string;
  area?:
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
  timeoutSeconds?: number;
  monthlyFreeMinutes?: number;
};

export type ClientConfig = {
  defaultHomeserver?: number;
  homeserverList?: string[];
  allowCustomHomeservers?: boolean;

  audioTranscription?: {
    defaultAihubmixApiKey?: string;
    /** Optional deployment relay/base URL, useful when aihubmix.com is not directly reachable. */
    baseUrl?: string;
  };

  imageOcr?: {
    defaultAihubmixApiKey?: string;
    baseUrl?: string;
    model?: string;
  };

  officeEditor?: {
    /** ZIZIYI Office editor page with the Xinghuo postMessage bridge enabled. */
    url?: string;
  };

  featuredCommunities?: {
    openAsDefault?: boolean;
    spaces?: string[];
    rooms?: string[];
    servers?: string[];
  };

  agoraVoice?: AgoraVoiceConfig;

  hashRouter?: HashRouterConfig;
};

const ClientConfigContext = createContext<ClientConfig | null>(null);

export const ClientConfigProvider = ClientConfigContext.Provider;

export function useClientConfig(): ClientConfig {
  const config = useContext(ClientConfigContext);
  if (!config) throw new Error('Client config are not provided!');
  return config;
}

export const clientDefaultServer = (clientConfig: ClientConfig): string =>
  clientConfig.homeserverList?.[clientConfig.defaultHomeserver ?? 0] ?? 'mtx01.cc';

export const clientAllowedServer = (clientConfig: ClientConfig, server: string): boolean => {
  const { homeserverList, allowCustomHomeservers } = clientConfig;

  if (allowCustomHomeservers) return true;

  return homeserverList?.includes(server) === true;
};
