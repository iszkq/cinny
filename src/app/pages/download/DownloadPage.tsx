import React, { ReactNode, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { Box, Button, Icon, Icons, Spinner, Text } from 'folds';
import { APP_DISPLAY_NAME, APP_LOGO_URL, APP_TAGLINE, APP_VERSION } from '../../constants/branding';
import { PROJECT_SOURCE_URL } from '../../constants/projectInfo';
import { PWAInstallButton } from '../../components/PWAInstallButton';
import {
  DesktopUpdateReleaseInfo,
  fetchLatestDesktopRelease,
  normalizeDesktopUpdateVersion,
} from '../../utils/desktopUpdater';
import * as css from './DownloadPage.css';

const RELEASE_PAGE_URL = `${PROJECT_SOURCE_URL}/releases/latest`;
const APPLE_ADD_TO_HOME_SCREEN_URL =
  'https://support.apple.com/zh-cn/guide/iphone/iph42ab2f3a7/ios';

type GuideStepProps = {
  number: number;
  title: string;
  description: string;
  children: ReactNode;
};

function GuideStep({ number, title, description, children }: GuideStepProps) {
  return (
    <article className={css.GuideStep}>
      <Box className={css.GuideStepHeading} alignItems="Start" gap="200">
        <span className={css.StepNumber}>{number}</span>
        <Box direction="Column" gap="50">
          <Text size="H4">{title}</Text>
          <Text size="T200" priority="300">
            {description}
          </Text>
        </Box>
      </Box>
      <div className={css.GuideVisual}>{children}</div>
    </article>
  );
}

function WindowFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={css.WindowFrame}>
      <div className={css.WindowTitleBar}>
        <span className={css.WindowAppDot} />
        <span>{title}</span>
        <span className={css.WindowControls}>— · □ · ×</span>
      </div>
      <div className={css.WindowBody}>{children}</div>
    </div>
  );
}

function WindowsGuide() {
  return (
    <div className={css.GuideGrid}>
      <GuideStep number={1} title="下载安装包" description="点击页面上方的 Windows 主按钮。">
        <div className={css.DownloadIllustration}>
          <div className={css.DownloadFileIcon}>
            <Icon src={Icons.Download} size="300" />
          </div>
          <Box direction="Column" gap="50">
            <Text size="L400">Starfire_x64-setup.exe</Text>
            <Text size="T200" priority="300">
              最新正式版 · 64 位
            </Text>
          </Box>
          <span className={css.MockPrimaryButton}>立即下载</span>
        </div>
      </GuideStep>

      <GuideStep number={2} title="运行安装程序" description="打开文件，按提示点击“下一步”。">
        <WindowFrame title="Starfire 安装">
          <div className={css.InstallerLayout}>
            <div className={css.InstallerBrand}>
              <img src={APP_LOGO_URL} alt="" />
            </div>
            <Box className={css.InstallerContent} direction="Column" gap="200">
              <Text size="H4">欢迎使用星火安装向导</Text>
              <Text size="T200" priority="300">
                安装向导会将星火安装到你的电脑。
              </Text>
              <Box className={css.MockButtonRow} justifyContent="End" gap="100">
                <span className={css.MockMutedButton}>取消</span>
                <span className={css.MockOutlineButton}>下一步</span>
              </Box>
            </Box>
          </div>
        </WindowFrame>
      </GuideStep>

      <GuideStep number={3} title="登录你的账号" description="选择家服务器，输入账号和密码。">
        <WindowFrame title="星火">
          <Box className={css.LoginMock} direction="Column" gap="150">
            <Box alignItems="Center" gap="150">
              <img src={APP_LOGO_URL} alt="" />
              <Text size="H3">星火</Text>
            </Box>
            <span className={css.MockField}>选择家服务器 · ⌄</span>
            <span className={css.MockField}>用户名</span>
            <span className={classNames(css.MockPrimaryButton, css.MockWideButton)}>登录</span>
          </Box>
        </WindowFrame>
      </GuideStep>

      <GuideStep number={4} title="以后自动更新" description="也可在“设置 → 关于”中手动检查。">
        <WindowFrame title="设置 · 关于">
          <Box className={css.UpdateMock} direction="Column" gap="200">
            <Box alignItems="Center" gap="150">
              <img src={APP_LOGO_URL} alt="" />
              <Box direction="Column">
                <Text size="H4">{APP_DISPLAY_NAME}</Text>
                <Text size="T200" priority="300">
                  当前版本会自动保持最新
                </Text>
              </Box>
            </Box>
            <Box className={css.UpdateStatus} alignItems="Center" justifyContent="SpaceBetween">
              <Box direction="Column">
                <Text size="L400">桌面更新</Text>
                <Text size="T200" priority="300">
                  自动检查正式版本
                </Text>
              </Box>
              <span className={css.MockOutlineButton}>检查更新</span>
            </Box>
          </Box>
        </WindowFrame>
      </GuideStep>
    </div>
  );
}

