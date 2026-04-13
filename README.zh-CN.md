# Cinny 中文说明

> 基于当前仓库代码结构与已实现功能整理的中文 GitHub 说明文档。  
> 本文件保留原项目英文 [`README.md`](./README.md)，方便在上游文档之外补充中文介绍。

## 项目简介

`Cinny` 是一个基于 Matrix 协议的 Web 聊天客户端，整体风格偏简洁、现代、安全。  
当前这个仓库在原版基础上，结合现有代码已经加入了更贴近中文使用场景的定制功能，例如：

- 中文化的常用界面文案
- 侧边栏“收藏”入口与完整收藏页
- 侧边栏“圣经”入口与经文检索/复制能力
- 更适合内容整理与后续功能扩展的页面结构

如果你准备继续做结构学习、源码分析和二次开发，这个仓库已经具备比较清晰的功能分层与页面入口。

## 当前主要功能

### 1. 登录与账户体系

- 支持 Matrix 服务端登录
- 支持密码登录
- 支持 Token 登录
- 支持 SSO 登录
- 支持注册
- 支持重置密码
- 支持登录后跳转回原访问页面

对应目录：

- [`src/app/pages/auth`](./src/app/pages/auth)

### 2. 聊天主界面

- `Home` 首页房间视图
- `Direct` 私聊会话视图
- `Space` 空间/分组视图
- `Explore` 公共社区探索页
- `Inbox` 收件箱页
- `Create` 创建入口
- 响应式布局，兼容移动端导航
- 侧边栏未读数、选中态与常用入口切换

对应目录：

- [`src/app/pages/client/home`](./src/app/pages/client/home)
- [`src/app/pages/client/direct`](./src/app/pages/client/direct)
- [`src/app/pages/client/space`](./src/app/pages/client/space)
- [`src/app/pages/client/explore`](./src/app/pages/client/explore)
- [`src/app/pages/client/inbox`](./src/app/pages/client/inbox)
- [`src/app/pages/client/sidebar`](./src/app/pages/client/sidebar)

### 3. 消息与媒体能力

- 常规消息渲染
- 图片、视频、音频、文件等消息展示
- 富文本/链接/提及内容解析
- 图片查看器与媒体预览
- Sticker 渲染
- 房间输入区集成扩展能力
- 通话状态渲染与嵌入式通话容器

相关目录：

- [`src/app/features/room`](./src/app/features/room)
- [`src/app/components/message`](./src/app/components/message)
- [`src/app/components/image-viewer`](./src/app/components/image-viewer)
- [`src/app/pages/CallStatusRenderer.tsx`](./src/app/pages/CallStatusRenderer.tsx)

### 4. 收藏系统

这是当前仓库里比较完整的一块自定义功能。

- 可在消息菜单中直接执行“收藏 / 取消收藏”
- 自动创建仅自己可见的“我的收藏”房间，用于保存收藏消息副本
- 收藏页支持独立浏览与管理
- 当前分类包含：
  - 文本
  - 图片
  - 视频
  - 音频
  - 文件
  - 其他
- 支持关键词搜索
- 支持按收藏时间筛选
- 支持高级模式下的多选、全选当前结果、批量取消收藏
- 支持为收藏内容添加备注
- 支持跳转打开原消息
- 图片/视频按图库方式展示
- 图片/视频点开后可查看详细信息
- 文本/音频/文件/其他类型保留消息式排布，适合查看上下文信息

相关目录：

- [`src/app/features/favorites`](./src/app/features/favorites)
- [`src/app/pages/client/favorites`](./src/app/pages/client/favorites)
- [`src/app/pages/client/sidebar/FavoritesTab.tsx`](./src/app/pages/client/sidebar/FavoritesTab.tsx)

### 5. 圣经工具

这是当前仓库中另一个明显的扩展模块，已经不仅仅是一个静态页面，而是可操作的功能组件。

