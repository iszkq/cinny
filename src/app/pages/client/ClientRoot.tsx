import {
  Box,
  Button,
  config,
  Dialog,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Spinner,
  Text,
} from 'folds';
import { HttpApiEvent, HttpApiEventHandlerMap, MatrixClient, SyncState } from 'matrix-js-sdk';
import FocusTrap from 'focus-trap-react';
import React, {
  MouseEventHandler,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  clearCacheAndReload,
  clearResourceCaches,
  clearAllLocalData,
  clearExpiredSessionAfterLogout,
  clearLocalSessionAfterLogout,
  clearLoginData,
  initClient,
  logoutClient,
  persistClientStore,
  startClient,
} from '../../../client/initMatrix';
import { SplashScreen } from '../../components/splash-screen';
import { ServerConfigsLoader } from '../../components/ServerConfigsLoader';
import { CapabilitiesProvider } from '../../hooks/useCapabilities';
import { MediaConfigProvider } from '../../hooks/useMediaConfig';
import { MatrixClientProvider } from '../../hooks/useMatrixClient';
import { SpecVersions } from './SpecVersions';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { useSyncState } from '../../hooks/useSyncState';
import { stopPropagation } from '../../utils/keyboard';
import { SyncStatus } from './SyncStatus';
import { AuthMetadataProvider } from '../../hooks/useAuthMetadata';
import { getFallbackSession } from '../../state/sessions';
import { AutoDiscovery } from './AutoDiscovery';
import { isNativeApp } from '../../utils/nativePlatform';
import { MobileSettingsProvider } from './MobileSettings';

const CLIENT_STORE_PERSIST_INTERVAL_MS = 30_000;
const INITIAL_SYNC_TIMEOUT_MS = 20_000;

function ClientRootLoading() {
  return (
    <SplashScreen>
      <Box direction="Column" grow="Yes" alignItems="Center" justifyContent="Center" gap="400">
        <Spinner variant="Secondary" size="600" />
        <Text>正在启动</Text>
      </Box>
    </SplashScreen>
  );
}

type InitialSyncTimeoutProps = {
  error?: unknown;
  onRetry: () => void;
  onClearSyncCache: () => void;
};

function InitialSyncTimeout({ error, onRetry, onClearSyncCache }: InitialSyncTimeoutProps) {
  const errorMessage = error instanceof Error ? error.message : undefined;

  return (
    <SplashScreen>
      <Box direction="Column" grow="Yes" alignItems="Center" justifyContent="Center" gap="400">
        <Dialog>
          <Box direction="Column" gap="400" style={{ padding: config.space.S400 }}>
            <Box direction="Column" gap="100">
              <Text size="H4">房间同步超时</Text>
              <Text size="T300">
                初始同步超过 20
                秒仍未完成。可以直接重试；若仍卡住，只清理房间同步缓存后重载，不会删除设备身份或本地加密密钥。
              </Text>
              {errorMessage && <Text size="T200">{`服务器返回：${errorMessage}`}</Text>}
            </Box>
            <Box gap="200" justifyContent="End" wrap="Wrap">
              <Button variant="Secondary" onClick={onClearSyncCache}>
                <Text as="span" size="B400">
                  清理房间缓存并重载
                </Text>
              </Button>
              <Button variant="Primary" onClick={onRetry}>
                <Text as="span" size="B400">
                  重新同步
                </Text>
              </Button>
            </Box>
          </Box>
        </Dialog>
      </Box>
    </SplashScreen>
  );
}

