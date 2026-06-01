# Starfire / Cinny 中文定制版

基于上游 [cinnyapp/cinny](https://github.com/cinnyapp/cinny) 深度整理和扩展的 Matrix 客户端，面向中文使用场景持续优化，提供 Web 与 Tauri 桌面端两套运行形态。

这个仓库不是简单的界面汉化，而是在保留 Cinny 轻量、现代、模块化架构的基础上，补充了更适合中文用户和二次开发的功能与交互，包括收藏系统、圣经工具、AI 配置、桌面更新、外观自定义、设备管理增强等。

## 项目定位

- 面向中文用户的 Matrix 客户端定制分支
- 保留上游 Cinny 的主架构与主要交互模型
- 适合作为私有部署、功能扩展、二开定制和中文社区分发的基础仓库
- 同时维护 Web 端与桌面端能力，桌面端产品名为 `Starfire`

## 功能亮点

### 1. Matrix 基础聊天能力

- 支持密码登录、Token 登录、SSO 登录、注册和重置密码
- 支持房间、私聊、空间、探索页、收件箱等核心视图
- 支持文本、图片、视频、音频、文件、贴纸等消息内容
- 支持回复、转发、消息搜索、媒体预览、URL 预览和通知提示
- 支持设备验证、密钥备份/恢复、已验证设备状态展示

对应源码入口：

- `src/app/pages/auth`
- `src/app/pages/client`
- `src/app/features/room`
- `src/app/features/search`
- `src/app/features/message-search`

### 2. 更完整的中文使用体验

- 大量欢迎页、设置页、资料页、弹窗和提示文案已做中文整理
- 关于页、项目入口、作者联系方式和版本说明更贴近当前仓库
- 设置结构更适合中文用户理解，不只是替换翻译文本
- 桌面端窗口标题、品牌名和发布更新链路已经定制为当前项目

相关文件：

- `src/app/constants/branding.ts`
- `src/app/constants/projectInfo.ts`
- `src/app/features/settings`
- `src/app/pages/client/WelcomePage.tsx`

### 3. 收藏系统

仓库中包含一套相对完整的“收藏”能力，不只是前端展示，而是带有独立状态与管理逻辑的业务模块。

- 支持将消息加入收藏 / 取消收藏
- 支持独立的收藏页面与侧边栏入口
- 支持按内容类型分类浏览
- 支持备注、搜索、筛选和批量管理
- 支持从收藏结果回跳原消息

对应源码入口：

- `src/app/features/favorites`
- `src/app/pages/client/favorites`
- `src/app/pages/client/sidebar/FavoritesTab.tsx`

### 4. 圣经工具模块

这是当前仓库中很有辨识度的扩展功能，已经不是简单静态页面，而是可以和聊天输入联动的功能模块。

- 支持圣经书卷、章节、经文浏览
- 支持关键字检索
- 支持旧约 / 新约 / 当前书卷 / 自定义范围搜索
- 支持多节经文选择、复制和插入输入框
- 支持从侧边栏和消息输入区调起
- 本地经文数据来自仓库内置的 `Bible1.csv`

对应源码入口：

- `src/app/features/bible`
- `src/app/pages/client/sidebar/BibleTab.tsx`
- `Bible1.csv`

### 5. 外观与聊天背景自定义

项目已经实现可同步的外观配置体系，而不是单纯本地 CSS 切换。

- 支持主题色、气泡颜色、透明度调节
- 支持两套界面风格：经典 / 玻璃磨砂
- 支持聊天背景图选择、压缩处理与账号级同步
- 支持外观配置通过 Matrix account data 同步到同账号其他端

对应源码入口：

- `src/app/features/settings/general/AppearanceCustomizer.tsx`
- `src/app/state/appearanceAccountData.ts`
- `src/app/pages/client/ClientNonUIFeatures.tsx`

### 6. AI 配置能力

仓库中保留并扩展了 AI 相关设置结构，适合继续对接模型、命令和技能。

- 当前内置 provider 为 `aihubmix`
- 支持配置 API Key、Base URL、Models API URL
- 支持技能列表配置
- 技能支持命令、模型、系统提示词、上下文开关和事件数量限制
- 配置支持本地存储，并可同步到账户数据

对应源码入口：

- `src/app/state/ai.ts`
- `src/app/features/settings/ai`

### 7. 桌面端增强

桌面端基于 Tauri 2 构建，除了打包运行，还包含多项桌面特性。

- 支持自动检查更新与安装更新
- 支持打开外部链接到系统浏览器
- 支持任务栏未读角标
- 支持桌面媒体缓存与资源预热
- 支持本地 PIN 锁屏与账号级安全策略
- 支持桌面窗口配置、资源协议和本地缓存目录隔离

对应源码入口：

- `src-tauri/tauri.conf.json`
- `src-tauri/src/main.rs`
- `src/app/utils/desktop.ts`
- `src/app/utils/desktopUpdater.ts`
- `src/app/utils/pinLock.ts`

### 8. 设置、开发者工具与账号数据能力

项目保留了上游“适合继续开发”的优点，设置与账号数据编辑能力比较完整。

- 房间设置、空间设置、通知设置、设备设置
- 账号资料、忽略列表、联系信息等账号管理项
- 开发者工具、状态事件编辑、账号数据编辑
- 自定义 emoji / sticker 与个人表情包同步

对应源码入口：

- `src/app/features/settings`
- `src/app/features/common-settings`
- `src/app/features/room-settings`
- `src/app/features/space-settings`
- `src/app/features/settings/developer-tools`

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

参考文件：

- `package.json`
- `vite.config.js`
- `tsconfig.json`
- `src-tauri/Cargo.toml`

## 仓库结构

```text
.
|-- src
|   |-- app
|   |   |-- components        # 通用 UI 组件、弹窗、编辑器、消息渲染器
|   |   |-- constants         # 品牌、项目信息等常量
|   |   |-- features          # 业务模块，如 favorites / bible / settings / room
|   |   |-- hooks             # 自定义 hooks
|   |   |-- pages             # 路由入口与页面组织
|   |   |-- plugins           # 富文本、通话、文件查看等插件封装
|   |   |-- state             # Jotai 状态与本地存储/同步逻辑
|   |   |-- theme             # 主题与外观变量
|   |   `-- utils             # Matrix、桌面端、缓存、DOM 工具
|   |-- client                # Matrix 客户端初始化相关逻辑
|   `-- types                 # 类型定义
|-- src-tauri                 # 桌面端 Tauri 工程
|-- public                    # 静态资源、图标、字体、音频等
|-- contrib                   # Nginx / Caddy 等部署示例
|-- Bible1.csv                # 圣经功能本地数据
|-- config.json               # 服务端/探索页等运行配置
`-- build.config.ts           # 构建路径等附加配置
```

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

默认开发服务器由 Vite 提供。

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

### 运行配置

- `config.json`：服务端、探索页等运行配置
- `build.config.ts`：子目录部署或构建路径调整

### 静态部署

项目支持标准静态前端部署方式，可结合以下文件使用：

- `Dockerfile`
- `docker-nginx.conf`
- `netlify.toml`
- `contrib/nginx`
- `contrib/caddy`

### 桌面端更新

桌面端更新清单与发行链路已指向当前 GitHub 仓库：

- 发布源：`https://github.com/iszkq/cinny`
- 更新清单：`latest.json`
- 默认桌面构建配置：`src-tauri/tauri.conf.json`

## 数据同步与本地存储说明

源码中同时存在“本地存储”和“账号级同步”两类数据：

- 本地设置主要通过 `localStorage` / IndexedDB 保存
- 部分配置会额外同步到 Matrix account data
- 当前已包含外观设置和 AI 设置的账号级同步逻辑
- 桌面端还会维护本地媒体缓存、emoji 资源缓存和运行时缓存

相关文件：

- `src/app/state/settings.ts`
- `src/app/state/appearanceAccountData.ts`
- `src/app/state/ai.ts`
- `src/app/pages/client/ClientNonUIFeatures.tsx`

## 适合从哪里开始读源码

如果你准备继续维护或二次开发，推荐按这个顺序理解：

1. `src/app/pages/Router.tsx`
   先看整体路由和页面挂载关系。

2. `src/app/pages/client`
   再看 Home、Direct、Space、Inbox、Explore、Favorites 等主页面。

3. `src/app/features`
   按业务模块深入，例如 `room`、`favorites`、`bible`、`settings`。

4. `src/app/state` 与 `src/app/hooks`
   理解状态组织、同步逻辑和常用封装。

5. `src-tauri`
   如果你需要桌面端能力，再看 Tauri 配置与原生命令。

## 适合继续扩展的方向

- 继续完善中文文案和信息架构
- 收藏系统增加标签、排序和更强的批量管理
- 圣经工具和消息输入区做更深联动
- AI 技能体系、模型选择与对话工作流扩展
- 桌面端安全、缓存、通知和更新体验继续增强
- 输出更完整的开发者文档、测试说明和发布说明

## 与上游的关系

- 上游项目：[`cinnyapp/cinny`](https://github.com/cinnyapp/cinny)
- 当前仓库基于上游继续定制，并非逐字翻译上游 README
- 如需追踪原始架构设计与社区生态，请同时参考上游仓库

## 许可证

本项目沿用上游许可证：

`AGPL-3.0-only`

详见根目录 [`LICENSE`](./LICENSE)。