function SafariBar({ children }: { children?: ReactNode }) {
  return (
    <div className={css.PhoneMock}>
      <div className={css.PhoneStatus}>9:41 · Wi-Fi · ▰</div>
      <div className={css.SafariAddress}>🔒 chat.221819.best ↻</div>
      <div className={css.PhonePage}>
        <Box alignItems="Center" gap="100">
          <img src={APP_LOGO_URL} alt="" />
          <Text size="L400">星火</Text>
        </Box>
        {children ?? (
          <>
            <span className={css.PhoneTextLine} />
            <span className={css.PhoneField} />
            <span className={css.PhoneField} />
          </>
        )}
      </div>
      <div className={css.SafariToolbar}>
        ‹ · › · <span>□↑</span> · ▢ · •••
      </div>
    </div>
  );
}

function IosGuide() {
  return (
    <div className={css.GuideGrid}>
      <GuideStep
        number={1}
        title="使用 Safari 打开"
        description="微信、QQ 内置浏览器不能完整安装。"
      >
        <SafariBar />
      </GuideStep>

      <GuideStep number={2} title="打开共享菜单" description="轻点 Safari 的“•••”，再选择“共享”。">
        <div className={css.IosActionVisual}>
          <div className={css.SafariToolbarLarge}>
            ‹ · › · □↑ · ▢ · <span>•••</span>
          </div>
          <div className={css.IosMenu}>
            <span>书签 · ☆</span>
            <span>下载项 · ↓</span>
            <strong>共享 · □↑</strong>
          </div>
        </div>
      </GuideStep>

      <GuideStep number={3} title="添加到主屏幕" description="向下滚动并选择“添加到主屏幕”。">
        <div className={css.ShareSheet}>
          <div className={css.ShareApps}>◉ · ● · ✉ · ●</div>
          <span>拷贝 · ▣</span>
          <span>加入阅读列表 · ∞</span>
          <strong>添加到主屏幕 · ⊞</strong>
          <span>在页面上查找 · ⌕</span>
        </div>
      </GuideStep>

      <GuideStep
        number={4}
        title="确认添加"
        description="保留“作为网页 App 打开”，轻点右上角“添加”。"
      >
        <div className={css.AddHomeVisual}>
          <div className={css.AddHomeSheet}>
            <div className={css.AddHomeHeader}>
              取消 · 添加到主屏幕 · <strong>添加</strong>
            </div>
            <Box alignItems="Center" gap="150">
              <img src={APP_LOGO_URL} alt="" />
              <Box direction="Column">
                <Text size="L400">星火</Text>
                <Text size="T200" priority="300">
                  chat.221819.best
                </Text>
              </Box>
            </Box>
            <div className={css.AddHomeSwitch}>
              作为网页 App 打开 · <span>●</span>
            </div>
          </div>
          <div className={css.HomeScreenMock}>
            <img src={APP_LOGO_URL} alt="" />
            <span>星火</span>
          </div>
        </div>
      </GuideStep>
    </div>
  );
}

