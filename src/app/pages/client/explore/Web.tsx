import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Icon, IconButton, Icons, Spinner, Text, config } from 'folds';
import { useNavigate, useParams } from 'react-router-dom';
import { Page, PageHeader } from '../../../components/page';
import { BackRouteHandler } from '../../../components/BackRouteHandler';
import { useAccountData } from '../../../hooks/useAccountData';
import { ScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AccountDataEvent, CinnyExploreSourcesContent } from '../../../../types/matrix/accountData';
import { getExploreFeaturedPath } from '../../pathUtils';
import { getExploreCustomSourceById, setExploreWebSourcePolicy } from './customSources';
import * as css from './style.css';

const PROBE_TIMEOUT_MS = 3500;

type WebViewMode = 'probing' | 'embed' | 'external';

const hiddenFrameStyle = {
  position: 'absolute' as const,
  inset: 0,
  width: '1px',
  height: '1px',
  opacity: 0,
  pointerEvents: 'none' as const,
};

const wrapTextStyle = {
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-word' as const,
  overflowWrap: 'anywhere' as const,
};

const openExternalUrl = (url: string) => {
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) {
    window.location.href = url;
  }
};

const indicatesBlockedByHeaders = (
  csp: string | null,
  xFrameOptions: string | null,
  currentOrigin: string,
  targetOrigin: string
): boolean => {
  const normalizedXfo = xFrameOptions?.toLowerCase().trim();
  if (normalizedXfo) {
    if (normalizedXfo === 'allowall') {
      return false;
    }

    if (normalizedXfo === 'sameorigin') {
      return currentOrigin.toLowerCase() !== targetOrigin.toLowerCase();
    }

    if (normalizedXfo.startsWith('allow-from')) {
      return !normalizedXfo.includes(currentOrigin.toLowerCase());
    }

    return true;
  }

  const normalizedCsp = csp?.toLowerCase();
  if (!normalizedCsp || !normalizedCsp.includes('frame-ancestors')) {
    return false;
  }

  const match = normalizedCsp.match(/frame-ancestors\s+([^;]+)/);
  const directive = match?.[1]?.trim();
  if (!directive) {
    return false;
  }

  if (directive.includes("'none'")) {
    return true;
  }

  if (directive.includes('*')) {
    return false;
  }

  if (directive.includes("'self'") && currentOrigin.toLowerCase() === targetOrigin.toLowerCase()) {
    return false;
  }

  return !directive.includes(currentOrigin.toLowerCase());
};

const probeByHeaders = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'cors',
      redirect: 'follow',
    });

    return indicatesBlockedByHeaders(
      response.headers.get('content-security-policy'),
      response.headers.get('x-frame-options'),
      window.location.origin,
      new URL(url).origin
    );
  } catch {
    return false;
  }
};

