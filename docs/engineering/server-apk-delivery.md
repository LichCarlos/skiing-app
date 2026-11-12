# 线上API与本地APK构建

2026-11-05，目标API为`https://lichcarlos.top/snow-api/api/v1`。原生端仍使用SecureStore refresh与内存access，Web认证仍走Cookie/CSRF适配。模型与数据库密钥只在Backend，不进入App。

构建副本原位于`D:/linji-local/20261105/app`，为缩短原生路径已移动到`D:/lsapp`，来自本轮项目源码，单独安装冻结依赖，再由Expo58 prebuild生成android。原仓不添加或手改android/ios。目标包名com.linji.snow.preview、版本1.0.0、arm64-v8a、assembleRelease并内嵌JS；本地development配置用于无需EAS账号的测试构建，不是Metro依赖包。已使用独立生成并保存在D盘private目录的本地测试密钥重新签名；正式商店签名尚未配置。

工具为Node22/JDK21、Gradle9.4.1、SDK37、NDK27.1。Windows较长pnpm隔离依赖路径导致CMake/Ninja重复生成失败；本次只在独立构建副本使用hoisted依赖与独立Ninja1.13.2，通过外部Gradle init script选择，不修改锁定业务依赖或手改生成工程。

APK已构建成功（532个Gradle任务，最终日志apk-build-13.log），经独立测试密钥重新签名。v2/v3签名、16KiB ZIP对齐、包名/版本、arm64-only、非debuggable、内嵌3,586,332字节JS及线上API地址均通过校验。最低Android API24（Android7），target API36，compile API37；本轮未做物理真机安装。原生Expo Go历史验收不代表此APK已安装。

下载：https://lichcarlos.top/snow-downloads/linji-snow-1.0.0-arm64.apk 。文件37,697,366字节（约35.95MiB），SHA256为`b8e01090593be221bc3c4397b92f8cd3b827fd11bdd3a45a93ade96109853f1c`；已实际通过公网HTTPS重新下载并比对字节哈希。四项线上原生令牌协议检查通过，包括无Cookie登录、Bearer读取、refresh轮换和退出失效。

独立证据见[本轮部署报告](../validation/server-deployment-20261105.json)。本地文件`D:/linji-local/20261105/linji-snow-1.0.0-arm64.apk`，桌面交付副本`E:/desktop/lishiqi/docs/07-交付归档/安装包/凛迹雪客-1.0.0-arm64.apk`。测试签名证书SHA256为`7c310a369ca97357ba29eac1775bf30fad9781de37a48999ad6ef40b0452eea8`，私有keystore及密码仅保存在D盘private目录，后续同包升级须保留同一密钥，未配置商店发布。

API与官网/后台已上线；真实HTTPS认证、图片上传扫描与签名读取、本地BGE-M3经SSH隧道的DeepSeek RAG引用链已通过。线上记录本机D:/linji-local/20261105。BGE-M3依赖Windows本机在线，服务器约2GB内存不加载该模型。真机/iOS和全部移动端流程仍待验。