function ClientRootOptions({ mx }: { mx?: MatrixClient }) {
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const handleToggle: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const cords = evt.currentTarget.getBoundingClientRect();
    setMenuAnchor((currentState) => {
      if (currentState) return undefined;
      return cords;
    });
  };

  return (
    <IconButton
      style={{
        position: 'absolute',
        top: config.space.S100,
        right: config.space.S100,
      }}
      variant="Background"
      fill="None"
      onClick={handleToggle}
    >
      <Icon size="200" src={Icons.VerticalDots} />
      <PopOut
        anchor={menuAnchor}
        position="Bottom"
        align="End"
        offset={6}
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              returnFocusOnDeactivate: false,
              onDeactivate: () => setMenuAnchor(undefined),
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
              isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                {mx && (
                  <MenuItem
                    onClick={async () => {
                      await clearResourceCaches();
                      window.location.reload();
                    }}
                    size="300"
                    radii="300"
                  >
                    <Text as="span" size="T300" truncate>
                      清理资源缓存
                    </Text>
                  </MenuItem>
                )}
                {mx && (
                  <MenuItem onClick={() => clearCacheAndReload(mx)} size="300" radii="300">
                    <Text as="span" size="T300" truncate>
                      清理缓存并重载
                    </Text>
                  </MenuItem>
                )}
                <MenuItem
                  onClick={async () => {
                    await clearAllLocalData(mx);
                    window.location.reload();
                  }}
                  size="300"
                  radii="300"
                  variant="Warning"
                  fill="None"
                >
                  <Text as="span" size="T300" truncate>
                    清空本地数据
                  </Text>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    if (mx) {
                      logoutClient(mx);
                      return;
                    }
                    clearLoginData();
                  }}
                  size="300"
                  radii="300"
                  variant="Critical"
                  fill="None"
                >
                  <Text as="span" size="T300" truncate>
                    退出登录
                  </Text>
                </MenuItem>
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
    </IconButton>
  );
}

const useLogoutListener = (mx?: MatrixClient) => {
  useEffect(() => {
    const handleLogout: HttpApiEventHandlerMap[HttpApiEvent.SessionLoggedOut] = async () => {
      await clearExpiredSessionAfterLogout(mx);
      window.location.reload();
    };

    mx?.on(HttpApiEvent.SessionLoggedOut, handleLogout);
    return () => {
      mx?.removeListener(HttpApiEvent.SessionLoggedOut, handleLogout);
    };
  }, [mx]);
};

