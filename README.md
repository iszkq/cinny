# Starfire / Cinny 中文定制版

Starfire 是基于上游 [cinnyapp/cinny](https://github.com/cinnyapp/cinny) 深度整理和扩展的 Matrix 客户端，面向中文使用场景持续优化。项目同时支持 Web 端和 Tauri 桌面端，桌面端产品名为 `Starfire`。

当前版本：`1.5.17`

这个仓库不是简单的界面汉化，而是在保留 Cinny 轻量、现代、模块化结构的基础上，补充了更适合中文用户和二次开发的能力，包括消息收藏、房间/联系人分类、一对一语音通话、会议入口、圣经工具、AI 配置、桌面端能力、外观自定义、设备管理增强以及多处聊天体验修复。

## 功能亮点

### Matrix 基础聊天

- 支持密码登录、Token 登录、SSO 登录、注册和重置密码。
- 支持房间、私聊、空间、探索页、收件箱等核心视图。
- 支持文本、图片、视频、音频、文件、贴纸等消息内容。
- 支持回复、转发、消息搜索、媒体预览、URL 预览和通知提醒。
- 支持设备验证、密钥备份/恢复、已验证设备状态展示。

相关入口：

- `src/app/pages/auth`
- `src/app/pages/client`
- `src/app/features/room`
- `src/app/features/search`
- `src/app/features/message-search`

### 中文使用体验

- 欢迎页、设置页、资料页、弹窗和常用提示文案已做中文整理。
- 项目信息、作者联系、版本说明和桌面端品牌信息已按当前仓库定制。
- 复制、搜索、菜单、成员入口、未读状态等高频聊天交互针对中文用户习惯做了修复和优化。

相关入口：

- `src/app/constants/branding.ts`
- `src/app/constants/projectInfo.ts`
- `src/app/features/settings`
- `src/app/pages/client/WelcomePage.tsx`

### 消息收藏

仓库内包含独立的消息收藏能力，不只是前端展示，而是带有状态与管理逻辑的业务模块。

- 支持将消息加入收藏 / 取消收藏。
- 支持独立收藏页与侧边栏入口。
- 支持按内容类型分类浏览。
- 支持备注、搜索、筛选和批量管理。
- 支持从收藏结果回跳原消息。

相关入口：

- `src/app/features/favorites`
- `src/app/pages/client/favorites`
- `src/app/pages/client/sidebar/FavoritesTab.tsx`

### 房间与联系人分类

房间导航和私聊导航支持更快地找到重要会话。

- 支持将房间或联系人加入 `收藏` 分类。
- 支持创建自定义分类，并把房间或联系人加入指定分类。
- 支持从房间/联系人更多菜单中加入收藏、移出收藏、加入分类或移出分类。
- 首页房间、私聊聊天、空间房间列表都会显示收藏和自定义分类入口。
- 分类状态按用户保存在本地，避免不同账号之间互相污染。

相关入口：

- `src/app/state/roomNavCategories.ts`
- `src/app/features/room-nav/RoomNavCategorySections.tsx`
- `src/app/features/room-nav/RoomNavItem.tsx`
- `src/app/pages/client/home/Home.tsx`
- `src/app/pages/client/direct/Direct.tsx`
- `src/app/pages/client/space/Space.tsx`

### 聊天体验修复

- 消息搜索输入后，重置按钮恢复正常显示。
- 房间成员按钮恢复可用入口，避免点击无反馈。
- 消息弹窗里的复制消息按钮增加图标，视觉更清晰。
- 文本消息恢复浏览器默认选择与 `Ctrl+C` 复制能力，不再强制只能通过菜单复制。
- 已经在聊天底部看到最新消息时，会补充触发已读判定，减少“明明看到最新消息却还显示未读”的情况。

相关入口：

- `src/app/features/message-search`
- `src/app/features/room`
- `src/app/features/room/RoomTimeline.tsx`
- `src/app/components/message`

### Jitsi 会议

- 房间顶部提供会议按钮，可在当前房间发起 Jitsi 会议。
- 发起会议时支持填写会议名称，客户端会生成 `meet.jit.si` 会议房间并发送到当前 Matrix 房间。
- 聊天时间线会渲染会议卡片，显示会议名称、会议域名和 `加入会议` 按钮。
- 加入会议时会带入当前用户昵称、头像和会议主题，减少进入会议后的重复设置。
- 会议链接会关闭 Jitsi 预加入页和深链跳转提示，点击后尽量直接进入会议。
- Web 端按浏览器原生方式打开会议窗口；桌面端会用独立窗口承载外部会议页面。
- 桌面端已针对 Jitsi 主持人/Google 授权弹窗做处理：授权回调完成后会识别已授权会议地址，并尽量隐藏和关闭授权弹窗，减少白屏窗口残留。
- Jitsi 会议适合多人音视频会议，具体音视频、屏幕共享、主持人权限和会议限制由 Jitsi 服务本身决定。

相关入口：

- `src/app/components/jitsi-meet`
- `src/app/utils/jitsiMeet.ts`
- `src/app/features/room/RoomViewHeader.tsx`
- `src-tauri/src/main.rs`

### 一对一语音通话

- 私聊房间支持一对一语音通话，基于声网 Agora Web RTC SDK 接入。
- 支持发起、接听、拒绝、挂断和麦克风静音/恢复。
- 接听后会先向对方发送已接听信令，再加入声网频道，减少主叫端长时间停留在“连接中”的情况。
- 连接阶段会扫描并订阅远端音频流，远端音频订阅成功后进入通话中状态。
- 房间更多菜单提供 `语音自测`，可用于验证声网配置、麦克风权限、发布音频和订阅音频链路。
- `config.json` 中的 `agoraVoice.timeoutSeconds` 控制呼叫等待超时，默认 60 秒；连接远端音频另有连接超时保护。
- 当前声网 RTC token 默认有效期约 1 小时，长时间通话建议后续补充 token 自动续期逻辑。
- `agoraVoice.monthlyFreeMinutes` 用于本地免费分钟数预估和提示，实际用量与计费仍以声网后台为准。

相关入口：

- `src/app/features/agora-voice`
- `src/app/features/room/RoomViewHeader.tsx`
- `config.json`

### 圣经工具

圣经工具是当前仓库中识别度较高的扩展功能，可与聊天输入联动。

- 支持圣经书卷、章节、经文浏览。
- 支持关键字检索。
- 支持旧约 / 新约 / 当前书卷 / 自定义范围搜索。
- 支持多节经文选择、复制和插入输入框。
- 支持从侧边栏和消息输入区调起。
- 本地经文数据来自仓库内置的 `Bible1.csv`。

相关入口：

- `src/app/features/bible`
- `src/app/pages/client/sidebar/BibleTab.tsx`
- `Bible1.csv`

### 外观与聊天背景

- 支持主题色、气泡颜色、透明度调节。
- 支持经典 / 玻璃磨砂两套界面风格。
- 支持聊天背景图选择、压缩处理与账号级同步。
- 支持通过 Matrix account data 同步外观配置到同账号其他端。

相关入口：

- `src/app/features/settings/general/AppearanceCustomizer.tsx`
- `src/app/state/appearanceAccountData.ts`
- `src/app/pages/client/ClientNonUIFeatures.tsx`

### AI 配置

- 当前内置 provider 为 `aihubmix`。
- 支持配置 API Key、Base URL、Models API URL。
- 支持技能列表配置。
- 技能支持命令、模型、系统提示词、上下文开关和事件数量限制。
- 配置支持本地存储，并可同步到账号数据。

相关入口：

- `src/app/state/ai.ts`
- `src/app/features/settings/ai`

### 桌面端增强

桌面端基于 Tauri 2 构建。

- 支持自动检查更新与安装更新。
- 支持打开外部链接到系统浏览器。
- 支持任务栏未读角标。
- 支持桌面媒体缓存与资源预热。
- 支持本地 PIN 锁屏与账号级安全策略。
- 支持桌面窗口配置、资源协议和本地缓存目录隔离。

相关入口：

- `src-tauri/tauri.conf.json`
- `src-tauri/src/main.rs`
- `src/app/utils/desktop.ts`
- `src/app/utils/desktopUpdater.ts`
- `src/app/utils/pinLock.ts`

## 技术栈

- React 18
- TypeScript
- Vite
- React Router 6
- Matrix JS SDK
- Jotai
- TanStack React Query
- Folds UI
- vanilla-extract
- Tauri 2

## 快速开始

### 环境要求

- Node.js `>= 16`
- 推荐使用较新的 npm
- 桌面端构建需要 Tauri 2 对应的本地依赖环境

### 安装依赖

```bash
npm ci
```

### 启动 Web 开发环境

```bash
npm start
```

### 生产构建

```bash
npm run build
```

### 类型检查与代码检查

```bash
npm run typecheck
npm run lint
```

### 桌面端开发与打包

```bash
npm run tauri
npm run desktop:build
npm run desktop:build:nsis
```

## 配置与部署

- `config.json`：服务端、探索页等运行配置。
- `build.config.ts`：子目录部署或构建路径调整。
- `src-tauri/tauri.conf.json`：桌面端应用和打包配置。

项目支持标准静态前端部署，可结合以下文件使用：

- `Dockerfile`
- `docker-nginx.conf`
- `netlify.toml`
- `contrib/nginx`
- `contrib/caddy`

桌面端更新源当前指向：

- 发布源：`https://github.com/iszkq/cinny`
- 更新清单：`latest.json`

## 数据同步与本地存储

- 本地设置主要通过 `localStorage` / IndexedDB 保存。
- 部分配置会同步到 Matrix account data。
- 当前已包含外观设置和 AI 设置的账号级同步逻辑。
- 房间/联系人导航分类保存在当前用户本地存储中。
- 桌面端会维护本地媒体缓存、emoji 资源缓存和运行时缓存。

相关入口：

- `src/app/state/settings.ts`
- `src/app/state/appearanceAccountData.ts`
- `src/app/state/ai.ts`
- `src/app/state/roomNavCategories.ts`
- `src/app/pages/client/ClientNonUIFeatures.tsx`

## 说明

本项目基于 Cinny 继续开发，遵循原项目 AGPL-3.0-only 许可证。当前仓库用于中文定制、私有部署、功能扩展和桌面端分发维护。
