# 安卓后台推送待办

当前版本已提供登录页首次通知询问、应用内开关、Android 系统设置入口和本机测试通知。客户端仍在接收 Matrix 消息时，可发送系统通知。

**当前没有远程推送接收通道。** 手机系统挂起／清理应用后不能保证提醒；本机测试成功只验证通知权限和通知通道。

## 接通后台推送还需要什么

1. 确认目标手机支持哪种推送通道。支持 Google Play 服务的设备可配置 Firebase Cloud Messaging；不支持的设备需要另选适配通道，不能只依靠 FCM 覆盖所有手机。
2. 为 Android 包 `com.iszkq.starfire` 创建推送项目，取得对应 Android 客户端配置。
3. 准备可供 Matrix 家服务器访问的 HTTPS 推送网关，例如与该项目配套的 Sygnal。网关使用的服务端凭据应留在服务器，不能打进安装包。
4. 下一阶段客户端接入推送 SDK、后台消息接收、token 更新与 Matrix pusher 注册／注销，再重新打包。**本版尚未实现这一步，不能只填一个服务器地址就认为推送已开通。**
5. 在不同手机上验证前台、后台、锁屏、网络断开重连、退出账号及系统禁用通知；通知仍应保留计算器外观和现有解锁规则。

Matrix pusher 需要关联本应用的 app_id、设备推送 token 和完整推送网关 URI；优先采用 event_id_only，避免通过推送网关携带消息正文。退出账号或关闭远程通知时需注销对应 pusher，不能影响其他设备。

## 官方资料

- [Android 通知运行时权限](https://developer.android.com/about/versions/13/behavior-changes-all)
- [FCM Android 接入](https://firebase.google.com/docs/cloud-messaging/android/get-started)
- [FCM Android 接收消息](https://firebase.google.com/docs/cloud-messaging/android/receive-messages)
- [Sygnal 应用接入说明](https://github.com/matrix-org/sygnal/blob/main/docs/applications.md)
- [Matrix Push Gateway API](https://spec.matrix.org/latest/push-gateway-api/)
