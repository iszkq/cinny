# iOS 安装包构建

最低系统版本为 iOS 16.0，真机架构为 arm64。目标包括 iOS 16.1；尚未完成真机验证，不能据此保证所有更高系统版本的全部功能。

## 环境

- 完整 Xcode 26 或以上，包含 iPhoneOS SDK；单独的 Command Line Tools 不足以编译。
- 当前 Mac 为 macOS 26.5.2，应从苹果开发者下载页选择兼容的 Xcode 26 版本。App Store 当前最新版要求 macOS 26.6。
- Node.js 22 或以上，以及项目 npm 依赖。

## 构建

在本项目目录运行：

```sh
npm run ios:build
```

脚本先检查 Xcode 和 iPhoneOS SDK，再执行前端检查、前端构建、Capacitor 同步、Release 真机编译，最后封装 `Payload/App.app` 为 IPA，并校验 ZIP 完整性。

默认使用 `/Applications/Xcode.app`。当前安装位于下载目录，运行 `DEVELOPER_DIR="$HOME/Downloads/Xcode.app/Contents/Developer" npm run ios:build`。也可将 `DEVELOPER_DIR` 指向其他安装位置的 `Contents/Developer` 目录。

输出位置为上一级「安装包」目录中的 `Calculator_<版本号>_build6_iOS16.ipa`。

这是未签名 IPA，供支持它的巨魔等安装方式使用，不适用于直接通过 App Store 或普通企业分发安装。应用最低系统要求与巨魔自身支持的系统版本是两个独立条件。

## 当前范围

Build 5 将 iOS 名称和图标改为「计算器」，默认冷启动仅显示完整计算器。输入本机当前 24 小时时间的四位数字（09:05 → 0905）立即解锁，无需按等号；跨分钟接受前一分钟。计算中的操作数和计算结果不会触发解锁。

解锁后通过「隐私设置」选择时间或 4–8 位 PIN、后台锁定时长和前台闲置时长。默认离开 30 秒、闲置 5 分钟锁定；重启始终锁定。后台原生遮挡用于隐藏多任务预览。PIN 使用随机盐与 PBKDF2 存储校验值，属于本地界面访问保护；时间模式不适合防止知道规则的人进入。

已通过 TypeScript、关键 ESLint、161 项自动化测试、WebKit 页面流程测试和 iOS 模拟器编译。iOS 16.0–16.3 正则兼容修复保留；实际 iOS 16.1 手机的登录、加密聊天、媒体与权限仍需真机验证。

PIN 与加盐校验值不经过服务器或账户同步。忘记 PIN 时，在计算器长按 AC 3 秒，使用原账户登录密码验证并重设本机 PIN。恢复只验证账户凭据，PIN 和校验值不包含在请求中；临时验证会话随后注销，保留原设备的聊天加密密钥。当前恢复支持账户密码登录。

Build 5 增加整页空间选择（头像＋名称）、当前空间及空白关闭、左上角返回、右滑返回和聊天左滑返回。大厅返回所属房间列表，通知设置逐级返回。状态栏字色与应用日夜主题同步，保留 iOS 16 正则兼容修复。

Build 6 按用户提供的 Element 截图重做移动界面：所有聊天列表包含各空间已加入的房间，房间名称 20 px、头像 54 px、两行摘要与时间，提供搜索及未读筛选。空间选择改成底部“我的空间”面板，头像＋名称大行距；顶部隐私设置与锁定收进更多菜单，两端聊天正文默认 20 px。摘要在当前设备生成，不上传额外内容；加密未就绪与撤回消息不展示旧内容。

## Build 7

同步修复原生聊天列表恢复与测量，标题／搜索／筛选随列表滚动；聊天页保留一个返回键和原房间菜单，隐藏额外的全局返回与横向更多按钮。我的空间标题旁恢复更多功能和设置菜单。前台空闲改用单调时钟，并记录点击、输入和滚动活动。

Build 7 验证：161 项测试、关键 ESLint、TypeScript 和 iOS 原生编译通过；实际构建页面通过 62 个模拟房间、未读筛选、标题滚动、单返回键、空间工具和设置入口的集成检查。未使用用户真实账号或 iOS 16.1 真机验证同步。

## Build 8

共享的全局资源恢复禁止对原生安装包自动重载页面，普通网络错误不再被当作模块资源过期。保留网页端真实模块加载失败的资源恢复。163 项测试及实际页面的网络／模块／CSS 错误注入检查通过；此修改保留启动锁定和原有超时规则。