type ClientRootProps = {
  children: ReactNode;
};
export function ClientRoot({ children }: ClientRootProps) {
  // Match upstream: do not mount room-dependent features before the first
  // successful sync. Starting the whole application early can fan out room,
  // calendar and media work while /sync is still preparing.
  const [loading, setLoading] = useState(true);
  const [initialSyncTimedOut, setInitialSyncTimedOut] = useState(false);
  const [initialSyncError, setInitialSyncError] = useState<unknown>();
  const lastStorePersistedAtRef = useRef(0);
  const { baseUrl, userId } = getFallbackSession() ?? {};

  const [loadState, loadMatrix] = useAsyncCallback<MatrixClient, Error, []>(
    useCallback(() => {
      const session = getFallbackSession();
      if (!session) {
        throw new Error('No session Found!');
      }
      return initClient(session);
    }, [])
  );
  const mx = loadState.status === AsyncStatus.Success ? loadState.data : undefined;
  const [startState, startMatrix] = useAsyncCallback<void, Error, [MatrixClient]>(
    useCallback((m) => startClient(m), [])
  );

  useLogoutListener(mx);

  useEffect(() => {
    if (!mx) return undefined;

    const persist = () => {
      lastStorePersistedAtRef.current = Date.now();
      persistClientStore(mx);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persist();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', persist);

    let disposed = false;
    let removeNativePauseListener: (() => void) | undefined;
    if (isNativeApp()) {
      import('@capacitor/app')
        .then(async ({ App }) => {
          const listener = await App.addListener('pause', persist);
          if (disposed) {
            listener.remove().catch(() => undefined);
            return;
          }
          removeNativePauseListener = () => {
            listener.remove().catch(() => undefined);
          };
        })
        .catch(() => undefined);
    }

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', persist);
      removeNativePauseListener?.();
    };
  }, [mx]);

  useEffect(() => {
    if (loadState.status === AsyncStatus.Idle) {
      loadMatrix();
    }
  }, [loadState, loadMatrix]);

  useEffect(() => {
    if (mx && !mx.clientRunning) {
      startMatrix(mx);
    }
  }, [mx, startMatrix]);

  useEffect(() => {
    if (!mx || !loading || startState.status === AsyncStatus.Error) return undefined;

    const timeout = window.setTimeout(() => {
      setInitialSyncTimedOut(true);
    }, INITIAL_SYNC_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [loading, mx, startState.status]);

  useSyncState(
    mx,
    useCallback(
      (state, _previous, data) => {
        if (
          state === SyncState.Prepared ||
          state === SyncState.Syncing ||
          state === SyncState.Catchup
        ) {
          const now = Date.now();
          if (mx && now - lastStorePersistedAtRef.current >= CLIENT_STORE_PERSIST_INTERVAL_MS) {
            lastStorePersistedAtRef.current = now;
            persistClientStore(mx);
          }
          setInitialSyncTimedOut(false);
          setInitialSyncError(undefined);
          if (loading) setLoading(false);
          return;
        }

        if (data && typeof data === 'object' && 'error' in data) {
          setInitialSyncError((data as { error?: unknown }).error);
        }
      },
      [loading, mx]
    )
  );

  const retryInitialSync = useCallback(() => {
    // Reloading keeps the existing session, device identity and crypto store,
    // while safely creating a fresh MatrixClient and sync loop.
    window.location.reload();
  }, []);

  const clientReady = !!mx && !loading;
  const startupFailed =
    loadState.status === AsyncStatus.Error || startState.status === AsyncStatus.Error;
  const showInitialSyncTimeout = !!mx && loading && initialSyncTimedOut && !startupFailed;

  return (
    <AutoDiscovery userId={userId!} baseUrl={baseUrl!}>
      <SpecVersions baseUrl={baseUrl!}>
        {mx && <SyncStatus mx={mx} />}
        {!clientReady && <ClientRootOptions mx={mx} />}
        {startupFailed ? (
          <SplashScreen>
            <Box
              direction="Column"
              grow="Yes"
              alignItems="Center"
              justifyContent="Center"
              gap="400"
            >
              <Dialog>
                <Box direction="Column" gap="400" style={{ padding: config.space.S400 }}>
                  {loadState.status === AsyncStatus.Error && (
                    <Text>{`客户端加载失败：${loadState.error.message}`}</Text>
                  )}
                  {startState.status === AsyncStatus.Error && (
                    <Text>{`客户端启动失败：${startState.error.message}`}</Text>
                  )}
                  <Button variant="Critical" onClick={retryInitialSync}>
                    <Text as="span" size="B400">
                      重新加载
                    </Text>
                  </Button>
                </Box>
              </Dialog>
            </Box>
          </SplashScreen>
        ) : showInitialSyncTimeout ? (
          <InitialSyncTimeout
            error={initialSyncError}
            onRetry={retryInitialSync}
            onClearSyncCache={() => clearCacheAndReload(mx)}
          />
        ) : !clientReady ? (
          <ClientRootLoading />
        ) : clientReady ? (
          <MatrixClientProvider value={mx}>
            <ServerConfigsLoader>
              {(serverConfigs) => (
                <CapabilitiesProvider value={serverConfigs.capabilities ?? {}}>
                  <MediaConfigProvider value={serverConfigs.mediaConfig ?? {}}>
                    <AuthMetadataProvider value={serverConfigs.authMetadata}>
                      <MobileSettingsProvider>{children}</MobileSettingsProvider>
                    </AuthMetadataProvider>
                  </MediaConfigProvider>
                </CapabilitiesProvider>
              )}
            </ServerConfigsLoader>
          </MatrixClientProvider>
        ) : null}
      </SpecVersions>
    </AutoDiscovery>
  );
}