export function DownloadPage() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [latestRelease, setLatestRelease] = useState<DesktopUpdateReleaseInfo>();
  const [releaseLoaded, setReleaseLoaded] = useState(false);

  const scrollToSection = (id: string, smooth = true) => {
    const viewport = viewportRef.current;
    const target = document.getElementById(id);
    if (!viewport || !target) return;

    const viewportTop = viewport.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    const top = viewport.scrollTop + targetTop - viewportTop - 72;
    viewport.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  };

  const handleSectionLink =
    (id: string): React.MouseEventHandler<HTMLAnchorElement> =>
    (evt) => {
      evt.preventDefault();
      window.history.replaceState(null, '', `#${id}`);
      window.scrollTo(0, 0);
      scrollToSection(id);
    };

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `下载 ${APP_DISPLAY_NAME}`;
    window.scrollTo(0, 0);

    const hashId = decodeURIComponent(window.location.hash.slice(1));
    const frame = window.requestAnimationFrame(() => {
      if (hashId) scrollToSection(hashId, false);
    });

    return () => {
      document.title = previousTitle;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    fetchLatestDesktopRelease()
      .then((release) => {
        if (!disposed) setLatestRelease(release);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!disposed) setReleaseLoaded(true);
      });

    return () => {
      disposed = true;
    };
  }, []);

  const version = latestRelease?.version
    ? normalizeDesktopUpdateVersion(latestRelease.version)
    : APP_VERSION;
  const windowsDownloadUrl = latestRelease?.downloadUrl ?? RELEASE_PAGE_URL;
  const androidDownloadUrl = latestRelease?.androidDownloadUrl ?? RELEASE_PAGE_URL;
  const directWindowsDownload = Boolean(latestRelease?.downloadUrl);
  const directAndroidDownload = Boolean(latestRelease?.androidDownloadUrl);

  return (
    <div ref={viewportRef} className={css.PageViewport}>
      <Box className={css.Page} direction="Column">
        <header className={css.Header}>
          <Box className={css.HeaderInner} alignItems="Center" justifyContent="SpaceBetween">
            <a className={css.BrandLink} href={import.meta.env.BASE_URL}>
              <img className={css.BrandLogo} src={APP_LOGO_URL} alt="" />
              <Box direction="Column">
                <Text size="H4">{APP_DISPLAY_NAME}</Text>
                <Text size="T200" priority="300">
                  官方下载中心
                </Text>
              </Box>
            </a>
            <Box className={css.HeaderNav} alignItems="Center" gap="400">
              <Text
                as="a"
                className={css.HeaderLink}
                href="#downloads"
                onClick={handleSectionLink('downloads')}
                size="T300"
              >
                下载应用
              </Text>
              <Text
                as="a"
                className={css.HeaderLink}
                href="#windows-guide"
                onClick={handleSectionLink('windows-guide')}
                size="T300"
              >
                Windows 安装
              </Text>
              <Text
                as="a"
                className={css.HeaderLink}
                href="#ios-guide"
                onClick={handleSectionLink('ios-guide')}
                size="T300"
              >
                iPhone / iPad
              </Text>
            </Box>
          </Box>
        </header>

        <main className={css.Main}>
          <section className={css.Hero} id="downloads">
            <div className={css.HeroGrid}>
              <Box className={css.HeroContent} direction="Column" gap="500">
                <span className={css.HeroKicker}>星火全平台客户端</span>
                <Box direction="Column" gap="300">
                  <h1 className={css.HeroTitle}>下载星火，继续你的每一次对话</h1>
                  <p className={css.HeroDescription}>
                    Windows 和 Android 使用正式安装包；iPhone、iPad 可直接添加到主屏幕。
                  </p>
                </Box>
                <Box className={css.HeroTrustRow} gap="200" wrap="Wrap">
                  <span>✓ 正式签名</span>
                  <span>✓ 支持覆盖更新</span>
                  <span>✓ 多端消息同步</span>
                </Box>
                <Box gap="200" wrap="Wrap">
                  <Button
                    as="a"
                    href={import.meta.env.BASE_URL}
                    variant="Secondary"
                    fill="Soft"
                    size="400"
                    radii="Pill"
                  >
                    <Text size="B300">先打开网页版</Text>
                  </Button>
                  <Button
                    as="a"
                    href="#guides"
                    onClick={handleSectionLink('guides')}
                    variant="Secondary"
                    fill="None"
                    size="400"
                    radii="Pill"
                  >
                    <Text size="B300">查看安装图示</Text>
                  </Button>
                </Box>
              </Box>

              <div className={css.PrimaryDownloadStack}>
                <a
                  className={classNames(css.PrimaryDownloadCard, css.WindowsDownloadCard)}
                  href={windowsDownloadUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Box alignItems="Center" gap="300">
                    <span className={css.PrimaryPlatformIcon}>
                      <Icon src={Icons.Monitor} size="300" />
                    </span>
                    <Box grow="Yes" direction="Column" gap="50">
                      <Text size="H3">Windows 客户端</Text>
                      <Text size="T200">v{version} · 64 位安装包</Text>
                    </Box>
                    <Icon src={Icons.Download} size="200" />
                  </Box>
                  <span className={css.PrimaryDownloadLabel}>
                    {directWindowsDownload ? '立即下载 EXE' : '打开最新发布页'}
                  </span>
                </a>

                <a
                  className={classNames(css.PrimaryDownloadCard, css.AndroidDownloadCard)}
                  href={androidDownloadUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Box alignItems="Center" gap="300">
                    <span className={css.PrimaryPlatformIcon}>
                      <Icon src={Icons.Phone} size="300" />
                    </span>
                    <Box grow="Yes" direction="Column" gap="50">
                      <Text size="H3">Android 正式版</Text>
                      <Text size="T200">v{version} · APK 覆盖安装</Text>
                    </Box>
                    <Icon src={Icons.Download} size="200" />
                  </Box>
                  <span className={css.PrimaryDownloadLabel}>
                    {directAndroidDownload ? '立即下载 APK' : '打开最新发布页'}
                  </span>
                </a>

                <Box className={css.ReleaseLine} alignItems="Center" gap="100">
                  {!releaseLoaded && <Spinner size="100" variant="Secondary" />}
                  <span className={css.ReleasePulse} />
                  <Text size="T200" priority="300">
                    下载按钮实时指向 GitHub 最新正式版 v{version}
                  </Text>
                </Box>
              </div>
            </div>
          </section>

          <section className={css.SecondarySection}>
            <Box className={css.SectionHeading} direction="Column" gap="100">
              <Text as="h2" size="H2">
                其他安装方式
              </Text>
              <Text size="T300" priority="300">
                手机没有对应安装包时，也可以把网页安装成独立应用。
              </Text>
            </Box>
            <div className={css.SecondaryGrid}>
              <article className={css.SecondaryCard}>
                <span className={classNames(css.SecondaryIcon, css.IosIcon)}>
                  <Icon src={Icons.Phone} size="300" />
                </span>
                <Box grow="Yes" direction="Column" gap="100">
                  <Text size="H4">iPhone / iPad</Text>
                  <Text size="T200" priority="300">
                    Safari 添加到主屏幕，无需 App Store
                  </Text>
                </Box>
                <Button
                  as="a"
                  href="#ios-guide"
                  onClick={handleSectionLink('ios-guide')}
                  variant="Primary"
                  size="400"
                  radii="300"
                >
                  <Text size="B300">查看图示教程</Text>
                </Button>
              </article>

              <article className={css.SecondaryCard}>
                <span className={classNames(css.SecondaryIcon, css.WebIcon)}>
                  <Icon src={Icons.Globe} size="300" />
                </span>
                <Box grow="Yes" direction="Column" gap="100">
                  <Text size="H4">网页应用（PWA）</Text>
                  <Text size="T200" priority="300">
                    macOS、Linux 和支持 PWA 的浏览器
                  </Text>
                </Box>
                <Box gap="100" wrap="Wrap">
                  <PWAInstallButton variant="Primary" size="400" radii="300">
                    <Text size="B300">安装网页应用</Text>
                  </PWAInstallButton>
                  <Button
                    as="a"
                    href="#pwa-guide"
                    onClick={handleSectionLink('pwa-guide')}
                    variant="Secondary"
                    fill="Soft"
                    size="400"
                    radii="300"
                  >
                    <Text size="B300">手动步骤</Text>
                  </Button>
                </Box>
              </article>
            </div>
          </section>

          <section className={css.GuidesSection} id="guides">
            <Box className={css.GuidesHeading} direction="Column" gap="150" alignItems="Center">
              <span className={css.SectionKicker}>图示安装指南</span>
              <Text as="h2" size="H1" align="Center">
                照着图做，几分钟完成安装
              </Text>
              <Text size="T300" priority="300" align="Center">
                选择你的设备，按 1 → 4 的顺序操作。
              </Text>
            </Box>

            <section className={css.GuidePanel} id="windows-guide">
              <Box className={css.GuidePanelHeader} alignItems="Center" gap="300">
                <span className={classNames(css.GuidePlatformIcon, css.WindowsGuideIcon)}>
                  <Icon src={Icons.Monitor} size="300" />
                </span>
                <Box grow="Yes" direction="Column" gap="50">
                  <Text as="h3" size="H2">
                    Windows 客户端安装
                  </Text>
                  <Text size="T200" priority="300">
                    推荐使用 · 自动检查更新
                  </Text>
                </Box>
                <Button
                  as="a"
                  href={windowsDownloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  variant="Primary"
                  size="400"
                  radii="300"
                  before={<Icon src={Icons.Download} size="100" />}
                >
                  <Text size="B300">下载 Windows 安装包</Text>
                </Button>
              </Box>
              <WindowsGuide />
            </section>

            <section className={css.GuidePanel} id="ios-guide">
              <Box className={css.GuidePanelHeader} alignItems="Center" gap="300">
                <span className={classNames(css.GuidePlatformIcon, css.IosGuideIcon)}>
                  <Icon src={Icons.Phone} size="300" />
                </span>
                <Box grow="Yes" direction="Column" gap="50">
                  <Text as="h3" size="H2">
                    iPhone / iPad 添加到主屏幕
                  </Text>
                  <Text size="T200" priority="300">
                    适配新版 Safari“更多 → 共享”流程
                  </Text>
                </Box>
                <Button
                  as="a"
                  href={APPLE_ADD_TO_HOME_SCREEN_URL}
                  target="_blank"
                  rel="noreferrer"
                  variant="Secondary"
                  fill="Soft"
                  size="400"
                  radii="300"
                  after={<Icon src={Icons.External} size="100" />}
                >
                  <Text size="B300">Apple 官方说明</Text>
                </Button>
              </Box>
              <IosGuide />
            </section>

            <div className={css.CompactGuideGrid}>
              <article className={css.CompactGuide} id="android-guide">
                <Box alignItems="Center" gap="200">
                  <span className={classNames(css.GuidePlatformIcon, css.AndroidGuideIcon)}>
                    <Icon src={Icons.Phone} size="200" />
                  </span>
                  <Text size="H3">Android APK</Text>
                </Box>
                <div className={css.CompactSteps}>
                  <span>
                    <b>1</b> 点击“立即下载 APK”
                  </span>
                  <span>
                    <b>2</b> 允许浏览器安装未知应用
                  </span>
                  <span>
                    <b>3</b> 按系统提示覆盖安装
                  </span>
                </div>
                <Button
                  as="a"
                  href={androidDownloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  variant="Primary"
                  size="400"
                  radii="300"
                  before={<Icon src={Icons.Download} size="100" />}
                >
                  <Text size="B300">下载 Android APK</Text>
                </Button>
              </article>

              <article className={css.CompactGuide} id="pwa-guide">
                <Box alignItems="Center" gap="200">
                  <span className={classNames(css.GuidePlatformIcon, css.WebGuideIcon)}>
                    <Icon src={Icons.Globe} size="200" />
                  </span>
                  <Text size="H3">电脑安装网页应用</Text>
                </Box>
                <div className={css.CompactSteps}>
                  <span>
                    <b>1</b> 使用 Chrome、Edge 或 Safari 打开
                  </span>
                  <span>
                    <b>2</b> 点击浏览器地址栏的安装图标
                  </span>
                  <span>
                    <b>3</b> 确认后从桌面独立启动
                  </span>
                </div>
                <PWAInstallButton variant="Primary" size="400" radii="300">
                  <Text size="B300">安装网页应用</Text>
                </PWAInstallButton>
              </article>
            </div>
          </section>

          <section className={css.SupportStrip}>
            <Box alignItems="Start" gap="300">
              <span className={css.SupportIcon}>
                <Icon src={Icons.Info} size="200" />
              </span>
              <Box grow="Yes" direction="Column" gap="100">
                <Text size="H4">安装不会影响聊天数据</Text>
                <Text size="T300" priority="300">
                  同一账号登录后会继续同步房间和消息；覆盖安装 Android 新版也会保留本地设置。
                </Text>
              </Box>
              <Box gap="100" wrap="Wrap">
                <Button
                  as="a"
                  href={RELEASE_PAGE_URL}
                  target="_blank"
                  rel="noreferrer"
                  variant="Secondary"
                  fill="Soft"
                  size="300"
                  radii="300"
                >
                  <Text size="B300">GitHub Releases</Text>
                </Button>
                <Button
                  as="a"
                  href={PROJECT_SOURCE_URL}
                  target="_blank"
                  rel="noreferrer"
                  variant="Secondary"
                  fill="Soft"
                  size="300"
                  radii="300"
                >
                  <Text size="B300">项目源代码</Text>
                </Button>
              </Box>
            </Box>
          </section>

          <footer className={css.Footer}>
            <Text size="T300">
              {APP_DISPLAY_NAME} · {APP_TAGLINE} · 基于 Matrix 开放协议
            </Text>
          </footer>
        </main>
      </Box>
    </div>
  );
}
