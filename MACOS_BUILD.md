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

麦克风和摄像头用途说明位于 `src-tauri/Info.macos.plist`。登录、消息同步、通话和 Office 在线服务仍需要可访问的服务器及账号。
