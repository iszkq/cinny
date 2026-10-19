import { AppTextSizeFeature } from '../features/settings/general/AppTextSize';
import React, { Suspense, lazy, useMemo } from 'react';
import { Provider as JotaiProvider } from 'jotai';
import { OverlayContainerProvider, PopOutContainerProvider, TooltipContainerProvider } from 'folds';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ClientConfigLoader } from '../components/ClientConfigLoader';
import { ClientConfig, ClientConfigProvider } from '../hooks/useClientConfig';
import { ConfigConfigError, ConfigConfigLoading } from './ConfigConfig';
import { FeatureCheck } from './FeatureCheck';
import { createRouter } from './Router';
import {
  ScreenSizeProvider,
  useScreenSize,
  isCompactScreenSize,
  ScreenSize,
} from '../hooks/useScreenSize';
import { useCompositionEndTracking } from '../hooks/useComposingCheck';

const queryClient = new QueryClient();
const QueryDevtools = import.meta.env.DEV
  ? lazy(async () => ({
      default: (await import('@tanstack/react-query-devtools')).ReactQueryDevtools,
    }))
  : undefined;

// Keep the Matrix client mounted when the native viewport changes size.
function StableRouter({
  clientConfig,
  screenSize,
}: {
  clientConfig: ClientConfig;
  screenSize: ReturnType<typeof useScreenSize>;
}) {
  const compact = isCompactScreenSize(screenSize);
  const router = useMemo(
    () => createRouter(clientConfig, compact ? ScreenSize.Mobile : ScreenSize.Desktop),
    [clientConfig, compact]
  );
  return <RouterProvider router={router} />;
}

function App() {
  const screenSize = useScreenSize();
  useCompositionEndTracking();

  const portalContainer = document.getElementById('portalContainer') ?? undefined;

  return (
    <TooltipContainerProvider value={portalContainer}>
      <PopOutContainerProvider value={portalContainer}>
        <OverlayContainerProvider value={portalContainer}>
          <ScreenSizeProvider value={screenSize}>
            <FeatureCheck>
              <ClientConfigLoader
                fallback={() => <ConfigConfigLoading />}
                error={(err, retry, ignore) => (
                  <ConfigConfigError error={err} retry={retry} ignore={ignore} />
                )}
              >
                {(clientConfig) => (
                  <ClientConfigProvider value={clientConfig}>
                    <QueryClientProvider client={queryClient}>
                      <JotaiProvider>
                        <AppTextSizeFeature />
                        <StableRouter clientConfig={clientConfig} screenSize={screenSize} />
                      </JotaiProvider>
                      {QueryDevtools && (
                        <Suspense fallback={null}>
                          <QueryDevtools initialIsOpen={false} />
                        </Suspense>
                      )}
                    </QueryClientProvider>
                  </ClientConfigProvider>
                )}
              </ClientConfigLoader>
            </FeatureCheck>
          </ScreenSizeProvider>
        </OverlayContainerProvider>
      </PopOutContainerProvider>
    </TooltipContainerProvider>
  );
}

export default App;