### Build 11：会话失效恢复

iOS 与 Android 共用的 SessionLoggedOut 处理改为停止同步并显示“尝试恢复连接／重新登录”，避免自动重载带来的启动中断。保留本机缓存和密钥，持久化失败标记避免重开后自动重复使用失效会话。计算器锁定行为不变。输出 `Calculator_1.9.17_build11_iOS16.ipa`，最低 iOS 16.0，巨魔安装。

Build 11 验证：180 项单元测试、TypeScript 和关键 ESLint 检查通过；iOS 构建的 WebKit 测试先输入时间解锁，再模拟 SDK 401，验证停止重载、重开不自动重试、手动恢复后出现房间、主动重新登录保留本地存储。Xcode Release 编译及 IPA 压缩完整性检查通过；Info.plist 确认名称“计算器”、build 11、最低系统 16.0。未在用户真机和真实服务器上验证。

### Build 12：自动续期与有界启动

iOS 现与 Android 一样在登录时请求 refresh_token、保存并恢复完整凭据、交由 SDK 在需要时自动续期；临时刷新接口错误不会当作登录失效。取消原生端的远程设备列表启动注销检查，数据库打开和客户端初始化超时后显示可重试错误。复用移动端布局路由，缓存界面不因短暂断网被全屏启动页替换；真正失效时保留已经打开的缓存聊天并提示重新登录。计算器锁定规则不变。

输出：`Calculator_1.9.17_build12_iOS16.ipa`，build 12，最低 iOS 16.0。183 项测试通过；iOS 构建的 WebKit 测试验证短期凭据连续续期、临时 503 不退出、凭据轮换后重开、断网恢复，以及阻塞 IndexedDB 时退出无限启动。真机和用户服务器仍需实际复核。旧 iOS 登录未获得 refresh_token 的会话需要重新登录一次。

最终 Build 12 IPA 重建后再次通过永久拒绝场景：不自动刷新、重开不重用拒绝会话、手动恢复可加载房间、重新登录保留本地存储。压缩内的更新标记和 Info.plist（build 12／iOS 16.0／计算器）检查通过。

### Build 13：加密存储慢初始化恢复

Build 12 的 iOS 诊断显示 client_init_begin 两次、无服务器注销记录，截图定位到 opening the crypto store 超时。该超时涵盖整个加密准备流程，无法单凭该文本断言是物理数据库损坏。

修正：
- Rust 初始化没有取消 API，取消 8 秒 Promise.race 的假取消；移除整体初始化的丢弃式超时。同一原生账号/设备的未完成初始化共享 Promise，重试不会重复开启加密任务。慢任务结束后继续进入聊天。
- 20 秒仍未完成时，用明确的准备页面替代无限旋转，提供诊断复制和用户主动重新打开页面的入口；重新打开整个页面可清理旧运行环境，不清空本地数据。
- iOS 按准确数据库名只读探测，避免依赖可能无法返回的 indexedDB.databases()。仍保护旧密钥，不因探测不到而删除登录凭据。
- 已完成 Rust 初始化的会话与刚创建的新设备不挂接旧版全局 libolm 库，避免对不相关旧账号执行迁移；真正旧版升级迁移仍保留。
- SDK 固定阶段标签写入本机诊断：WASM、数据库、Olm、迁移重试、完成；不复制原始日志参数或密钥。

验证：186 项测试、类型和关键 ESLint 检查通过。iOS WebKit 故意延迟 WASM 24 秒且让 indexedDB.databases() 永不返回，仍能显示慢准备提示并自动进入房间；诊断确认仅一份初始化、一次客户端挂载；移动/平板宽度变化不重复打开客户端。续期、断网恢复和明确会话拒绝场景回归通过。未在用户真机重现，不能宣称已确认真实卡点是 WASM、数据库或迁移中的哪一步。

输出：`Calculator_1.9.17_build13_iOS16.ipa`（build 13，最低 iOS 16.0）。

### Build 14：苹果验证、剪贴板与连接恢复整理

本次只生成 iOS IPA，Android 的 Build 13 APK 和原生工程版本未改动。

