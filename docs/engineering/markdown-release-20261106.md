# APK1.0.2与富文本交付 · 2026-11-06

[下载新版APK](https://lichcarlos.top/snow-downloads/linji-snow-1.0.2-arm64.apk)。`1.0.2` / versionCode3，包名 `com.linji.snow.preview`，Android7+、arm64-v8a，38,008,662字节，约36.25MiB。同此前测试证书，可覆盖安装1.0.0/1.0.1；不需要Expo Go/Metro，不是Google Play正式发行或iOS包。

SHA256：`fdcbb4416108cc0a7ac4043cfca0f519e1df2052d000d2089daaf52554cb3297`。

连接线上HTTPS API `https://lichcarlos.top/snow-api/api/v1`；后端已迁移并部署1.53.0。原生社区为轻量Markdown工具栏、图片插入/预览和安全站内链接；知识/社区使用remark AST原生阅读。Tiptap仅Expo Web，不声称Android运行DOM编辑器。详见[功能说明](markdown-editor.md)。

冻结源码 `3cad4b320855c5d202475c9770ff4d87b2eb36119af30ba7b4ec82e22afe8492`，377文件。原生副本225个运行文件逐项核对，依赖集合一致；构建副本额外设置hoisted/storeDir，Expo prebuild生成原生工程并改写脚本，使用外部Gradle工具链init脚本，未手改原生工程或依赖源码。

本次lint零告警/类型检查通过；Expo58、RN0.88.1、JDK21/Gradle9.4.1、SDK37/NDK27.1，532任务成功。首次isolated长路径Ninja失败及修复保留日志。测试签名v2/v3、证书一致、版本/ABI/非debuggable、16KiB ZIP对齐、内嵌JS/API/格式标记均核验；ZIP对齐不是完整16KiB设备认证。

**没有可连接Android设备，尚未安装或真机验收。** 不把构建、前一阶段1254单测、三平台导出或17项官网/后台浏览器检查代替原生操作；中文输入法/选择/触控、图片授权/恢复需在实际手机验证。没有iOS包和Expo Web社区新交互验收。

签名密钥在仓库外私有目录，未进入APK下载、源码或报告；旧APK保留，不覆盖。升级无需清空账号数据；如降级旧包，需考虑新内容格式兼容，优先保留新版修复。

[报告](../validation/markdown-release-20261106.json)，原始构建/签名/下载证据 `D:/linji-local/20261106/markdown-release`。
