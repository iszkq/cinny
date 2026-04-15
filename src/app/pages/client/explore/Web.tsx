import React, { useMemo, useState } from 'react';
import { Box, Button, Icon, IconButton, Icons, Text, config } from 'folds';
import { useNavigate, useParams } from 'react-router-dom';
import { Page, PageHeader } from '../../../components/page';
import { BackRouteHandler } from '../../../components/BackRouteHandler';
import { useAccountData } from '../../../hooks/useAccountData';
import { ScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { AccountDataEvent, CinnyExploreSourcesContent } from '../../../../types/matrix/accountData';
import { getExploreFeaturedPath } from '../../pathUtils';
import { getExploreCustomSourceById } from './customSources';
import * as css from './style.css';

const wrapTextStyle = {
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-word' as const,
  overflowWrap: 'anywhere' as const,
};

export function ExploreWebView() {
  const { webId } = useParams();
  const screenSize = useScreenSizeContext();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);

  const sourceEvent = useAccountData(AccountDataEvent.CinnyExploreSources);
  const source = useMemo(
    () =>
      getExploreCustomSourceById(
        sourceEvent?.getContent<CinnyExploreSourcesContent>(),
        webId
      ),
    [sourceEvent, webId]
  );

  const openInBrowser = () => {
    if (!source) return;
    window.open(source.value, '_blank', 'noopener,noreferrer');
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
          <Button
            variant="Secondary"
            fill="Soft"
            size="300"
            onClick={() => setRefreshKey((count) => count + 1)}
          >
            <Text size="B300">刷新</Text>
          </Button>
          <IconButton title="浏览器打开" aria-label="浏览器打开" onClick={openInBrowser}>
            <Icon src={Icons.Link} />
          </IconButton>
        </Box>
      </PageHeader>

      <Box grow="Yes" direction="Column" gap="300" style={{ padding: config.space.S400 }}>
        <Box className={css.ExploreWebNotice} direction="Column" gap="100">
          <Text size="L400">网页嵌入预览</Text>
          <Text size="T200" priority="300" style={wrapTextStyle}>
            部分网站会禁止 iframe 内嵌。即使先出现启动动画，后面变成白屏，也通常说明站点在后续加载阶段阻止了嵌入。
          </Text>
          <Text size="T200" priority="300" style={wrapTextStyle}>
            这种情况不是你这里的页面容器坏了，而是目标网站本身不允许稳定地被内嵌，建议直接用浏览器打开。
          </Text>
          <Box>
            <Button variant="Secondary" fill="Soft" size="300" onClick={openInBrowser}>
              <Text size="B300">浏览器打开</Text>
            </Button>
          </Box>
        </Box>
        <Box className={css.ExploreWebFrameShell}>
          <iframe
            key={refreshKey}
            title={source.title}
            src={source.value}
            className={css.ExploreWebFrame}
            referrerPolicy="strict-origin-when-cross-origin"
            allow="autoplay; clipboard-read; clipboard-write; fullscreen"
          />
        </Box>
      </Box>
    </Page>
  );
}
