import React, { ReactNode, useEffect, useState } from 'react';
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

type ChannelCardProps = {
  actions: ReactNode;
  badge?: string;
  bullets: string[];
  description: string;
  icon: typeof Icons.Monitor;
  iconTone: keyof typeof css.ChannelIcon;
  title: string;
};

function ChannelCard({
  actions,
  badge,
  bullets,
  description,
  icon,
  iconTone,
  title,
}: ChannelCardProps) {
  return (
    <Box className={css.ChannelCard} direction="Column" gap="400">
      <Box alignItems="Center" gap="300">
        <Box className={classNames(css.ChannelIconBase, css.ChannelIcon[iconTone])} shrink="No">
          <Icon src={icon} size="300" />
        </Box>
        <Box grow="Yes" direction="Column" gap="100" style={{ minWidth: 0 }}>
          <Box alignItems="Center" gap="100" wrap="Wrap">
            <Text size="H4">{title}</Text>
            {badge && <span className={css.Badge}>{badge}</span>}
          </Box>
          <Text size="T200" priority="300">
            {description}
          </Text>
        </Box>
      </Box>
      <Box as="ul" className={css.BulletList} direction="Column" gap="100">
        {bullets.map((bullet) => (
          <Text as="li" size="T300" key={bullet}>
            {bullet}
          </Text>
        ))}
      </Box>
      <Box className={css.CardActions} gap="200" wrap="Wrap">
        {actions}
      </Box>
    </Box>
  );
}