- 确认此前扫码/表情/数字界面与 SDK 验证方法被 Android 条件限制。iOS 现在开放同一套主动验证入口和请求处理，SDK 同时声明 SAS、出示二维码、扫描二维码及相互确认；保留恢复密钥/口令途径。入口独立于服务器返回的设备列表。
- iOS 使用自定义 CAPBridgeViewController 注册 NativeClipboard 插件，在主线程写 UIPasteboard 并回读确认。仅 iOS 优先使用此桥接，Android 继续原剪贴板路径。异步生成解密诊断后不依赖 WebKit 的短时用户激活；若仍失败，保留可选择的完整报告文本。
- 系统权限弹窗只覆盖隐私画面，真正进入后台才广播暂停，避免首次相机授权就中断扫码。扫码已有相机拒绝/图片读取/退回 SAS 路径。
- iOS 前台恢复、页面可见和网络 online 时限频调用 SDK retryImmediately，不重建客户端或刷新页面；连接中断保留缓存聊天并提供立即重连。新增苹果连接诊断入口，记录 sync 错误名称、错误码与 HTTP 状态，不记录 token。

验证：189 项测试、类型和关键 ESLint 检查通过，Xcode iPhoneOS Release 与 Simulator Release 编译通过；独立测试 bundle 在 iOS 26.5 模拟器启动成功，确认自定义原生控制器可加载。iOS WebKit 测试：打包后的设置页在空设备列表时仍显示验证入口；模拟请求下 SAS 表情/数字切换与完成、出示 QR、图片二进制扫码、相互确认、过期 QR 回退通过。网页复制拒绝时可选择诊断文本；原生剪贴板调用分支及 Android 路径隔离单元测试通过。续期、重开、断网恢复回归通过。

限制：未使用用户真实账号与另一台 Element 进行端到端设备互验，也未在用户 iOS 16.1 真机实测系统剪贴板/相机；网络恢复回归是模拟服务器，不能据此认定用户服务器上的连接失败根因已确认。

输出：`Calculator_1.9.17_build14_iOS16.ipa`，build 14，最低 iOS 16.0。

### Build 15：定向设备验证与恢复密钥输入

用户 Build 14 截图显示，主动验证时抛出 `attempted to take ownership of Rust value while it was borrowed`。这是 SDK/WASM 内部错误，不能把它当作用户的恢复密钥错误。此前模拟请求对象的 UI 测试不足以验证真实加密调用。

- iOS 使用独立的 IOSOwnDeviceVerification：读取同账号其他设备列表，用户明确选择设备后，先通过 SDK 执行密钥查询，再调用 requestDeviceVerification。绕开截图报错时使用的 requestOwnUserVerification 广播入口；Android 保持原流程，未修改依赖版本或 WASM 对象释放方法。
- 列表加载/请求均阻止重复提交，离开页面后取消晚到的验证请求。失败诊断记录阶段及是否为 ownership 错误，不记录二维码密钥或 SAS 数据。
- iOS 恢复表单默认使用恢复密钥（即使账号同时配置了恢复口令），仍可切换恢复口令；清理 Base58 格式中不合法的空白、换行、NBSP 和不可见分隔字符，关闭输入自动更正。区分编码校验失败、与当前密钥配置不匹配和 Rust 内部错误。不会尝试猜测密钥。
- iOS 恢复前先确认服务器已有交叉签名身份；确认失败时停止恢复，不利用 bootstrap 生成替代身份。

验证：194 项测试通过，包含新增真实 SDK + 独立 Rust peer 的端到端协议测试：从生产 iOS helper 发起定向验证，对端实际接收/接受；SAS 双方实际生成相同数字并完成认证；另一轮实际生成/扫描 QR 二进制数据并完成双向确认。这两轮不是伪造 VerificationRequest 的 UI 成功状态。仍使用本地模拟 HTTP 路由，未使用用户真实账号或 iOS 16.1 真机。另测真实 SDK AES/MAC 恢复密钥校验，格式化输入通过、错误密钥拒绝且不写服务器。

iOS WebKit UI 回归：选择 peer 后刷新公钥并进入 SAS，明确禁止进入原广播 API；生产构建的设置页显示设备选择和空设备列表说明。旧身份/备份不重置，Android APK 保持 Build 13。

输出：`Calculator_1.9.17_build15_iOS16.ipa`（build 15，最低 iOS 16.0）。真机仍需覆盖安装后复核；测试不能证明已精确定位用户 iOS 16.1 WASM 内部哪一个对象的借用冲突。

