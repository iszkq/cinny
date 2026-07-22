# 星火 Android APK

Android 版本使用 Capacitor 封装现有移动端 PWA。网页、Windows 客户端和 Android APK 共用同一套 React 代码。

## 使用 GitHub 构建测试 APK

1. 将项目推送到 GitHub。
2. 打开仓库的 `Actions` 页面。
3. 选择 `Build Android APK`。
4. 点击 `Run workflow`。
5. 构建完成后，在该次任务底部下载 `starfire-android-debug-*`。
6. 解压后得到可直接安装的 debug APK。

推送到 `dev`、`main` 或 `master` 分支时也会自动构建测试 APK。

## 正式签名 APK

正式分发前，在 GitHub 仓库 `Settings > Secrets and variables > Actions` 中配置：

- `ANDROID_KEYSTORE_BASE64`：JKS 签名文件的 Base64 内容。
- `ANDROID_KEY_ALIAS`：签名别名。
- `ANDROID_KEYSTORE_PASSWORD`：签名文件密码。
- `ANDROID_KEY_PASSWORD`：签名条目密码。

配置后可以手动构建并勾选 `build_signed_release`。推送 `v*` 标签时也会构建正式 APK，并附加到对应 GitHub Release。

签名文件和密码必须长期、安全保存。以后更新同一个 Android 应用必须继续使用同一份签名。

## 本地开发命令

```text
npm run android:sync
npm run android:open
```

`android:sync` 会先构建 PWA，再把 `dist` 同步到 Android 工程。`android:open` 需要本机安装 Android Studio。
