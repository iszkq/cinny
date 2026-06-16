# 星火桌面端自动更新接入说明

当前源码已经接入了 Tauri 2 的更新插件、前端检查更新按钮、下载并安装流程，以及 Windows 打包时需要的 updater 产物开关。

## 一次性配置

1. 安装依赖：

   ```powershell
   npm install
   ```

2. 生成 updater 签名密钥：

   ```powershell
   npm run desktop:signer:generate -- -w "$env:USERPROFILE\\.tauri\\starfire.key"
   ```

3. 把生成出来的公钥内容填入 [tauri.conf.json](./tauri.conf.json) 的 `plugins.updater.pubkey`。

当前配置中的：

`REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY`

只是占位值，必须替换为你自己的 updater 公钥。

4. 在 GitHub 仓库 Secrets 里新增：

   - `TAURI_SIGNING_PRIVATE_KEY`
     填私钥文件内容，或者私钥文件路径。
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
     如果你的私钥有密码就填，没有可以留空字符串。

如果你本地没有 Node / npm，也可以不在本地构建，直接把源码推到 GitHub，使用仓库里的 Actions 自动打包。

## 本地手动发版

Windows PowerShell：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY="$env:USERPROFILE\\.tauri\\starfire.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run desktop:build:nsis
```

构建完成后，重点看这些目录：

- `src-tauri/target/release/bundle/nsis/`
- `src-tauri/target/release/bundle/`

## 需要上传到 GitHub Releases 的更新文件

至少上传下面这些 Windows 更新文件：

- `src-tauri/target/release/bundle/nsis/*-setup.exe`
- `src-tauri/target/release/bundle/nsis/*-setup.exe.sig`
- `src-tauri/target/release/bundle/**/latest.json`

如果构建结果里额外生成了其他 updater JSON，也一并上传同目录下的 `*.json`。

自动更新请求的地址目前配置为：

`https://github.com/iszkq/cinny/releases/latest/download/latest.json`

所以 GitHub Releases 里必须能通过这个地址直接访问到最新的 `latest.json`。

## GitHub Actions

仓库里的 [windows-installer.yml](../.github/workflows/windows-installer.yml) 已经补充为：

- 构建 NSIS 安装包
- 使用 `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 进行签名
- 上传 `.exe`
- 上传 `.sig`
- 上传 updater `latest.json`

如果你是打 tag 发版，建议 tag 形如：

`v4.12.0`

## 旧客户端更新处理

已经接入 Tauri updater 的旧桌面客户端会读取同一个地址：

`https://github.com/iszkq/cinny/releases/latest/download/latest.json`

所以只要 GitHub 最新 Release 里的 `latest.json` 指向新版本安装包，且版本号高于本机版本，旧客户端就可以通过“检查更新”发现新版本，不需要用户手动去 GitHub 拉取。

如果某次 Release 已经发布，但客户端检测不到更新，优先检查并替换该 Release 里的 `latest.json`，不需要重新打包安装程序。`signature` 字段应直接使用同名 `.sig` 文件内容，不要手动解码、改写或额外包一层 JSON。只有更早的安装包本身没有内置 updater 配置，或者内置了错误的更新地址/公钥时，才需要用户手动安装一次新版。

## Release checklist

- The desktop bundle version comes from `src-tauri/Cargo.toml`, so it must match the web/app version before tagging a release.
- The desktop bundle `productName` is intentionally kept ASCII (`Starfire`) so the signed installer filename and the uploaded GitHub Release asset name stay identical. The in-app UI branding can still remain `星火`.
- A valid Windows auto-update release must include the installer `.exe`, its `.sig`, and `latest.json`.
- With Tauri 2, the Windows build output itself only guarantees the installer and signature artifacts. `latest.json` is not expected to exist as a plain file under `src-tauri/target/release/bundle/`.
- This repository now generates `latest.json` in the tagged GitHub Actions release workflow after the NSIS bundle is built and signed, then uploads it to the GitHub Release with `gh release upload`.
- The updater `notes` field is generated as a short plain-text summary from the GitHub Release body so older desktop update dialogs stay compact. Keep the full release notes in the GitHub Release body.
- If a release was already published without `latest.json` or with the wrong desktop version, replace the release assets or publish a new tag such as `v4.12.1`.
- The GitHub Actions workflow now uses `tauri-action` only to build the Windows bundle. On `v*` tags, a follow-up step creates the GitHub Release if needed and uploads the exact built `.exe`, `.sig`, and generated `latest.json`.
- Do not rotate the updater signing key after users have installed a build. Existing desktop apps trust the `plugins.updater.pubkey` baked into that build; a release signed with a different private key can still be visible on GitHub, but Tauri will reject automatic installation.
