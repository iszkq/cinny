import React, { useEffect, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
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
  toRem,
} from 'folds';
import { APP_DISPLAY_NAME } from '../constants/branding';
import { stopPropagation } from '../utils/keyboard';
import {
  getPWAInstallSnapshot,
  PWAInstallPlatform,
  requestPWAInstall,
  subscribePWAInstall,
} from '../utils/pwaInstall';

type PWAInstallButtonProps = Omit<React.ComponentProps<typeof Button>, 'onClick'>;

type InstallGuide = {
  description: string;
  steps: string[];
  title: string;
};

const getInstallGuide = (platform: PWAInstallPlatform, inAppBrowser: boolean): InstallGuide => {
  if (inAppBrowser) {
    return {
      title: '请先在系统浏览器中打开',
      description: '当前是应用内置浏览器，不能直接安装桌面应用。',
      steps: [
        '点击浏览器右上角菜单。',
        platform === 'ios'
          ? '选择“在 Safari 中打开”。'
          : '选择“在浏览器中打开”或“在系统浏览器中打开”。',
        `回到 ${APP_DISPLAY_NAME} 后，再点击“安装应用”。`,
      ],
    };
  }

  if (platform === 'ios') {
    return {
      title: `将${APP_DISPLAY_NAME}添加到主屏幕`,
      description: 'iPhone 和 iPad 需要通过浏览器菜单手动添加。',
      steps: [
        '请使用 Safari 打开当前页面。',
        '点击 Safari 底部或顶部的“分享”按钮。',
        '在菜单中选择“添加到主屏幕”。',
        '点击右上角“添加”完成安装。',
      ],
    };
  }

  if (platform === 'android') {
    return {
      title: `将${APP_DISPLAY_NAME}添加到主屏幕`,
      description: '当前浏览器没有提供一键安装窗口，可以从浏览器菜单手动添加。',
      steps: [
        '点击浏览器右上角菜单。',
        '选择“安装应用”“添加到主屏幕”或“添加页面到”。',
        '不同品牌浏览器的菜单名称可能不同；完成后从手机桌面打开即可。',
      ],
    };
  }

  return {
    title: `安装${APP_DISPLAY_NAME}桌面应用`,
    description: '当前浏览器没有提供一键安装窗口，可以尝试浏览器菜单或选择桌面客户端。',
    steps: [
      '先退出 InPrivate/无痕模式，再打开浏览器菜单。',
      '查找“安装应用”“添加到程序坞”或“将此站点作为应用安装”。',
      '如果当前浏览器不支持 PWA，请在下载中心选择 Windows 客户端或继续使用网页版。',
    ],
  };
};

export function PWAInstallButton({ children, ...buttonProps }: PWAInstallButtonProps) {
  const [snapshot, setSnapshot] = useState(getPWAInstallSnapshot);
  const [guideOpen, setGuideOpen] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => subscribePWAInstall(() => setSnapshot(getPWAInstallSnapshot())), []);

  if (!snapshot.supported || snapshot.installed) return null;

  const guide = getInstallGuide(snapshot.platform, snapshot.inAppBrowser);

  const handleInstall = async () => {
    if (!snapshot.canPrompt) {
      setGuideOpen(true);
      return;
    }

    setInstalling(true);
    const result = await requestPWAInstall();
    setInstalling(false);

    if (result === 'unavailable') {
      setGuideOpen(true);
    }
  };

  return (
    <>
      <Button
        {...buttonProps}
        type="button"
        onClick={handleInstall}
        disabled={installing || buttonProps.disabled}
      >
        {installing ? (
          <>
            <Spinner size="100" variant="Secondary" />
            <Text size="Inherit">正在打开安装窗口...</Text>
          </>
        ) : (
          children ?? <Text size="Inherit">安装应用</Text>
        )}
      </Button>

      {guideOpen && (
        <Overlay
          open
          container={document.body}
          backdrop={
            <OverlayBackdrop
              style={{
                position: 'fixed',
                backgroundColor: 'rgba(12, 20, 32, 0.58)',
                backdropFilter: 'blur(4px)',
              }}
            />
          }
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            padding: `max(${toRem(12)}, env(safe-area-inset-top, 0px)) max(${toRem(
              12
            )}, env(safe-area-inset-right, 0px)) max(${toRem(
              12
            )}, env(safe-area-inset-bottom, 0px)) max(${toRem(
              12
            )}, env(safe-area-inset-left, 0px))`,
          }}
        >
          <OverlayCenter style={{ width: '100%', height: '100%', minHeight: 0 }}>
            <Box style={{ width: '100%', maxWidth: toRem(440), maxHeight: '100%' }}>
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  onDeactivate: () => setGuideOpen(false),
                  clickOutsideDeactivates: true,
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Dialog
                  variant="Surface"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    maxWidth: '100%',
                    maxHeight: 'min(36rem, 100%)',
                    overflow: 'hidden',
                    color: '#172033',
                    backgroundColor: '#fff',
                    border: '1px solid rgba(87, 103, 124, 0.2)',
                    borderRadius: toRem(16),
                    boxShadow: '0 24px 80px rgba(12, 20, 32, 0.28)',
                  }}
                >
                  <Header
                    style={{
                      flexShrink: 0,
                      padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                      backgroundColor: '#fff',
                      borderBottomWidth: config.borderWidth.B300,
                    }}
                    variant="Surface"
                    size="500"
                  >
                    <Box grow="Yes">
                      <Text size="H4">{guide.title}</Text>
                    </Box>
                    <IconButton
                      aria-label="关闭安装说明"
                      size="300"
                      radii="300"
                      onClick={() => setGuideOpen(false)}
                    >
                      <Icon src={Icons.Cross} />
                    </IconButton>
                  </Header>
                  <Box
                    style={{
                      padding: config.space.S400,
                      overflowY: 'auto',
                      backgroundColor: '#fff',
                    }}
                    direction="Column"
                    gap="400"
                  >
                    <Text size="T300" priority="300">
                      {guide.description}
                    </Text>
                    <Box
                      as="ol"
                      direction="Column"
                      gap="300"
                      style={{ margin: 0, paddingLeft: 24 }}
                    >
                      {guide.steps.map((step) => (
                        <Text as="li" size="T300" key={step}>
                          {step}
                        </Text>
                      ))}
                    </Box>
                    <Button
                      type="button"
                      variant="Primary"
                      size="400"
                      radii="300"
                      onClick={() => setGuideOpen(false)}
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        color: '#fff',
                        backgroundColor: '#2167e8',
                      }}
                    >
                      <Text size="B400">我知道了</Text>
                    </Button>
                  </Box>
                </Dialog>
              </FocusTrap>
            </Box>
          </OverlayCenter>
        </Overlay>
      )}
    </>
  );
}
