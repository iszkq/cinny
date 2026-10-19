# macOS 安装包

需要 macOS、Xcode Command Line Tools、Node.js >= 22 和 Rust stable。

```sh
npm ci
npm run desktop:build:mac
```

Tauri 自动合并 `src-tauri/tauri.macos.conf.json`。默认按当前 Mac 的 CPU 架构构建，输出位于 `src-tauri/target/release/bundle/`：`macos/Starfire.app` 和 `dmg/*.dmg`。打开 DMG，将 Starfire 拖入 Applications。

## 同时支持 Apple Silicon 和 Intel

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run desktop:build:mac:universal
```

输出位于 `src-tauri/target/universal-apple-darwin/release/bundle/`。

也可以在 GitHub Actions 中手动运行 **Build macOS installer** 工作流，完成后下载 `Starfire-macOS-universal` 构建产物。

## 签名和发布

此配置使用本地 ad-hoc 签名，未经过 Apple 公证。分发给其他 Mac 时，Gatekeeper 可能阻止首次打开；确认来源后，可在系统设置的“隐私与安全性”中允许打开。

正式分发需要 Developer ID Application 证书和 Apple 公证凭据，并通过额外的 Tauri 配置覆盖 `bundle.macOS.signingIdentity`。不要把证书或密钥提交到仓库。

当前 Mac 构建不生成自动更新签名产物。正式启用 Mac 自动更新前，需要配置项目的更新签名私钥，并在发布的 `latest.json` 中提供对应 darwin 架构条目。

## 客户端更新下载路径

Mac 客户端从 `https://api.github.com/repos/iszkq/cinny/releases/latest` 获取最新 Release，
选择其中的 `Starfire_<版本>_universal.dmg`，同时适用于 Apple Silicon 和 Intel。
Mac 不使用 Windows `latest.json` 中的 EXE 下载地址；DMG 尚未发布或 Release API 暂不可用时，
仅提供对应版本的发布页，不回退到 Windows 安装包。普通浏览器下载页继续沿用原有行为。

2.0.1 的下载地址为：
`https://github.com/iszkq/cinny/releases/download/v2.0.1/Starfire_2.0.1_universal.dmg`。

需要替换现有 Mac 包时，从 `dev` 分支手动运行：

```sh
gh workflow run macos-installer.yml --repo iszkq/cinny --ref dev -f release_tag=v2.0.1
```

该操作只替换 Mac DMG，不移动原标签，也不重建 Windows / Web / Android / iOS。
已安装原 2.0.1 Mac 客户端的用户需手动安装修复后的 DMG 一次；相同版本号不会触发升级。

麦克风和摄像头用途说明位于 `src-tauri/Info.macos.plist`。登录、消息同步、通话和 Office 在线服务仍需要可访问的服务器及账号。
