# 2026-11-19 圆角按钮与底部导航

底部动态、雪场、知识、我的入口统一为 16dp 连续圆角，图标在上、文字在下，选中背景与 Android ripple 均沿实际按钮裁剪。保留路由事件、长按、无障碍选中状态与 Web 普通/修饰键链接行为。

共享 Pressable 默认使用 12dp 连续圆角；页面按按钮尺寸保留既有 8/12/16dp 圆角。身份重新读取入口改为真实按钮。知识分类横向列表禁止垂直伸缩，避免剩余高度分配使分类按钮底部被裁切。

版本为 1.0.4，Android versionCode 为 5，包名 `com.linji.snow.preview`，保持此前测试签名。最终交付文件在 `outputs/apk/linji-snow-1.0.4-arm64.apk`，校验和、构建信息及截图同目录保存。仅支持 ARM64，最低 Android 7.0 / API 24。

## 检查与边界

- lint 无错误和警告，TypeScript 类型检查通过，79 个测试文件共 1265 项测试通过。
- Expo Web 导出后，以 Chromium 实际点击四个入口，检查选中背景、16px 圆角、触控尺寸及浅色/深色截图。该导出仅用于 UI 和导航检查。
- Android Gradle 完整 release 构建、签名证书连续性、16KB zipalign 对齐、版本/架构/release 标志、内置 JS 和线上 API 地址、私钥与本地配置排除检查。
- Android 15 / API 35 模拟器检查四个入口、游客个人中心、登录页、1.3 倍系统字号和深色模式；验收脚本先等待目标页面文本及选中状态稳定，再截图。
- 未连接实体手机，未用真实账号执行登录、发文或 AI 写入。这些业务不因本次按钮样式检查而宣称完成验收。

最终 APK 的 SHA-256 为 `65ff183ba5337655612fff2a1dbc8a0111d192cb33b4322d5edad4335d7bdf16`。18:43 完成该包的模拟器安装及上述页面检查，知识分类按钮已确认完整显示。用户选择自行安装完成实体手机测试。

项目父目录 `runtime/maintenance/20261119/rounded-tabbar/` 保存详细日志和浏览器证据，`native-qa/` 保存原生验收记录；最终构建记录以 APK 目录中的 `build-info-1.0.4.json` 为准。

## 本地构建

使用父目录 `runtime/builds/app/build-apk.ps1`。`-Plan` 显示路径；常规执行导出源码、锁定依赖、检查、Expo prebuild、原生编译、签名和校验。构建副本、日志与专属缓存均位于项目父目录 `runtime/builds/app/<时间戳>/`，APK 位于 App 仓库 `outputs/apk/`。

Windows 临时 SUBST 盘符只用于缩短路径，结束时自动解除。Gradle init script 在项目解析、代码生成和 Hermes 打包阶段统一路径，并以 CMake job pools 限制 C++ 编译并发；无需修改生成的 Android 工程或依赖源码。`-Resume <时间戳> -NativeOnlyResume` 仅用于已有冻结清单、依赖和原生工程均已验证的构建；先核验源码摘要，再增量编译。

SDK/JDK 可使用共享安装目录；签名私钥、密码和构建副本不进入 Git。文件摘要使用 APK 旁的 `.sha256` 文件。
