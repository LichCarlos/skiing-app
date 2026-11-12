# Android原生模拟器验收

日期：2026-11-04。使用D盘独立Android SDK及新建API35/x86_64模拟器，官方Expo Go58.0.5运行本仓SDK58/React Native0.88.1应用。实际通过11项场景；这不是独立签名安装包、物理真机或iOS验收。原用户AVD配置未改动。

## 已验流程

| ID  | 实际结果                                                                                |
| --- | --------------------------------------------------------------------------------------- |
| N01 | 游客通过真实Backend读取动态、雪场和知识                                                 |
| N02 | UI注册写库，成功后无会话、不自动登录                                                    |
| N03 | UI登录，专用库产生一个有效会话                                                          |
| N04 | force-stop杀进程后重开，SecureStore恢复refresh并轮换，仍是原会话，无第二次登录          |
| N05 | 后台/前台切换保留身份                                                                   |
| N06 | UI退出，Backend撤销会话                                                                 |
| N07 | 退出后再次杀进程重开仍为游客                                                            |
| N09 | 原生UI创建会话/发送问题，真实DeepSeek SSE回答17:00并显示S1/S2授权来源，库中保存两条消息 |
| N10 | 进程重启后读取同一AI会话，回答与引用仍在                                                |
| N11 | 文章收藏、本人收藏列表、取消收藏均在UI/数据库核对，最终收藏计数0                        |
| N12 | 保存昵称NativeUpdated，数据库与个人中心读取一致                                         |

N08未执行，不计入结果。认证7项由原始驱动与修正的续跑完成；AI和后续流程也包含脚本修正后续跑，不能称为单次无失败整套测试。保留的失败为自动化选择/滚动/Expo Go暖启动深链/脚本工具提取问题：根深链保留当前tab、退出按钮在屏幕下方、实际按钮叫新建对话、工具前缀遗漏函数、暖深链未切换目标。暖深链后以进程冷启动明确路由；未以此证明正式App深链或完整导航链通过。原始失败JSON、XML及截图保留在D:/linji-android-device/20261104。

## 产品修复

实际Android发现四个底部tab未指定图标，显示缺失图形。app/(tabs)/_layout.tsx使用已有expo-symbols的SymbolView显式配置：Android/Web为forum、landscape、menu_book、account_circle；iOS为SF Symbols。选中颜色和尺寸由导航器传入。未新增依赖或修改业务协议。Android健康雪场页截图已核对四图标；iOS/Web仅完成构建导出，不冒充平台视觉验收。Metro有manifest assets解析警告，原日志保留，当前图标显示已单独核验。

## 真实服务与边界

Backend来自独立源码副本，使用编译AppModule及正式HTTP配置。PG17.11/pgvector0.8.1、24迁移/双seed、MinIO、ClamAV、本地BGE-M3及DeepSeek为真实服务；本轮没有启动Kafka消费者。合成雪场、文章、项目知识和动态先执行正式RAG回填。问题为When does the native service desk close?，回答引用项目知识17:00结束服务和公开雪场。只记录1次成功原生对话；Embedding调用次数未单独计数，不据此推算。此前24项Kafka/模型和8项回填CLI证据仍独立有效，本轮没有重跑。

请求元数据仅记录方法、路径、状态及凭证头是否存在，不保存令牌/密码。所有本轮原生请求均无Origin/Cookie/Set-Cookie；受保护请求使用Bearer。SecureStore使用Expo Go原生模块，冷恢复与退出后匿名均有后端会话/refresh轮换核对；不宣称Android备份恢复、卸载、硬件安全性、iOS Keychain或签名App存储命名空间已验。

三仓新D盘副本分别冻结安装/check。Backend1462单测、20源码工具、177HTTP、build/OpenAPI；Web3045业务、20源码工具、20发布工具、官网/Admin双无缓存构建与standalone；App1217业务、20源码工具、10产物工具、Doctor20/20、三平台导出与封存迁移全部通过，共25条工程命令。Backend原有6条lint警告保持。OpenAPI1.51.1/143操作、schema/24迁移与依赖保持。

## 复现与资源收尾

在本仓冻结安装后设置设备可达的EXPO_PUBLIC_API_BASE_URL，用pnpm start启动原生Metro；只将本次专用设备与专用端口做adb reverse，切勿操作其他项目模拟器或服务。按上表用合成账号/内容完成操作，同时由Backend负责人读取专用测试库核对会话与业务状态。脚本位于上述D盘目录，仅绑定emulator-5560和本轮动态端口，依赖本机夹具，不是可直接面向业务库执行的通用测试入口。官方APK SHA256为d979cf81c56c5432c5aa69adc9497521ee72d1f87e92eee33bc949167a40f1a6，签名验证通过。

本轮自有模拟器、Metro、Backend、PG、MinIO、ClamAV、BGE进程已停止；服务端口关闭、对象桶为空，原用户AVD配置哈希一致。合成数据库保留在D盘证据目录，未清空，不含真实业务数据；随机密码文件已移除。未启动/重启Docker，未启动Next生产服务或Expo Web，未触碰另一个8081项目服务，未上传EAS/签名或提交推送。

结构化报告：[三仓同版证据](../validation/android-emulator-20261104.json)。真实设备、iOS、SecureStore备份/恢复、签名包、完整浏览器、远程CI和生产环境仍待验，整体目标未完成。

官方依据（2026-11-04查阅）：[SDK58](https://docs.expo.dev/versions/v58.0.0/)、[SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/)、[Symbols](https://docs.expo.dev/versions/v58.0.0/sdk/symbols/)。
