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
import { isAndroidApp, isNativeApp } from '../../utils/nativePlatform';
import { MobileSettingsProvider } from './MobileSettings';

const CLIENT_STORE_PERSIST_INTERVAL_MS = 30_000;
const ANDROID_CLIENT_STORE_PERSIST_INTERVAL_MS = 10_000;
const INITIAL_SYNC_ENTRY_FALLBACK_MS = 3_000;

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
  // Prefer the upstream behavior of waiting for the first successful sync.
  // A bounded fallback below still lets the user enter if optional startup
  // data is malformed while the background sync recovers.
  const [loading, setLoading] = useState(true);
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
          const pauseListener = await App.addListener('pause', persist);
          const stateListener = await App.addListener('appStateChange', ({ isActive }) => {
            if (!isActive) persist();
          });
          if (disposed) {
            pauseListener.remove().catch(() => undefined);
            stateListener.remove().catch(() => undefined);
            return;
          }
          removeNativePauseListener = () => {
            pauseListener.remove().catch(() => undefined);
            stateListener.remove().catch(() => undefined);
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
      loadMatrix().catch(() => undefined);
    }
  }, [loadState, loadMatrix]);

  useEffect(() => {
    if (mx && !mx.clientRunning) {
      startMatrix(mx).catch(() => undefined);
    }
  }, [mx, startMatrix]);

  useEffect(() => {
    if (mx && loading && mx.getRooms().length > 0) {
      // The IndexedDB store is already hydrated at this point. Returning users
      // can enter the cached shell immediately while the incremental sync runs
      // in the background instead of watching another full-screen spinner.
      setLoading(false);
    }
  }, [loading, mx]);

  useEffect(() => {
    if (!mx || !loading) return undefined;

    // A malformed optional startup response must never lock the user out of
    // the client shell. Sync continues in the background and can recover.
    const fallback = window.setTimeout(() => {
      setLoading(false);
    }, INITIAL_SYNC_ENTRY_FALLBACK_MS);

    return () => {
      window.clearTimeout(fallback);
    };
  }, [loading, mx]);

  useSyncState(
    mx,
    useCallback(
      (state) => {
        if (
          state === SyncState.Prepared ||
          state === SyncState.Syncing ||
          state === SyncState.Catchup
        ) {
          const now = Date.now();
          const persistInterval = isAndroidApp()
            ? ANDROID_CLIENT_STORE_PERSIST_INTERVAL_MS
            : CLIENT_STORE_PERSIST_INTERVAL_MS;
          if (mx && now - lastStorePersistedAtRef.current >= persistInterval) {
            lastStorePersistedAtRef.current = now;
            persistClientStore(mx);
          }
          if (loading) setLoading(false);
        }
      },
      [loading, mx]
    )
  );

  const startupFailed =
    loadState.status === AsyncStatus.Error || startState.status === AsyncStatus.Error;
  // startClient first performs homeserver capability requests before it starts
  // the sync loop. Do not let a slow optional request hide an already hydrated
  // cached client; destructive security setup is gated on a real sync state.
  const clientReady = !startupFailed && !!mx && !loading;

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
                  <Button
                    variant="Critical"
                    onClick={() => {
                      if (startState.status === AsyncStatus.Error) {
                        window.location.reload();
                        return;
                      }
                      if (loadState.status === AsyncStatus.Error) {
                        loadMatrix().catch(() => undefined);
                      }
                    }}
                  >
                    <Text as="span" size="B400">
                      重试
                    </Text>
                  </Button>
                </Box>
              </Dialog>
            </Box>
          </SplashScreen>
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
