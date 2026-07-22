import React, { ReactNode, useEffect, useState } from 'react';
import classNames from 'classnames';
import { Box, Button, Icon, Icons, Scroll, Spinner, Text } from 'folds';
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

  return (
    <Scroll variant="Background" visibility="Hover" size="300" hideTrack>
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
            <Box className={css.HeroContent} direction="Column" gap="500">
              <img className={css.HeroLogo} src={APP_LOGO_URL} alt={`${APP_DISPLAY_NAME} Logo`} />
              <Box direction="Column" gap="300">
                <h1 className={css.HeroTitle}>在你喜欢的设备上使用{APP_DISPLAY_NAME}</h1>
                <p className={css.HeroDescription}>
                  Windows 客户端、网页应用与移动端 PWA
                  使用同一套账号和消息数据。选择适合你的方式，安装后即可开始使用。
                </p>
              </Box>
              <Box gap="200" wrap="Wrap" alignItems="Center">
                <Button as="a" href="#downloads" variant="Primary" size="500" radii="Pill">
                  <Text size="B400">选择下载方式</Text>
                </Button>
                <Button
                  as="a"
                  href={import.meta.env.BASE_URL}
                  variant="Secondary"
                  fill="Soft"
                  size="500"
                  radii="Pill"
                >
                  <Text size="B400">直接使用网页版</Text>
                </Button>
              </Box>
              <span className={css.HeroMeta}>
                {!releaseLoaded && <Spinner size="100" variant="Secondary" />}
                <Text as="span" size="T200">
                  当前版本 v{version} · 自动更新 · Matrix 开放协议
                </Text>
              </span>
            </Box>
          </section>

          <section className={css.Section} id="downloads">
            <Box className={css.SectionHeading} direction="Column" gap="200">
              <Text as="h2" size="H2">
                选择下载渠道
              </Text>
              <Text priority="300" style={{ lineHeight: 1.7 }}>
                桌面端推荐安装 Windows
                客户端；手机和平板无需等待应用商店版本，可以直接把网页应用添加到主屏幕。
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
                icon={Icons.Phone}
                iconTone="android"
                description="通过浏览器安装到手机主屏幕"
                bullets={[
                  '不需要单独下载 APK',
                  '支持 Chrome、Edge、Firefox、三星浏览器等',
                  '安装后以独立应用窗口运行',
                ]}
                actions={
                  <Button as="a" href="#android-manual" variant="Primary" size="400" radii="300">
                    <Text size="B300">Android 安装步骤</Text>
                  </Button>
                }
              />

              <ChannelCard
                title="iPhone 与 iPad"
                icon={Icons.Phone}
                iconTone="ios"
                description="通过 Safari 添加到主屏幕"
                bullets={[
                  '无需 App Store，即加即用',
                  '桌面图标和独立应用窗口',
                  '账号与网页版、桌面端保持一致',
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
                  title="Android 添加到主屏幕"
                  steps={[
                    '使用系统浏览器打开星火下载页面；微信或 QQ 内打开时，先选择“在浏览器中打开”。',
                    '打开浏览器菜单，查找“安装应用”“添加到主屏幕”或“添加页面到”。',
                    '确认名称和图标后完成添加。不同品牌浏览器的菜单名称可能略有不同。',
                    '回到手机桌面，点击星火图标即可独立运行。',
                  ]}
                />
              </div>
              <div className={css.ManualAnchor} id="ios-manual">
                <ManualCard
                  title="iPhone / iPad 添加到主屏幕"
                  steps={[
                    '使用 Safari 打开星火下载页面。',
                    '点击 Safari 工具栏中的“分享”按钮。',
                    '向下滚动并选择“添加到主屏幕”。',
                    '确认名称后点击右上角“添加”，然后从主屏幕打开星火。',
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
                  Windows 客户端支持自动更新；PWA
                  和网页版会自动使用网站最新版本。如果页面更新异常，可以在“设置 →
                  关于”中清理资源缓存。
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
    </Scroll>
  );
}