Build 15 最终补充：真实 SAS 与 QR 协议测试均进一步断言 getUserVerificationStatus(...).isCrossSigningVerified() 为 true，确认完成后信任的是现有账号交叉签名身份；不仅检查协议阶段 Done。最终 IPA 的 build 15、最低 iOS 16.0、定向验证代码及不包含临时测试页面均已检查。

### Build 16：验证发送、接收与状态刷新

用户 Build 15 真机日志显示，多次 `ios_verification_keys_refresh` 后出现 ownershipError，未到 target_request；重新登录后另有 database_opening 长时间未完成。尚不能从这份日志确定 WASM 内部借用冲突及数据库挂起的完整根因。

本次仅发布 iOS：已知设备直接定向验证，仅 Not a known device 时补公钥查询；网络错误不重复发送。失败诊断增加固定 stage 标签。验证接收补读 SDK 在 React 监听挂载之前已收到的进行中请求，挂载、同步和回前台时检查，去重并延迟到 Rust 回调退出后显示。设备状态监听身份信任、密钥及备份事件，完成验证后重新检查备份；不把 localVerified 当成交叉签名验证成功。新设备首次创建数据库跳过会创建再中止事务的存在性探测；iOS 缺失数据库探测等待事务中止完成后再继续，保留全部旧数据库。

验证：新增已知设备绕过预检、模糊网络失败不重发、身份事件延迟合并、挂载前请求补取、实时请求去重、数据库事务中止顺序测试；沿用真实 SDK/Rust SAS 与二维码互验。自动化不等于 iOS 16.1 真机修复已确认，尤其未知设备预检的 ownershipError 和已挂起数据库仍需真机复核。本次没有重打包 Android。

Build 16 最终验证：200 项测试、TypeScript、critical ESLint 通过；Release 原生编译及 IPA 压缩校验通过。最终包版本 16 / 最低 iOS 16.0，含请求接收补取与状态刷新代码。WebKit 对最终 dist 的计算器解锁、聊天加载、设备验证入口和苹果诊断入口冒烟检查通过；不代表真机双向验证已确认。Android Build 13 文件未重打包。

### Build 17：保留验证错误提示，补齐 WASM 调用定位（诊断版）

Build 16 真机报告证实：token 多次成功轮换；主动验证连续在 target_request 阶段报 ownershipError；另有 incoming request received / pending received，结合截图说明接收成功、接受时报 WASM table access。尚未确定内部借用冲突根因，本版不声称扫码或表情验证已在用户 iOS 16.1 修复。

iOS 设备列表将错误放到设备按钮之前，避免长列表把提示藏在末尾；接受错误换行、可选择，并消费按钮失败 Promise，避免已显示的失败再次成为全局 unhandled rejection。仅 iOS 安装轻量调用观察器，记录 OlmMachine / Device / OwnUserIdentity / VerificationRequest 指定方法的固定操作名与错误类别，保留原始返回值和异常，重复安装及重复错误去重；不打印参数、密钥、服务器响应或原始异常字符串，不跳过验证、不改信任、不清数据库、不自动重发。

验证：202 项自动化测试（包含安装观察器后的真实 SDK/Rust SAS/QR 互验）通过；WebKit 实际组件模拟 40 台设备，确认发起失败提示在列表上方，接受失败保留对话框且不再出现 pageerror。最低 iOS 16.0，仅生成 iOS IPA，Android 未重打包。额外使用 WebKit 16.0 JavaScriptCore 独立内存机器试验可接受验证，但不等于重现完整 iOS 16.1 真机环境，不能由此排除旧 WebKit、存储或运行时状态问题。

### Build 18：同版加密模块的 iOS 兼容 ABI

Build 17 真机日志锁定顺序：Device.requestVerification 首先发生 wasm_bounds，Device.free 随后发生 ownership；接受请求时 VerificationRequest.acceptWithMethods 同样 wasm_bounds。因此不采用忽略 free、把设备强行设为已验证等方式。

从 matrix-sdk-crypto-wasm v18.4.0 原始源码 commit 16a138b7b0d3c761675e5086747553ce79877f0b、原始 Cargo.lock 重新编译，Rust 及 C 依赖均关闭 reference-types / multivalue / simd128，并重建 std。使用配套 wasm-bindgen 0.2.126 生成 JS 桥接；产物使用 JS heap / stack return ABI，确认不导出 __wbindgen_externrefs。没有改 Matrix 协议、加密算法或数据库格式。源码来源、编译方法、SHA256 在 vendor/ios-matrix-sdk-crypto-wasm 中。仅 VITE_IOS_APP 构建启用 alias；Android 保持 npm 原模块，未重打包。

