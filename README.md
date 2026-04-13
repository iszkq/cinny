# Cinny 中文功能说明

一个基于 Matrix 协议的 Web 聊天客户端，当前仓库在原版 Cinny 的基础上进行了中文场景下的功能整理与定制扩展，适合继续做源码学习、结构分析和二次开发。

## 项目定位

本仓库保留了 Cinny 原有的即时通讯基础能力，同时加入了更贴合中文用户习惯的功能模块与入口设计，当前更偏向：

- 中文界面与本地化使用体验
- 面向内容整理的收藏系统
- 面向宗教场景的圣经检索与引用工具
- 清晰的页面分层、功能分层与组件结构

如果你准备继续完善功能、重构交互或做自己的定制客户端，这个仓库已经具备较好的扩展基础。

## 当前主要功能

### 账号与登录

- 支持 Matrix 服务端登录
- 支持密码登录
- 支持 Token 登录
- 支持 SSO 登录
- 支持注册
- 支持密码重置
- 支持登录后自动跳转回原访问页面

相关目录：

- [`src/app/pages/auth`](./src/app/pages/auth)

### 聊天主界面

- `Home` 首页房间视图
- `Direct` 私聊会话视图
- `Space` 空间 / 分组视图
- `Explore` 公共社区探索页
- `Inbox` 收件箱页
- `Create` 创建入口
- 响应式布局与移动端适配
- 侧边栏导航、未读提醒、常用入口切换

相关目录：

- [`src/app/pages/client/home`](./src/app/pages/client/home)
- [`src/app/pages/client/direct`](./src/app/pages/client/direct)
- [`src/app/pages/client/space`](./src/app/pages/client/space)
- [`src/app/pages/client/explore`](./src/app/pages/client/explore)
- [`src/app/pages/client/inbox`](./src/app/pages/client/inbox)
- [`src/app/pages/client/sidebar`](./src/app/pages/client/sidebar)

### 消息与媒体能力

- 文本消息渲染
- 链接、提及、富文本内容解析
- 图片、视频、音频、文件等消息展示
- Sticker 渲染
- 图片查看器与媒体预览
- 房间输入区扩展能力
- 通话状态展示与嵌入式通话容器

相关目录：

- [`src/app/features/room`](./src/app/features/room)
- [`src/app/components/message`](./src/app/components/message)
- [`src/app/components/image-viewer`](./src/app/components/image-viewer)
- [`src/app/pages/CallStatusRenderer.tsx`](./src/app/pages/CallStatusRenderer.tsx)

### 收藏系统

收藏功能是当前仓库里最完整的定制模块之一。

- 可在消息菜单中直接执行“收藏 / 取消收藏”
- 自动创建仅自己可见的“我的收藏”房间
- 将被收藏消息以副本形式保存，便于后续查看与管理
- 收藏页支持独立浏览与管理
- 支持以下分类：
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
- 图片 / 视频按图库方式展示
- 图片 / 视频点开后可查看详细信息
- 文本 / 音频 / 文件 / 其他类型保留消息式排布

相关目录：

- [`src/app/features/favorites`](./src/app/features/favorites)
- [`src/app/pages/client/favorites`](./src/app/pages/client/favorites)
- [`src/app/pages/client/sidebar/FavoritesTab.tsx`](./src/app/pages/client/sidebar/FavoritesTab.tsx)

### 圣经工具

这是当前仓库中另一个明显的增强模块。

- 侧边栏可直接打开圣经窗口
- 房间输入区也可调用圣经弹窗
- 基于本地 [`Bible1.csv`](./Bible1.csv) 数据读取经文
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
- [`src/app/pages/client/sidebar/BibleTab.tsx`](./src/app/pages/client/sidebar/BibleTab.tsx)
- [`src/app/features/room/RoomInput.tsx`](./src/app/features/room/RoomInput.tsx)

### 收件箱与辅助功能

- 通知页
- 邀请页
- 搜索弹窗
- 创建房间弹窗
- 创建空间弹窗
- 房间设置与空间设置
- 用户房间资料展示
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

相关配置：

- [`package.json`](./package.json)
- [`vite.config.js`](./vite.config.js)
- [`tsconfig.json`](./tsconfig.json)

## 目录理解建议

如果你准备继续研究结构，建议按下面顺序阅读：

1. 路由入口  
   从 [`src/app/pages/Router.tsx`](./src/app/pages/Router.tsx) 入手，先看页面如何装配。

2. 页面层  
   重点查看 [`src/app/pages/client`](./src/app/pages/client) 下的 `home`、`direct`、`space`、`favorites`、`inbox`。

3. 功能层  
   重点查看 [`src/app/features`](./src/app/features) 下的 `room`、`favorites`、`bible`、`search` 等业务模块。

4. 组件层  
   查看 [`src/app/components`](./src/app/components) 下的消息组件、媒体组件、弹窗组件和基础 UI 封装。

5. 状态与 hooks  
   查看 [`src/app/state`](./src/app/state) 和 [`src/app/hooks`](./src/app/hooks)。

## 本地开发

安装依赖并启动开发环境：

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

- 构建输出目录为 `dist/`
- 支持 Docker 部署
- 默认服务端与探索页配置在 [`config.json`](./config.json)
- 子目录部署可调整 [`build.config.ts`](./build.config.ts)
- 已提供基础部署配置：
  - [`Dockerfile`](./Dockerfile)
  - [`docker-nginx.conf`](./docker-nginx.conf)
  - [`netlify.toml`](./netlify.toml)
  - [`contrib`](./contrib)

## 后续适合继续扩展的方向

- 收藏页交互和视觉继续细化
- 收藏标签体系与批量管理增强
- 圣经工具与消息输入区的深度联动
- 更完整的中文化整理
- 移动端体验继续优化
- 开发注释、架构说明和二次开发文档补充

## 说明

- 本仓库基于 Cinny 进行本地化和功能扩展整理
- 如果你需要更偏上游官方的信息说明，可以另外参考原始上游仓库文档
- 当前 `README.md` 以本仓库实际功能为主，而不是上游 README 的逐字翻译
