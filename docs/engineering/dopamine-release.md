# 蓝色与红黄橙主题 APK 交付

2026-11-05，按用户要求以蓝色为主体，红、亮黄、橙承担强调与不同页面的色块，浅蓝和白色承载正文。主题定义见 [DESIGN.md](../../DESIGN.md)，本轮替代此前冰蓝/白主题。

## 安装包

- [下载 1.0.1 arm64 APK](https://lichcarlos.top/snow-downloads/linji-snow-1.0.1-arm64.apk)，37,705,558 字节，约 35.96 MiB。
- `versionCode=2`，包名 `com.linji.snow.preview`，Android 7.0+、arm64-v8a。
- 复用原测试签名，可覆盖此前 1.0.0 同包名版本；不需要 Expo Go 或本机 Metro。
- 内嵌 HTTPS API：`https://lichcarlos.top/snow-api/api/v1`。
- SHA-256：`ebc023de93f30bf20062f480f5637d538e6262c7ae90acc61d6ce4bc060fd1a2`。

## 构建与验证

独立源码导出 SHA-256 为 `cf06834bd3fb281b769430ae016b0f2b93c1ba13ccbf9843ac9bfefec82355ec`；原生构建副本 `D:/lsapp` 的 217 个运行相关文件已核对。使用 Expo SDK58 prebuild 生成 Android 工程，未手改原生目录。JDK21、Gradle9.4.1、Android SDK37、NDK27.1 构建完成，532 项任务通过。

v2/v3 签名、同证书、版本/ABI、非 debuggable、16KiB ZIP 对齐、内嵌 JS、API 地址及四种主题色检查通过。公开 HTTPS 下载返回 200，文件大小和 SHA-256 与签名原包相同。ZIP 对齐检查不代表已完成所有 Android 16KiB 设备兼容验收。

App 本轮 74 文件 / 1240 测试、lint、typecheck、Android/iOS/Web bundle 导出通过；Expo Web 20 项页面/状态检查通过。浏览器结果不替代原生触控、键盘、安全区与系统深色模式验收。没有可用 ARM 真机，本 APK 尚未实际安装验证；已有 x86_64 模拟器不兼容本包 ABI。

证据位于 `D:/linji-local/20261105/dopamine-release`，包括 `apk-build.log`、`apk-verification.json`、`apk-public-download.json`、`native-source-parity.json`、`app-visual-results.json`。密钥和密码仅保留于私有目录，未进入源码或公开下载目录。原 1.0.0 下载保留，未覆盖。