function ManualCard({ title, steps }: { title: string; steps: string[] }) {
  return (
    <Box className={css.ManualCard} direction="Column" gap="400">
      <Text size="H4">{title}</Text>
      <Box direction="Column" gap="300">
        {steps.map((step, index) => (
          <Box alignItems="Start" gap="200" key={step}>
            <span className={css.StepNumber}>{index + 1}</span>
            <Text size="T300" style={{ lineHeight: 1.65 }}>
              {step}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function DownloadPage() {
  const [latestRelease, setLatestRelease] = useState<DesktopUpdateReleaseInfo>();
  const [releaseLoaded, setReleaseLoaded] = useState(false);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `下载 ${APP_DISPLAY_NAME}`;

    return () => {
      document.title = previousTitle;
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
  const directWindowsDownload = Boolean(latestRelease?.downloadUrl);
  const androidDownloadUrl = latestRelease?.androidDownloadUrl ?? RELEASE_PAGE_URL;
  const directAndroidDownload = Boolean(latestRelease?.androidDownloadUrl);

  return (
    <div className={css.PageViewport}>
      <Box className={css.Page} direction="Column">
        <header className={css.Header}>
          <Box className={css.HeaderInner} alignItems="Center" justifyContent="SpaceBetween">
            <a className={css.BrandLink} href={import.meta.env.BASE_URL}>
              <img className={css.BrandLogo} src={APP_LOGO_URL} alt="" />
              <Box direction="Column">
                <Text size="H4">{APP_DISPLAY_NAME}</Text>
                <Text size="T200" priority="300">
                  应用下载中心
                </Text>
              </Box>
            </a>
            <Box className={css.HeaderNav} alignItems="Center" gap="400">
              <Text as="a" className={css.HeaderLink} href="#downloads" size="T300">
                下载渠道
              </Text>
              <Text as="a" className={css.HeaderLink} href="#manual" size="T300">
                使用手册
              </Text>
              <Text
                as="a"
                className={css.HeaderLink}
                href={PROJECT_SOURCE_URL}
                target="_blank"
                rel="noreferrer"
                size="T300"
              >
                GitHub
              </Text>
            </Box>
          </Box>
        </header>

        <main className={css.Main}>
          <section className={css.Hero}>
            <div className={css.HeroGrid}>
              <Box className={css.HeroContent} direction="Column" gap="500">
                <img className={css.HeroLogo} src={APP_LOGO_URL} alt={`${APP_DISPLAY_NAME} Logo`} />
                <Box direction="Column" gap="300">
                  <h1 className={css.HeroTitle}>一个账号，随时在所有设备继续聊天</h1>
                  <p className={css.HeroDescription}>
                    Windows 与 Android 提供正式安装包，iPhone、iPad 和其他电脑可安装网页应用。
                    数据仍保存在你的 Matrix 家服务器中，切换设备无需迁移聊天记录。
                  </p>
                </Box>
                <Box gap="200" wrap="Wrap" alignItems="Center">
                  <Button as="a" href="#downloads" variant="Primary" size="500" radii="Pill">
                    <Text size="B400">选择我的设备</Text>
                  </Button>
                  <Button
                    as="a"
                    href={import.meta.env.BASE_URL}
                    variant="Secondary"
                    fill="Soft"
                    size="500"
                    radii="Pill"
                  >
                    <Text size="B400">直接打开网页版</Text>
                  </Button>
                </Box>
              </Box>
              <aside className={css.HeroAside}>
                <span className={css.ReleaseEyebrow}>LATEST RELEASE</span>
                <Text size="H2">v{version}</Text>
                <Text size="T300" priority="300" style={{ lineHeight: 1.7 }}>
                  页面会实时读取 GitHub 最新正式版，下载按钮始终指向当前安装包。
                </Text>
                <div className={css.ReleaseStatusList}>
                  <span className={css.ReleaseStatusItem}>Windows 自动更新</span>
                  <span className={css.ReleaseStatusItem}>Android 覆盖安装</span>
                  <span className={css.ReleaseStatusItem}>iOS 网页 App</span>
                </div>
                <span className={css.HeroMeta}>
                  {!releaseLoaded && <Spinner size="100" variant="Secondary" />}
                  <Text as="span" size="T200">
                    Matrix 开放协议 · 多端同步
                  </Text>
                </span>
              </aside>
            </div>
          </section>

          <section className={css.Section} id="downloads">
            <Box className={css.SectionHeading} direction="Column" gap="200">
              <Text as="h2" size="H2">
                选择下载渠道
              </Text>
              <Text priority="300" style={{ lineHeight: 1.7 }}>
                电脑优先安装 Windows 客户端，Android 直接安装正式 APK；iPhone 和 iPad 使用 Safari
                添加到主屏幕即可获得独立应用体验。
              </Text>
            </Box>

            <Box className={css.ChannelGrid} style={{ marginTop: 28 }}>
              <ChannelCard
                title="Windows 客户端"
                badge="推荐"
                icon={Icons.Monitor}
                iconTone="windows"
                description={`64 位 Windows · 最新版 v${version}`}
                bullets={[
                  '独立运行，不受浏览器扩展影响',
                  '支持自动检查和安装更新',
                  '适合长期在线和重度使用',
                ]}
                actions={
                  <>
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
                      <Text size="B300">
                        {directWindowsDownload ? '下载 Windows 安装包' : '打开最新发布页'}
                      </Text>
                    </Button>
                    <Button
                      as="a"
                      href="#windows-manual"
                      variant="Secondary"
                      fill="Soft"
                      size="400"
                      radii="300"
                    >
                      <Text size="B300">安装说明</Text>
                    </Button>
                  </>
                }
              />

              <ChannelCard
                title="网页应用（PWA）"
                badge="免下载安装包"
                icon={Icons.Globe}
                iconTone="web"
                description="Windows、macOS、Linux 与主流移动浏览器"
                bullets={[
                  '从桌面或开始菜单独立打开',
                  '自动使用网站最新版本',
                  '无需管理员权限，安装更轻量',
                ]}
                actions={
                  <>
                    <PWAInstallButton
                      variant="Primary"
                      size="400"
                      radii="300"
                      before={<Icon src={Icons.Download} size="100" />}
                    >
                      <Text size="B300">安装网页应用</Text>
                    </PWAInstallButton>
                    <Button
                      as="a"
                      href="#pwa-manual"
                      variant="Secondary"
                      fill="Soft"
                      size="400"
                      radii="300"
                    >
                      <Text size="B300">查看手动步骤</Text>
                    </Button>
                  </>
                }
              />

              <ChannelCard
                title="Android"
                badge="正式 APK"
                icon={Icons.Phone}
                iconTone="android"
                description={`Android 8.0 及以上 · 最新版 v${version}`}
                bullets={[
                  '正式签名安装包，更新时直接覆盖旧版本',
                  '应用内自动发现新版本并引导安装',
                  '账号、聊天记录和本地设置会继续保留',
                ]}
                actions={
                  <>
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
                      <Text size="B300">
                        {directAndroidDownload ? '下载 Android 正式版' : '打开最新发布页'}
                      </Text>
                    </Button>
                    <Button
                      as="a"
                      href="#android-manual"
                      variant="Secondary"
                      fill="Soft"
                      size="400"
                      radii="300"
                    >
                      <Text size="B300">安装说明</Text>
                    </Button>
                  </>
                }
              />

              <ChannelCard
                title="iPhone 与 iPad"
                icon={Icons.Phone}
                iconTone="ios"
                description="通过 Safari 添加到主屏幕"
                bullets={[
                  '适配新版 Safari 右下角“更多”菜单',
                  '作为网页 App 打开，拥有桌面图标和独立窗口',
                  '无需 App Store，账号与其他端保持一致',
                ]}
                actions={
                  <Button as="a" href="#ios-manual" variant="Primary" size="400" radii="300">
                    <Text size="B300">iOS 安装步骤</Text>
                  </Button>
                }
              />
            </Box>
          </section>

          <section className={css.Section} id="manual">
            <Box className={css.SectionHeading} direction="Column" gap="200">
              <Text as="h2" size="H2">
                安装与使用手册
              </Text>
              <Text priority="300" style={{ lineHeight: 1.7 }}>
                按照设备选择对应步骤。安装只会创建应用入口，不会改变服务器上的账号和消息数据。
              </Text>
            </Box>

            <Box className={css.ManualGrid} style={{ marginTop: 28 }}>
              <div className={css.ManualAnchor} id="windows-manual">
                <ManualCard
                  title="Windows 客户端安装"
                  steps={[
                    '点击“下载 Windows 安装包”，从 GitHub Releases 获取最新版安装程序。',
                    '打开下载的 Starfire 安装程序，按照系统提示完成安装。',
                    '从开始菜单或桌面打开星火，选择家服务器后登录。',
                    '客户端会自动检查更新；也可以在“设置 → 关于”中手动检查。',
                  ]}
                />
              </div>
              <div className={css.ManualAnchor} id="pwa-manual">
                <ManualCard
                  title="电脑安装网页应用"
                  steps={[
                    '在支持网页应用的浏览器中打开当前下载页面。',
                    '点击“安装网页应用”；如果没有弹窗，请打开浏览器菜单中的“安装应用”或“添加到程序坞”。',
                    '确认安装后，可从桌面、开始菜单或程序坞独立打开星火。',
                    '如果浏览器不支持安装，可以继续使用网页版或选择 Windows 客户端。',
                  ]}
                />
              </div>
              <div className={css.ManualAnchor} id="android-manual">
                <ManualCard
                  title="Android 正式版安装与更新"
                  steps={[
                    '点击上方“下载 Android 正式版”，获取页面标注的最新 APK。微信或 QQ 内打开时，请先选择“在浏览器中打开”。',
                    '首次安装时，系统可能要求允许浏览器“安装未知应用”；授权后返回并继续安装。',
                    '如果手机上安装的是早期调试版，首次迁移到正式签名版可能需要卸载一次；从本正式版开始，后续更新可直接覆盖且保留数据。',
                    '应用发现新版后会弹出更新提示，点击下载并安装，按 Android 系统提示确认即可。',
                  ]}
                />
              </div>
              <div className={css.ManualAnchor} id="ios-manual">
                <ManualCard
                  title="iPhone / iPad 添加到主屏幕"
                  steps={[
                    '使用 Safari 打开星火网站；微信、QQ 等内置浏览器不支持完整的网页 App 安装。',
                    '在新版 Safari 中轻点右下角“更多（···）”，再选择“共享”。如果工具栏直接显示共享图标，也可以直接轻点。',
                    '向下滚动操作列表并选择“添加到主屏幕”；若没有该项，请到列表底部“编辑操作”中将它加入。',
                    '保留“作为网页 App 打开”，确认名称后轻点右上角“添加”，以后从主屏幕启动。',
                  ]}
                />
              </div>
            </Box>
          </section>

          <section className={css.Section}>
            <Box className={css.InfoStrip} alignItems="Start" gap="300">
              <Icon src={Icons.Info} size="300" />
              <Box direction="Column" gap="100">
                <Text size="L400">首次使用</Text>
                <Text size="T300" style={{ lineHeight: 1.7 }}>
                  打开应用后选择你的 Matrix
                  家服务器，输入用户名和密码登录。不同安装渠道使用相同账号，历史消息和房间会在登录后同步；加密消息请确保已设置并妥善保存恢复密钥。
                </Text>
              </Box>
            </Box>

            <Box className={css.ChannelGrid} style={{ marginTop: 28 }}>
              <Box className={css.ManualCard} direction="Column" gap="200">
                <Text size="H4">版本更新</Text>
                <Text size="T300" priority="300" style={{ lineHeight: 1.7 }}>
                  Windows 客户端与 Android 正式版都会在应用内检查更新；PWA
                  和网页版自动使用网站最新版。如果页面更新异常，可在“设置 → 关于”中清理资源缓存。
                </Text>
              </Box>
              <Box className={css.ManualCard} direction="Column" gap="200">
                <Text size="H4">卸载方式</Text>
                <Text size="T300" priority="300" style={{ lineHeight: 1.7 }}>
                  Windows 客户端可从系统“已安装的应用”卸载；PWA
                  可在应用窗口菜单或浏览器应用管理页面中卸载。卸载前请确认加密恢复密钥已经备份。
                </Text>
              </Box>
            </Box>

            <Box justifyContent="Center" gap="200" wrap="Wrap" style={{ marginTop: 28 }}>
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
                <Text size="B300">Apple 官方安装说明</Text>
              </Button>
              <Button
                as="a"
                href={RELEASE_PAGE_URL}
                target="_blank"
                rel="noreferrer"
                variant="Secondary"
                fill="Soft"
                size="400"
                radii="300"
                after={<Icon src={Icons.External} size="100" />}
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
                size="400"
                radii="300"
                after={<Icon src={Icons.External} size="100" />}
              >
                <Text size="B300">项目源代码</Text>
              </Button>
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