- 侧边栏可直接打开“圣经”窗口
- 房间输入区也可调用圣经弹窗
- 基于本地 `Bible1.csv` 数据读取经文
- 支持旧约 / 新约切换
- 支持书卷、章节浏览
- 支持关键词搜索
- 支持多种搜索范围：
  - 全部
  - 旧约
  - 新约
  - 当前书卷
  - 自定义书卷范围
- 支持经文高亮
- 支持多节选择
- 支持复制选中经文
- 支持将选中经文插入消息输入框
- 支持章节切换、分页、定位与快捷操作

相关目录：

- [`src/app/features/bible`](./src/app/features/bible)
- [`Bible1.csv`](./Bible1.csv)
- [`src/app/pages/client/sidebar/BibleTab.tsx`](./src/app/pages/client/sidebar/BibleTab.tsx)

### 6. 收件箱与辅助功能

- 通知页
- 邀请页
- 搜索弹窗
- 创建房间弹窗
- 创建空间弹窗
- 房间设置与空间设置
- 用户房间资料渲染
- 设备验证与备份恢复相关流程

相关目录：

- [`src/app/pages/client/inbox`](./src/app/pages/client/inbox)
- [`src/app/features/search`](./src/app/features/search)
- [`src/app/features/create-room`](./src/app/features/create-room)
- [`src/app/features/create-space`](./src/app/features/create-space)
- [`src/app/features/room-settings`](./src/app/features/room-settings)
- [`src/app/features/space-settings`](./src/app/features/space-settings)

## 技术栈

- React 18
- TypeScript
- Vite
- React Router 6
- Matrix JS SDK
- Jotai
- Folds UI
- vanilla-extract

对应配置文件：

- [`package.json`](./package.json)
- [`vite.config.js`](./vite.config.js)
- [`tsconfig.json`](./tsconfig.json)

## 项目结构建议理解方式

如果你后续准备继续做源码学习和功能扩展，可以按下面的顺序理解：

1. 路由入口  
   从 [`src/app/pages/Router.tsx`](./src/app/pages/Router.tsx) 入手，看整个应用的页面装配方式。

2. 页面层  
   查看 [`src/app/pages/client`](./src/app/pages/client) 下的主页面模块，例如 `home`、`direct`、`space`、`favorites`、`inbox`。

3. 功能层  
   查看 [`src/app/features`](./src/app/features) 下的业务能力模块，例如 `room`、`favorites`、`bible`、`search`。

4. 组件层  
   查看 [`src/app/components`](./src/app/components) 下的通用组件、消息组件、媒体组件和弹窗组件。

5. 状态与 hooks  
   查看 [`src/app/state`](./src/app/state) 与 [`src/app/hooks`](./src/app/hooks)。

## 本地开发

推荐使用 Node.js 环境后执行：

```bash
npm ci
npm start
```

常用命令：

```bash
npm start
npm run build
npm run typecheck
npm run lint
```

## 构建与部署

- 本地构建输出目录为 `dist/`
- 可通过 Docker 方式部署
- 默认服务端与探索页配置在 [`config.json`](./config.json)
- 子目录部署可调整 [`build.config.ts`](./build.config.ts)
- 已提供基础部署配置示例：
  - [`Dockerfile`](./Dockerfile)
  - [`docker-nginx.conf`](./docker-nginx.conf)
  - [`netlify.toml`](./netlify.toml)
  - [`contrib`](./contrib)

## 适合继续扩展的方向

基于当前仓库现状，后续比较适合继续做的方向包括：

- 收藏内容的交互继续细化
- 收藏页批量管理和标签体系
- 圣经工具与聊天输入区的深度联动
- 中文化文案统一整理
- 页面样式与信息密度优化
- 移动端体验继续收口
- 更完整的开发文档与注释补充

## 说明

- 本文档基于当前代码仓库整理，不代表上游官方说明全文
- 若后续你准备将仓库作为中文展示主页，可以直接把本文件内容合并到根目录 `README.md`

