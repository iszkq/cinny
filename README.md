# 星火（Starfire）

> 星星之火，可以燎原。

星火是基于上游 [Cinny](https://github.com/cinnyapp/cinny) 深度定制的中文 Matrix 客户端。在保留 Cinny 轻量、现代界面的基础上，项目补充了中文体验、消息与会话管理、AI 工具、Office 文档协作、音视频会议和跨平台客户端能力。

当前版本：`1.9.6`

支持 Web / PWA、Windows 桌面端（Tauri 2）和 Android（Capacitor 8）。三端共用同一套 React 代码；iPhone 和 iPad 可使用响应式 Web / PWA 版本。

- 项目源码：[github.com/iszkq/cinny](https://github.com/iszkq/cinny)
- 版本发布：[GitHub Releases](https://github.com/iszkq/cinny/releases)
- 上游项目：[cinnyapp/cinny](https://github.com/cinnyapp/cinny)

## 功能概览

### Matrix 聊天与加密

- 支持密码、Token 和 SSO 登录，以及注册、密码重置和符合 Matrix OIDC 规范的账户管理入口。
- 支持房间、私聊、空间、探索、收件箱、线程、回复、转发、投票、消息搜索和已读回执。
- 支持文本、图片、视频、音频、文件、贴纸、表情等消息类型，并兼容常见视频文件的在线预览。
- 支持端到端加密、设备验证、交叉签名、恢复密钥和消息密钥备份；缺少 Megolm 会话密钥时会持续尝试从可信备份或已验证设备恢复。
- 侧边栏搜索可同时查询已加入内容，以及当前联邦服务器的用户目录、公开房间和空间；可直接发起聊天或进入加房流程。

### 收藏与会话整理

- 独立的“我的收藏”页面支持收藏消息、备注、搜索、类型筛选、批量管理和回跳原消息。
- 收藏记录可写入 Matrix 账户数据；媒体收藏会尽量保存独立副本，提升跨设备与长期可用性。
- 房间和联系人支持收藏、自定义分类，以及按当前账号隔离的本地导航状态。

### 媒体、表情与内容工具

- 云端表情包支持分类、搜索、缓存、增量更新，以及“表情 / 贴纸”发送模式。
- 输入框支持系统表情、个人表情、个人贴纸和云端资源的关键词联想。
- 图片预览支持 AIHubMix 图文识别（OCR），语音消息支持最长 5 分钟的语音转文字；长转写结果可展开或收起。
- 聊天记事本可将长文本整理为 `.txt` 文件发送。
- Web、Windows 和 Android 针对图片、头像、表情、贴纸与媒体资源提供缓存和失败重试。

### Office 与 PDF

- Word、Excel、PowerPoint 和 PDF 使用统一文件卡片，支持在线预览与下载。
- Web 和 Windows 支持在线编辑 Word、Excel、PowerPoint，并将更新后的版本重新发布到房间；PDF 为只读预览。
- 受密码保护的 Office 文档可在客户端本地校验密码并解密，密码不会保存或发送到 Matrix 聊天服务器。
- Windows 使用独立 Office 窗口；Android 和移动 Web 提供响应式只读预览。
- Office 功能需要在 `config.json` 中配置兼容的 ZIZIYI Office / ONLYOFFICE 服务。

### 通话、会议与日程

- 私聊房间支持基于 Agora RTC 的一对一语音通话，包括呼叫、接听、拒绝、挂断、静音和语音自测。
- 房间内可发起 Jitsi 会议并发送会议卡片；Web 使用新窗口，Windows 桌面端通过系统浏览器加入会议。
- 探索页提供“本周日程”，可从指定 Matrix 房间解析包含日期、时间和 Zoom 会议号的通知，支持手动同步、在线增量更新和账户数据同步。

### 中文定制与个性化

- 欢迎页、设置、资料、弹窗、通知和常用聊天操作已针对中文使用习惯整理。
- 内置圣经阅读与检索工具，支持卷章浏览、范围搜索、多节选择、复制和插入聊天输入框。
- 支持主题色、气泡颜色、透明度、经典 / 玻璃拟态风格、聊天背景和跨设备外观同步。
- AI 助手支持配置 AIHubMix API、模型列表与自定义技能（命令、模型、系统提示词和上下文范围）。
- 支持本地 PIN 锁屏、通知偏好、设备管理和账号级安全设置。

## 平台支持

| 平台 | 形态 | 主要能力 |
| --- | --- | --- |
| Web / PWA | Vite 静态应用 | 完整聊天、PWA 安装、响应式移动布局 |
| Windows | Tauri 2 + NSIS | 自动更新、系统通知、任务栏未读角标、独立媒体 / 圣经 / Office 窗口、本地缓存与 PIN 锁屏 |
| Android | Capacitor 8 | 原生 APK、系统通知、媒体缓存、安全存储、同步快照、应用内更新与移动端适配 |

当前仓库没有原生 iOS 工程；iPhone / iPad 使用 Web / PWA 版本。

## 快速开始

### 环境要求

- Node.js `>= 22.0.0`；仓库的 `.node-version` 当前为 Node.js `24`
- npm（依赖版本由 `package-lock.json` 锁定）
- Windows 桌面端开发：Rust stable、Tauri 2 所需系统依赖和 WebView2
- Android 开发：Android Studio、Android SDK 和可用的 JDK

### Web 开发

```bash
npm ci
npm start
```

### 检查与构建

```bash
# 类型检查、关键 ESLint 检查和自动化测试
npm run validate

# 完整代码与格式检查
npm run lint

# 生产构建；prebuild 会先执行 validate
npm run build
```

生产文件输出到 `dist/`。

### Windows 桌面端

```bash
# 开发模式
npm run tauri

# 构建桌面应用
npm run desktop:build

# 仅构建 NSIS 安装包
npm run desktop:build:nsis
```

桌面端更新器从本仓库的 GitHub Releases 获取签名安装包和 `latest.json`。

### Android

```bash
# 构建 Web 资源并同步到 Android 工程
npm run android:sync

# 在 Android Studio 中打开工程
npm run android:open
```

GitHub Actions 支持生成测试 APK，并可在配置签名密钥后构建正式 APK。详细步骤见 [ANDROID_BUILD.md](./ANDROID_BUILD.md)。

## 配置

主要配置文件：

| 文件 | 用途 |
| --- | --- |
| `config.json` | 默认 Homeserver、公开目录、语音转写、OCR、Office、Agora 通话与路由配置 |
| `build.config.ts` | 构建路径和子目录部署配置 |
| `vite.config.js` | Vite、PWA、静态资源复制和开发服务器配置 |
| `capacitor.config.ts` | Android 应用标识、Web 目录和原生 WebView 配置 |
| `src-tauri/tauri.conf.json` | Windows 窗口、NSIS 打包、资源协议和自动更新配置 |

`config.json` 会随 Web 应用一起下发到客户端，其中的值对最终用户可见。部署时不要把真正需要保密的服务端密钥放入前端配置；生产凭据应由受控后端签发或代理。

标准 Web 构建可部署到静态服务器，也可使用仓库内的 `Dockerfile`、`docker-nginx.conf`、Netlify 配置及 `contrib/` 下的 Nginx / Caddy 示例。

## 数据存储与同步

- Matrix 会话、消息和加密状态主要由 Matrix JS SDK、IndexedDB 与 Rust Crypto 管理。
- 外观、AI、收藏索引、周日历等部分设置可通过 Matrix account data 跨设备同步。
- 导航分类、草稿及部分界面偏好保存在当前设备，并按账号隔离。
- Windows 维护本地媒体缓存；Android 额外使用系统安全存储、原生同步快照和媒体缓存。

## 主要源码入口

```text
src/app/pages/auth                 登录、注册与账户恢复
src/app/pages/client               主界面、侧边栏、探索和收藏页
src/app/features/room              房间时间线、输入框、线程与消息操作
src/app/features/search            已加入内容与服务器目录搜索
src/app/features/favorites         消息收藏
src/app/features/voice-transcription 语音转文字
src/app/features/weekly-calendar   本周日程解析与同步
src/app/features/bible             圣经阅读与检索
src/app/components/file-viewer     Word、Excel、PPT、PDF 预览与编辑
src/app/features/agora-voice       一对一语音通话
src/app/features/settings          账户、设备、外观、通知与 AI 设置
src-tauri                          Windows / Tauri 客户端
android                            Android / Capacitor 客户端
tests                              自动化回归测试
```

## 参与开发

提交改动前建议至少执行：

```bash
npm run validate
npm run lint
```

更多开发约定见 [CONTRIBUTING.md](./CONTRIBUTING.md) 和 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。

## 许可证与致谢

本项目基于 Cinny 继续开发，遵循 [AGPL-3.0-only](./LICENSE) 许可证。感谢 Cinny、Matrix 生态及所有依赖项目的贡献者。