这是针对真机 table-access 失败的兼容方案，尚不能证明具体 WebKit 缺陷，也不能声称已在用户手机确认修复。验证包括：兼容模块真实 SDK/Rust 双向 SAS 与 QR 验证成功并建立原身份信任；WebKit 使用原版持久化 IndexedDB 后，兼容版读取原设备 Ed25519 密钥、原交叉签名主密钥及已验证状态不变，原版可再次打开；WebKit 16.0 JavaScriptCore 独立内存设备成功发起、接收、接受，并立即释放发起 Device 无错误。iOS 构建脚本新增兼容后端真实互验检查，原版测试仍保留。

Build 18 最终检查：204 项默认测试及额外 2 项兼容后端真实互验通过，TypeScript / critical ESLint / 原生 Release 构建通过；IPA build 18、最低 iOS 16.0，内含 WASM SHA256 与 vendor/integrity.json 完全一致，无临时测试页面。对最终 dist 的计算器解锁、聊天加载、设置设备入口 WebKit 冒烟检查通过。Android APK 仍为原 Build 13（14:54 文件未改）。构建用临时 Rust target 已清理。

### Build 19：修复验证方式页面的 methods 崩溃

真机 Build 18 已能发出验证请求并得到对方响应，但进入 Ready 阶段页面报 not implemented。根因是 AndroidVerificationMethods 共用组件读取 request.methods，而 matrix-js-sdk 41.7.0 的 RustVerificationRequest.methods getter 明确抛出该错误，导致 React 页面在点击相机前已崩溃。

iOS 改为 otherPartySupportsMethod(m.sas.v1) 判断对方 SAS 能力，与扫码及出示二维码的既有能力查询一致；Android 分支及安装包未改。保留 Build 18 兼容 ABI。iOS 相机权限用途说明加入扫描设备验证二维码。

真实 SDK/Rust 测试现用真实 Ready request 渲染生产选择组件，明确断言 legacy methods getter 会抛错，同时断言扫码、出示二维码、表情／数字按钮均正确显示。WebKit UI 测试用抛错 getter 防回归，模拟拒绝相机权限后重试，确认调用后摄像头 getUserMedia、离开时释放流、显示 QR canvas、启动 SAS，且无 pageerror。模拟媒体不代表真机摄像头取景已验证。

### Build 20：iOS Matrix 读取网络通道与设备列表失败提示

Build 19 真机日志最新会话中，数据库正常完成，token 续期成功，但同步多次 AbortError；截图设备列表未返回。日志不足以证明是系统、代理或特定 SDK 超时造成中止，故不声称 20 秒客户端默认超时直接导致 sync（SDK 给 sync 单独设置了更长 deadline）。

iOS Matrix client GET 接入 CapacitorHttp / NSURLSession，显式保持 Authorization、已编码 URL、HTTP 状态及错误正文，由原 SDK 完成续期和 Matrix 错误处理；仅原生 iOS 注入，普通浏览器回退 fetch，Android 无注入。GET 原生读超时允许长轮询，SDK AbortSignal 可停止 JS 等待；Capacitor 无取消接口，底层 GET 由有限原生 deadline 结束。写入继续原路径，无自动重发。诊断只记录固定 endpoint 标签、耗时、状态、错误类别，不记录 URL、头、正文或凭据。

iOS 设备查询单次 15 秒 deadline，不隐式循环重试，查询缓存按服务器/用户/设备隔离。失败后显示说明与重试按钮，未知验证状态显示连接待恢复，不把网络错误显示为未验证。保留已加载数据和密钥。

新增测试：原生 GET 编码与凭据、长轮询读超时、真实 SDK 处理原生 401 后续期成功、写入不走原生/不重发、浏览器路径不改、SDK 取消后忽略晚到响应。尚需用户真机确认网络循环是否解决。

Build 20 最终验证：208 项默认测试、兼容加密后端的额外真实互验、TypeScript、critical ESLint、原生 Release 编译及 IPA 校验通过；包版本 20 / 最低 iOS 16.0，内含原生读取适配器。对最终 dist 模拟设备接口 503 后恢复，页面出现明确重试按钮，点击后恢复，检查通过。真实 NSURLSession 到用户服务器的效果未在用户 iPhone 上确认；Android 未重打包。
