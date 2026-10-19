# Starfire 2.0.1 移植记录

## 来源与范围

- 来源：[kongtai123/starfire](https://github.com/kongtai123/starfire)，1.9.21，提交 `cd56827ea7b92f8d2b9043c8ac31bfb57464525e`。
- 当前目录无 Git 元数据，采用源码文件级移植；保留原许可证与作者署名。
- 纳入 iOS Capacitor 工程、iOS 16 兼容加密 WASM、原生 Matrix GET 网络通道、设备验证与恢复逻辑。
- 纳入 macOS Tauri 配置、权限用途说明、Apple Silicon / Intel 构建脚本及工作流。
- 纳入移动端会话续期、加密初始化复用、数据库恢复、网络恢复、媒体及生命周期改进。
- 排除聊天智能体设置、自动回复运行器、相关命令和智能体桌面后台驻留逻辑；保留通用 AI 助手和手动 Skill。

## 平台隔离

**后续回滚：Windows 和 Web 已固定回移植前的 1.9.10 源码。** Windows 安装包元数据仍为 2.0.1，Web 保持 1.9.10；macOS / iOS / Android 保留此次移植。构建与部署方式见 [WINDOWS_WEB_BUILD.md](WINDOWS_WEB_BUILD.md)。下文的共享源码验证及最初四平台发布记录描述的是回滚前的移植成果。

计算器入口、移动端名称及图标、隐私设置仅在 `VITE_ANDROID_APP=true` 或 `VITE_IOS_APP=true` 时启用。普通 Web / PWA、Windows 和 macOS 使用星火入口。iOS 兼容 WASM 只在 iOS 构建中替换，Android 和其他平台使用 npm 原模块。

`npm run android:sync` 与 `npm run ios:sync` 通过 Node 设置目标平台变量，支持 Windows 的前端构建与同步；iOS 原生编译仍需 Mac / Xcode。同步脚本先执行项目完整前置检查和构建，再执行 Capacitor 同步。

## 版本

应用版本统一为 `2.0.1`：npm 清单和锁文件、Tauri、Cargo 清单与锁文件、Android versionName 和 iOS MARKETING_VERSION。Android 默认 versionCode 为 `2000001`，仍支持 `calculatorVersionCode` 属性覆盖。界面版本通过 Vite 从 package.json 注入，避免直接调用 Vite 时显示旧版本。

后续更新使用 `node scripts/update-version.js <major.minor.patch>`，同时同步各平台版本。

## 本地验证

2026-10-19 在 Windows / Node 24 下完成：

- 锁文件指定依赖安装完成，缺失的 PDF.js / Inter 包从镜像下载后通过原锁文件 SHA512 校验，未更换版本。
- `npm run validate`：TypeScript、关键 ESLint、194 项测试全部通过，包含手动 Skill 不自动执行、空结果不发消息的回归检查。
- iOS 兼容后端额外 2 项真实 SDK / Rust SAS 与 QR 互验通过，并建立原身份信任。这里的“真实”指实际加密库，测试在本机内存设备中运行，不代表 iPhone 真机验证。
- Web 生产构建及 258 个资源引用校验通过；Android、iOS 前端构建通过。
- 三种构建资源完整性、版本 2.0.1、计算器入口隔离检查通过；iOS 产物 WASM 与 vendor 校验值一致。
- 修复 Windows checkout 对生成的 JS / CJS 换行转换导致的校验失败，恢复原始 LF 内容并添加 `.gitattributes`，保留原校验值。
- Windows `cargo check --locked` 在编译依赖时因缺少 MSVC `link.exe` 停止，尚未完成原生编译；Rust 格式检查因未安装 rustfmt 无法执行。当前环境也未执行 Android Gradle 打包。

本次检查日志保存在 `.local-validation/2.0.1/`（不进入版本库）。来源版本文档中的测试、模拟器和安装包记录不代表 2.0.1 已完成相同验证。

当前环境为 Windows，本地无法执行 Xcode / macOS 原生打包和 Apple 设备真机验证；macOS 正式签名、公证及自动更新配置沿用来源版本的限制。

## GitHub 构建与发布

已上传至 [iszkq/cinny](https://github.com/iszkq/cinny)，源码提交 `59c8849a21da33c881830fc4409448afa456e092`，标签 `v2.0.1`。四个平台的原生构建全部成功，产物已发布在 [Starfire 2.0.1](https://github.com/iszkq/cinny/releases/tag/v2.0.1)：

- [Windows x64 EXE](https://github.com/iszkq/cinny/actions/runs/39209993586)：含更新签名及 latest.json。
- [Android APK](https://github.com/iszkq/cinny/actions/runs/39209993532)：使用仓库已有发布证书签名。
- [macOS 通用 DMG](https://github.com/iszkq/cinny/actions/runs/39209993634)：Apple Silicon / Intel，ad-hoc 签名，未公证。
- [iOS 16+ IPA](https://github.com/iszkq/cinny/actions/runs/39211253075)：未签名。首次原生编译成功后，上传步骤因父目录模式被 artifact action 拒绝；提交 `ed54c4a225c5625c92455ae5876cf0939a1439d0` 修正流程，并检出原 `v2.0.1` 标签源码重新构建上传成功，未移动标签。

安装包本地副本位于 `.local-validation/2.0.1/packages/`，SHA256 已与 GitHub Release 记录核对一致。构建成功不等同于 Apple 真机功能验证。
