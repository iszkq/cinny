import { useNavigate } from 'react-router-dom';
import { getLoginPath } from '../pathUtils';
import { removeAndroidPersistedSession } from '../../../client/secretStorageKeys';
import {
  readNativeSessionFailure,
  markNativeSessionFailure,
  clearNativeSessionFailure,
} from '../../../client/nativeSessionFailure';
import { recordAndroidDiagnostic } from '../../../client/androidDiagnostics';
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
  InvalidCryptoDeviceError,
  logoutClient,
  MissingCryptoStoreError,
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
import {
  getFallbackSession,
  removeFallbackAccessToken,
  markFallbackSessionSoftLoggedOut,
  clearFallbackSessionSoftLogout,
} from '../../state/sessions';
import { AutoDiscovery } from './AutoDiscovery';
import { isAndroidApp, isNativeApp, isIOSApp } from '../../utils/nativePlatform';
import { MobileSettingsProvider } from './MobileSettings';
import { copyToClipboard } from '../../utils/dom';
import { getAndroidDiagnosticsReport } from '../../../client/androidDiagnostics';

const CLIENT_STORE_PERSIST_INTERVAL_MS = 30_000;
const ANDROID_CLIENT_STORE_PERSIST_INTERVAL_MS = 10_000;
const INITIAL_SYNC_ENTRY_FALLBACK_MS = 1_200;

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

const useLogoutListener = (
  mx: MatrixClient | undefined,
  onNativeFailure: (softLogout: boolean) => void
) => {
  useEffect(() => {
    let handled = false;
    const handleLogout: HttpApiEventHandlerMap[HttpApiEvent.SessionLoggedOut] = async (error) => {
      const softLogout = error.httpStatus === 401 && error.data?.soft_logout === true;
      if (isNativeApp()) {
        if (handled) return;
        handled = true;
        // Keep local stores and credentials for an explicit recovery attempt.
        // Reloading here rehydrates the same rejected native token indefinitely.
        mx?.stopClient();
        const session = getFallbackSession();
        if (session) markNativeSessionFailure(session, softLogout);
        recordAndroidDiagnostic('session_recovery_required', {
          softLogout,
          status: error.httpStatus ?? 0,
          code: error.errcode ?? 'unknown',
          hasRefreshToken: !!mx?.getRefreshToken(),
        });
        onNativeFailure(softLogout);
        return;
      }
      recordAndroidDiagnostic('calculator_session_reload', { softLogout });
      await clearExpiredSessionAfterLogout(mx, softLogout);
      window.location.reload();
    };

    mx?.on(HttpApiEvent.SessionLoggedOut, handleLogout);
    return () => {
      mx?.removeListener(HttpApiEvent.SessionLoggedOut, handleLogout);
    };
  }, [mx, onNativeFailure]);
};