export function ExploreWebView() {
  const mx = useMatrixClient();
  const { webId } = useParams();
  const screenSize = useScreenSizeContext();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [mode, setMode] = useState<WebViewMode>('probing');
  const [statusText, setStatusText] = useState<string>();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const probeSettledRef = useRef(false);
  const externalOpenedRef = useRef(false);

  const sourceEvent = useAccountData(AccountDataEvent.CinnyExploreSources);
  const source = useMemo(
    () =>
      getExploreCustomSourceById(
        sourceEvent?.getContent<CinnyExploreSourcesContent>(),
        webId
      ),
    [sourceEvent, webId]
  );

  const rememberExternal = useCallback(async () => {
    if (!source || source.kind !== 'web') return;
    await setExploreWebSourcePolicy(mx, source.id, {
      webOpenMode: 'external',
      webEmbedStatus: 'blocked',
    });
  }, [mx, source]);

  const rememberEmbeddable = useCallback(async () => {
    if (!source || source.kind !== 'web') return;
    await setExploreWebSourcePolicy(mx, source.id, {
      webOpenMode: 'auto',
      webEmbedStatus: 'embeddable',
    });
  }, [mx, source]);

  const openInBrowser = useCallback(() => {
    if (!source) return;
    openExternalUrl(source.value);
  }, [source]);

  const switchToExternal = useCallback(
    (message: string, autoOpen: boolean) => {
      if (probeSettledRef.current) return;
      probeSettledRef.current = true;
      setMode('external');
      setStatusText(message);
      void rememberExternal();

      if (autoOpen && source && !externalOpenedRef.current) {
        externalOpenedRef.current = true;
        openExternalUrl(source.value);
      }
    },
    [rememberExternal, source]
  );

  const switchToEmbed = useCallback(() => {
    if (probeSettledRef.current) return;
    probeSettledRef.current = true;
    setMode('embed');
    setStatusText(undefined);
    void rememberEmbeddable();
  }, [rememberEmbeddable]);

  useEffect(() => {
    externalOpenedRef.current = false;
    probeSettledRef.current = false;

    if (!source || source.kind !== 'web') {
      return undefined;
    }

    if (source.webOpenMode === 'external' || source.webEmbedStatus === 'blocked') {
      setMode('external');
      setStatusText('此网页会直接在浏览器中打开。');
      return undefined;
    }

    if (source.webEmbedStatus === 'embeddable') {
      setMode('embed');
      setStatusText(undefined);
      return undefined;
    }

    setMode('probing');
    setStatusText('正在检测网页是否适合内嵌...');

    const timeoutId = window.setTimeout(() => {
      switchToExternal('此网页不适合内嵌，已改为浏览器打开。', true);
    }, PROBE_TIMEOUT_MS);

    void probeByHeaders(source.value).then((blocked) => {
      if (!blocked || probeSettledRef.current) return;
      window.clearTimeout(timeoutId);
      switchToExternal('目标网站禁止 iframe 内嵌，已改为浏览器打开。', true);
    });

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    source,
    refreshKey,
    switchToExternal,
  ]);

  const handleFrameLoad = () => {
    if (mode !== 'probing') return;

    const iframe = iframeRef.current;
    if (!iframe) return;

    try {
      const href = iframe.contentWindow?.location.href;
      if (!href || href === 'about:blank') {
        switchToExternal('目标网站拒绝 iframe 内嵌，已改为浏览器打开。', true);
        return;
      }
    } catch {
      // Cross-origin navigation succeeded. We treat this as embeddable.
    }

    switchToEmbed();
  };

  if (!source || source.kind !== 'web') {
    return (
      <Page>
        <Box
          grow="Yes"
          direction="Column"
          justifyContent="Center"
          alignItems="Center"
          gap="300"
          style={{ padding: config.space.S400 }}
        >
          <Box
            className={css.RoomsInfoCard}
            direction="Column"
            justifyContent="Center"
            alignItems="Center"
            gap="200"
          >
            <Icon size="400" src={Icons.Info} />
            <Text size="L400" align="Center" style={wrapTextStyle}>
              没有找到这个网页来源
            </Text>
            <Text size="T300" align="Center" priority="300" style={wrapTextStyle}>
              这个入口可能已经被删除，或者还没有同步到当前设备。
            </Text>
          </Box>
          <Button
            variant="Secondary"
            fill="Soft"
            size="300"
            onClick={() => navigate(getExploreFeaturedPath(), { replace: true })}
          >
            <Text size="B300">返回探索页</Text>
          </Button>
        </Box>
      </Page>
    );
  }

  const showFrame = mode !== 'external';

  return (
    <Page>
      <PageHeader balance={screenSize === ScreenSize.Mobile}>
        <Box grow="Yes" basis="No">
          {screenSize === ScreenSize.Mobile && (
            <BackRouteHandler>
              {(onBack) => (
                <IconButton onClick={onBack}>
                  <Icon src={Icons.ArrowLeft} />
                </IconButton>
              )}
            </BackRouteHandler>
          )}
        </Box>
        <Box grow="Yes" direction="Column" alignItems="Center" gap="100">
          <Text size="H3" truncate>
            {source.title}
          </Text>
          <Text size="T200" priority="300" truncate>
            {source.value}
          </Text>
        </Box>
        <Box grow="Yes" basis="No" justifyContent="End" gap="100">
          {mode === 'embed' && (
            <Button
              variant="Secondary"
              fill="Soft"
              size="300"
              onClick={() => setRefreshKey((count) => count + 1)}
            >
              <Text size="B300">刷新</Text>
            </Button>
          )}
          <IconButton title="浏览器打开" aria-label="浏览器打开" onClick={openInBrowser}>
            <Icon src={Icons.Link} />
          </IconButton>
        </Box>
      </PageHeader>

      <Box grow="Yes" direction="Column" gap="300" style={{ padding: config.space.S400 }}>
        {mode === 'probing' && (
          <Box
            className={css.RoomsInfoCard}
            direction="Column"
            justifyContent="Center"
            alignItems="Center"
            gap="200"
          >
            <Spinner variant="Secondary" size="400" />
            <Text size="L400" align="Center">
              正在检测
            </Text>
            <Text size="T300" align="Center" priority="300" style={wrapTextStyle}>
              {statusText}
            </Text>
          </Box>
        )}

        {mode === 'external' && (
          <Box
            className={css.RoomsInfoCard}
            direction="Column"
            justifyContent="Center"
            alignItems="Center"
            gap="200"
          >
            <Icon size="400" src={Icons.Link} />
            <Text size="L400" align="Center">
              已改为浏览器打开
            </Text>
            <Text size="T300" align="Center" priority="300" style={wrapTextStyle}>
              {statusText}
            </Text>
            <Button variant="Secondary" fill="Soft" size="300" onClick={openInBrowser}>
              <Text size="B300">打开网页</Text>
            </Button>
          </Box>
        )}

        {showFrame && (
          <Box className={css.ExploreWebFrameShell} style={{ position: 'relative' }}>
            <iframe
              key={refreshKey}
              ref={iframeRef}
              title={source.title}
              src={source.value}
              className={css.ExploreWebFrame}
              style={mode === 'probing' ? hiddenFrameStyle : undefined}
              onLoad={handleFrameLoad}
              referrerPolicy="strict-origin-when-cross-origin"
              allow="autoplay; clipboard-read; clipboard-write; fullscreen"
            />
          </Box>
        )}
      </Box>
    </Page>
  );
}
