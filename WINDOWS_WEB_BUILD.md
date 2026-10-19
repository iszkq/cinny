# Windows 与网页版本冻结

Windows 和 Web 的应用源码固定到移植前的 **1.9.10**，提交
`b3197a6ce2c369a8a40143759486c739a550a38e`。`windows-baseline.json`
记录此共同基准；准备脚本核验检出提交及源码差异，避免新平台移植改变旧客户端。

- Windows：独立检出到 `windows-client/`，保留旧 UI、样式、依赖和 Rust 实现；仅安装包版本元数据更新为 2.0.1。
- Web：独立检出到 `web-client/`，保留全部旧代码、版本号 1.9.10 和锁文件。
- 两者都清除历史配置中的内置 API 密钥，用户仍可自行配置。
- macOS / iOS / Android：继续从根目录的移植源码构建，不使用上述旧检出。

## 正式构建与部署

在 GitHub Actions 的 `dev` 分支执行：

```sh
gh workflow run windows-installer.yml --repo iszkq/cinny --ref dev -f release_tag=v2.0.1
gh workflow run deploy-pages.yml --repo iszkq/cinny --ref dev
gh workflow run build-artifact.yml --repo iszkq/cinny --ref dev -f app_base_path=/ -f hash_router_enabled=true
```

第一个工作流替换现有 v2.0.1 的 EXE、`.sig` 与 `latest.json`，不移动标签、创建新版本或改动其他平台附件。
第二个将旧网页部署到 GitHub Pages。第三个提供根域名 / 1Panel 使用的旧网页静态包。
Netlify、PR 网页预览、生产静态归档和生产 Docker 工作流也固定到相同的旧 Web 源码；Windows 调试工作流同样使用旧源码。

## 本地构建

先将本仓库上述基准提交独立检出到相应目录，然后在根目录准备：

```sh
node scripts/prepare-web-client.mjs web-client
node scripts/prepare-windows-client.mjs windows-client
```

准备脚本只接受未修改的基准检出，分别执行一次。在相应子目录执行 `npm ci`，再执行
`npm run build`（网页）或 `npm run desktop:build:nsis`（Windows）。Windows 需 Rust / MSVC 构建环境。
根目录的 `npm run build` 用于移植版源码验证；发布网页和 Windows 必须使用上述独立检出或工作流。

覆盖发布后，由于版本号仍是 2.0.1，已装原 2.0.1 的 Windows 客户端需要手动下载并安装替换包。

## 本次执行结果（2026-10-19）

- 修复源码提交：`f6a5c43abf01eb9ec56878913fd9801c9422d4a7`，已推送 `dev`；原 `v2.0.1` 标签未移动。
- [Windows 构建](https://github.com/iszkq/cinny/actions/runs/39214069233)成功，旧版的类型检查、关键 ESLint、101 项测试及原生编译通过，现有 v2.0.1 EXE / `.sig` / `latest.json` 已替换。
- EXE 大小 23,833,311 字节，SHA256：`dd0f487bf26acc5fd2c973f4c78b680ddff61a5cdbc0fa7dd7ab93fc37b3d040`。下载文件与 Release 摘要一致，已使用应用内公钥核验 Minisign / Ed25519 签名；清单版本、安装包 URL 和签名均匹配。
- [GitHub Pages](https://github.com/iszkq/cinny/actions/runs/39214073374)恢复部署成功；线上脚本和浏览器登录界面均显示 v1.9.10。[访问网页](https://iszkq.github.io/cinny/)。未执行账号登录后的聊天功能验证。
- [1Panel 静态包](https://github.com/iszkq/cinny/actions/runs/39214076987)构建成功，产物 `1panel-static` 已下载并核验旧版本和密钥清除；本地旧版 Web 生产构建验证 246 个资源引用通过。
- Netlify 工作流构建通过，但仓库未配置 Netlify 凭据，部署步骤跳过；实际网页恢复部署由 GitHub Pages 完成。
- macOS DMG、iOS IPA、Android APK 的 Release 资产 ID 及 SHA256 均与替换前一致，未重新上传这些附件。