type ClientRootProps = {
  children: ReactNode;
};
export function ClientRoot({ children }: ClientRootProps) {
  // Prefer the upstream behavior of waiting for the first successful sync.
  // A bounded fallback below still lets the user enter if optional startup
  // data is malformed while the background sync recovers.
  const navigate = useNavigate();
  const [sessionFailure, setSessionFailure] = useState(() =>
    isNativeApp() ? readNativeSessionFailure(getFallbackSession()) : undefined
  );
  const handleNativeFailure = useCallback((softLogout: boolean) => {
    setSessionFailure({ softLogout });
    setLoading(false);
  }, []);
  const [loading, setLoading] = useState(true);
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);
  const [slowStartup, setSlowStartup] = useState(false);
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
  useEffect(() => {
    setSlowStartup(false);
    if (!isNativeApp() || loadState.status !== AsyncStatus.Loading) return undefined;
    const timer = window.setTimeout(() => {
      setSlowStartup(true);
      recordAndroidDiagnostic('startup_still_pending');
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [loadState.status]);

  const mx = loadState.status === AsyncStatus.Success ? loadState.data : undefined;
  const [startState, startMatrix] = useAsyncCallback<void, Error, [MatrixClient]>(
    useCallback((m) => startClient(m), [])
  );

  useEffect(() => {
    recordAndroidDiagnostic('client_root_mounted');
    return () => recordAndroidDiagnostic('client_root_unmounted');
  }, []);

  useLogoutListener(mx, handleNativeFailure);

  useEffect(() => {
    if (!mx) return undefined;

    const persist = () => {
      lastStorePersistedAtRef.current = Date.now();
      persistClientStore(mx, isAndroidApp());
    };
    let lastResumeRetry = 0;
    const reconnectIOS = () => {
      if (!isIOSApp() || !mx.clientRunning || Date.now() - lastResumeRetry < 2000) return;
      lastResumeRetry = Date.now();
      recordAndroidDiagnostic('ios_connection_retry', { online: navigator.onLine });
      mx.retryImmediately();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persist();
      else reconnectIOS();
    };
    window.addEventListener('online', reconnectIOS);
    window.addEventListener('calculator-native-resume', reconnectIOS);

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
            else reconnectIOS();
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
      window.removeEventListener('online', reconnectIOS);
      window.removeEventListener('calculator-native-resume', reconnectIOS);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', persist);
      removeNativePauseListener?.();
    };
  }, [mx]);

  useEffect(() => {
    if (!sessionFailure && loadState.status === AsyncStatus.Idle) {
      loadMatrix().catch(() => undefined);
    }
  }, [loadState, loadMatrix, sessionFailure]);

  useEffect(() => {
    if (
      !isNativeApp() &&
      loadState.status === AsyncStatus.Error &&
      (loadState.error instanceof MissingCryptoStoreError ||
        loadState.error instanceof InvalidCryptoDeviceError)
    ) {
      // initClient already removed only the access token. Reload into the
      // sign-in route while retaining settings and the old identity metadata;
      // normal login will request a fresh Matrix device when required.
      window.location.reload();
    }
  }, [loadState]);

  useEffect(() => {
    if (!sessionFailure && mx && !mx.clientRunning) {
      startMatrix(mx).catch(() => undefined);
    }
  }, [mx, startMatrix, sessionFailure]);

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
      (state, _previous, data) => {
        if (isIOSApp() && (state === SyncState.Error || state === SyncState.Reconnecting)) {
          const error = data?.error as
            | { name?: string; errcode?: string; httpStatus?: number }
            | undefined;
          recordAndroidDiagnostic('ios_sync_issue', {
            state,
            name: error?.name ?? 'unknown',
            code: error?.errcode ?? 'network',
            status: error?.httpStatus ?? 0,
            online: navigator.onLine,
          });
        }
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

  if (sessionFailure && (!clientReady || mx?.getRooms().length === 0)) {
    return (
      <SplashScreen>
        <Box
          direction="Column"
          grow="Yes"
          alignItems="Center"
          justifyContent="Center"
          gap="400"
          style={{ padding: 24 }}
        >
          <Text size="H4">登录会话已失效</Text>
          <Text>服务器拒绝了当前登录凭据，已停止自动刷新。本机消息缓存与密钥已保留。</Text>
          <Button
            onClick={() => {
              clearNativeSessionFailure();
              setSessionFailure(undefined);
              setLoading(true);
              loadMatrix().catch(() => undefined);
            }}
          >
            <Text>尝试恢复连接</Text>
          </Button>
          <Button
            onClick={async () => {
              mx?.stopClient();
              await removeAndroidPersistedSession();
              removeFallbackAccessToken();
              if (sessionFailure.softLogout) markFallbackSessionSoftLoggedOut();
              else clearFallbackSessionSoftLogout();
              navigate(getLoginPath(baseUrl), { replace: true });
            }}
          >
            <Text>重新登录</Text>
          </Button>
        </Box>
      </SplashScreen>
    );
  }

  return (
    <AutoDiscovery userId={userId!} baseUrl={baseUrl!}>
      <SpecVersions baseUrl={baseUrl!}>
        {sessionFailure && clientReady && (
          <Box direction="Column" gap="200" style={{ padding: 12 }}>
            <Text>登录已失效，当前显示本机缓存。请重新登录以接收新消息。</Text>
            <Button
              onClick={async () => {
                mx?.stopClient();
                await removeAndroidPersistedSession();
                removeFallbackAccessToken();
                if (sessionFailure.softLogout) markFallbackSessionSoftLoggedOut();
                else clearFallbackSessionSoftLogout();
                navigate(getLoginPath(baseUrl), { replace: true });
              }}
            >
              <Text>重新登录</Text>
            </Button>
          </Box>
        )}
        {mx && !sessionFailure && <SyncStatus mx={mx} />}
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
                  {isNativeApp() && (
                    <Button
                      variant="Secondary"
                      onClick={async () => {
                        const copied = await copyToClipboard(getAndroidDiagnosticsReport());
                        setDiagnosticsCopied(copied);
                        if (copied) window.setTimeout(() => setDiagnosticsCopied(false), 2500);
                      }}
                    >
                      <Text as="span" size="B400">
                        {diagnosticsCopied ? '诊断信息已复制' : '复制诊断信息'}
                      </Text>
                    </Button>
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
          slowStartup ? (
            <SplashScreen>
              <Box
                direction="Column"
                gap="400"
                alignItems="Center"
                justifyContent="Center"
                grow="Yes"
                style={{ padding: 24 }}
              >
                <Text size="H4">正在准备本机加密数据</Text>
                <Text>
                  准备时间较长，完成后会自动进入聊天。请勿反复重试；本机消息和密钥没有清除。
                </Text>
                <Button
                  onClick={async () => {
                    setDiagnosticsCopied(await copyToClipboard(getAndroidDiagnosticsReport()));
                  }}
                >
                  <Text>{diagnosticsCopied ? '诊断信息已复制' : '复制诊断信息'}</Text>
                </Button>
                <Button onClick={() => window.location.reload()}>
                  <Text>重新打开页面</Text>
                </Button>
              </Box>
            </SplashScreen>
          ) : (
            <ClientRootLoading />
          )
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
