# 凛迹雪客 · skiing-app

基于 Expo 的 Android、iOS 与 Web 客户端，支持雪场、知识、社区、多图写作、收藏、资料和 AI。与官网保持新粗野主义配色，底部导航和按钮使用圆角，保留手机安全区、字号和深色模式。

| 仓库                                                           | 职责                            | 推荐顺序 |
| -------------------------------------------------------------- | ------------------------------- | -------- |
| [skiing-backend](https://github.com/LichCarlos/skiing-backend) | API、身份权限、上传审核、AI/RAG | 1        |
| [skiing-web](https://github.com/LichCarlos/skiing-web)         | 官网与桌面管理端                | 2        |
| **skiing-app（本仓）**                                         | Expo Web / Android / iOS        | 3        |

## 1. 从空白电脑到第一个安装包

**先读[完整从零教程](docs/guide/from-zero.md)。** 从 Windows/Ubuntu 工具安装、Backend、Web、模型、服务器 HTTPS，到 App 预览和 EAS APK，三个仓库都附独立可读版本。

推荐顺序：**浏览器跑通 API → 移动状态和会话 → 模拟器/手机调试 → 身份与 HTTPS → 签名 APK → 实机业务验收**。只需生成安装包可用 EAS，不必先装本地 Android SDK。

| 目标                | 必须条件                                       | 产物                    |
| ------------------- | ---------------------------------------------- | ----------------------- |
| Expo Web 学习       | Git、Node、pnpm、现代浏览器、API               | 浏览器页面              |
| Android 本地调试    | JDK/SDK、模拟器或 USB 设备                     | 通常依赖 Metro 的调试包 |
| EAS Android preview | Expo/EAS 账号、项目、真实身份、签名、HTTPS API | 可安装 APK              |
| Android production  | 正式身份、持续签名/版本、分发账号              | 商店 AAB                |
| iOS                 | Apple 身份、签名、渠道；本地需 macOS/Xcode     | iOS 构建或商店材料      |

`expo export` 是 JS/assets，不是 APK；源码 push 不会自动更新已安装应用。

## 2. 版本和下载

| 工具/框架                   | 当前基线                                                                         | 来源                                                                        |
| --------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Node.js                     | **22.16.0**，engines >=22.14.0                                                   | [官方下载与校验和](https://nodejs.org/dist/v22.16.0/)                       |
| pnpm                        | **11.25.0**                                                                      | `npm install --global pnpm@11.25.0`                                         |
| Git                         | 2.47+                                                                            | [官方下载](https://git-scm.com/downloads)                                   |
| Expo / React Native / React | **58.0.24 / 0.88.1 / 19.3.0**，实际解析以锁文件为准                              | 冻结安装，不装全局 Expo                                                     |
| TypeScript / TanStack Query | **6 / 5**                                                                        | 锁文件                                                                      |
| JDK（可选）                 | **21**                                                                           | [Temurin 21](https://adoptium.net/temurin/releases/?version=21)             |
| Android SDK（可选）         | Platform **37**、Build Tools **37.0.0**、NDK **27.1.12297006**、CMake **3.22.1** | [Android Studio/SDK Manager](https://developer.android.com/studio)          |
| EAS CLI（云构建）           | **27.10.0**，发布时记录云镜像                                                    | `npx --yes eas-cli@27.10.0`、[官方说明](https://docs.expo.dev/build/setup/) |

Windows 11 能开发 Android/Web，不能本地编译 iOS。建议 16 GB 内存，同时运行模拟器和完整后端建议 32 GB。[手册第 1 节](docs/guide/from-zero.md)提供下载、PATH、WSL2 和 Ubuntu 命令。Node 为复现基线，公开生产使用受支持的最新 22.x 安全补丁并检查。

按 [SDK 58 文档](https://docs.expo.dev/versions/v58.0.0/)使用 API；新模块用 `pnpm exec expo install <包>`，原生变化可能需重建客户端。Expo Go 的版本和模块支持需单独确认，教程不依赖它一定可用。

## 3. 安装和浏览器预览

```bash
git clone https://github.com/LichCarlos/skiing-app.git
cd skiing-app
node --version
npm install --global pnpm@11.25.0
pnpm --version
pnpm install --frozen-lockfile
pnpm exec expo-doctor
```

复制 `.env.example` 为 `.env`：PowerShell 用 `Copy-Item .env.example .env`，Bash 用 `cp .env.example .env`。本机浏览器配置：

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1
```

先按 [Backend 教程](https://github.com/LichCarlos/skiing-backend/blob/main/docs/guide/from-zero.md)准备 API、数据库、管理员和私有桶。后端 WEB_ORIGINS 加入 Expo 实际 Origin，常为 `http://localhost:8081`，修改后重启 API。自己创建公开内容，新库没有线上数据。

```bash
pnpm web
```

按终端 URL 验证动态、雪场、知识、我的。API 地址改动后重启 Metro，发布包需重构建。Web 需要 Cookie/CSRF、安全上下文、Web Locks，统一 localhost/HTTPS，不混用 host。

原生 access token 仅内存，refresh 在 SecureStore；退出和切号须隔离缓存。模型 Key、JWT secret、数据库或存储秘密不能放入 EXPO_PUBLIC_*。

## 4. 循序渐进地学习

| 阶段 | 重点与入口                                     | 可观察练习                                 |
| ---- | ---------------------------------------------- | ------------------------------------------ |
| 1    | JS/TS、React、HTTP、Git                        | 独立安装，读懂响应和日志                   |
| 2    | Native 布局、主题、Pressable                   | 改只读卡片，保留圆角、焦点、字号和浅深主题 |
| 3    | Expo Router、安全区、返回；app/ 与 navigation  | 四入口和返回行为正常                       |
| 4    | Query 缓存、分页、空态/错误；features          | 完成一个只读列表和失败重试                 |
| 5    | SecureStore / Web Cookie / CSRF；platform/auth | 登录恢复、退出、切号不串数据               |
| 6    | 表单、相册权限、资产/审核；composer            | 上传→发布→审核→重新编辑                    |
| 7    | SSE、取消/重试、历史/引用；features/ai         | 真实回答流式显示并保存历史                 |
| 8    | 原生身份、签名、CI、设备验收                   | 构建自己的 APK，实机核对版本和 API         |

完整路线与官方资料见[learning-roadmap.md](docs/guide/learning-roadmap.md)。先做只读和测试，再做写入、权限和发布。

```text
app/                  Expo Router 路由
src/features/         screen/model/API 与业务测试
src/platform/         请求、会话、配置、原生/Web 适配
src/theme/            色彩、圆角、字号、边框 token
components/           公共展示
assets/               随包图片/字体
contracts/            OpenAPI 快照与锁
scripts/              契约、发布、源码/产物工具
app.config.ts         动态身份与环境绑定
eas.json              preview APK / production AAB
docs/                 教程与验收
```

android/ios 为生成目录，原生配置通过 app.json、app.config.ts 和插件维护；SDK/NDK 是工具，不提交源码。

## 5. 云构建 APK：不依赖作者电脑

[手册第 9.2 节](docs/guide/from-zero.md)提供完整账号、项目、变量和下载步骤：

```bash
npx --yes eas-cli@27.10.0 login
npx --yes eas-cli@27.10.0 whoami
npx --yes eas-cli@27.10.0 init
```

选择或创建自己的项目。本地进程和 EAS **preview** 环境均需真实公开身份：

| 变量                        | 规则                                                |
| --------------------------- | --------------------------------------------------- |
| LINJI_APP_ENV               | 本地预检查设 preview；云端 eas.json 按 profile 设置 |
| LINJI_ANDROID_PACKAGE       | 自己的 application ID，旧包更新必须沿用             |
| LINJI_IOS_BUNDLE_IDENTIFIER | 合法标识；当前即使只构建 Android 也校验它           |
| LINJI_EAS_PROJECT_ID        | 自己真实项目 UUID，不能填 CI 夹具                   |
| LINJI_EXPO_OWNER            | 有权限的 Expo 账号/组织                             |
| EXPO_PUBLIC_API_BASE_URL    | 手机可达、无凭证/查询参数的 HTTPS API               |

**仅写 .env 不够**：.easignore 排除 .env*，云端须在 EAS 对应 environment 配置；release:check 要求变量已进入本地进程。手册提供 PowerShell/Bash 赋值。动态 app.config.ts 按变量绑定，CLI 不能自动写入时不要覆盖配置。

真实身份和环境设置完后：

```bash
pnpm check
pnpm release:check
npx --yes eas-cli@27.10.0 build --profile preview --platform android
```

EAS 按提示使用或生成自己的 keystore；旧包更新必须保留应用 ID 和签名。记录 CLI 与云镜像版本，保存签名安全备份，构建可能消耗额度。下载 APK 存入本仓 **outputs/apk/**，附 SHA-256 和版本记录，再发到手机。

production Android 用 `--profile production --platform android` 输出 AAB，不能像 APK 点击安装。iOS 需 Apple 身份、签名及设备/商店渠道；当前没有自动商店提交或 OTA 配置。

此路径使用仓库公开配置和官方 EAS，不依赖作者私有 `runtime/builds/app/build-apk.ps1`；克隆后没有该脚本是正常情况。

## 6. 可选本地 Android 开发

按[手册第 9.3 节](docs/guide/from-zero.md)安装 JDK 21、SDK/NDK/CMake 与模拟器，设置 JAVA_HOME、ANDROID_HOME、PATH，检查 `java -version` 和 `adb devices -l`。开发模式设自用包名和 HTTPS API 后：

```bash
pnpm exec expo run:android --device
```

生成并安装调试包，通常需 Metro，不是正式分发包。已有匹配原生环境后用 `pnpm android` 启动开发器，它本身不生成可分发 APK。

模拟器访问电脑通常为 10.0.2.2，实体手机 localhost 指自己；HTTP 还受 Android cleartext 策略影响。安装包推荐已部署、可信 HTTPS API。Windows 深路径可改短路径独立副本与专属缓存，正式包优先 EAS。

## 7. 检查、导出与实机

```bash
pnpm check
pnpm exec expo export --platform all
```

| 命令                                        | 结果                                 |
| ------------------------------------------- | ------------------------------------ |
| pnpm lint / pnpm typecheck / pnpm test      | 代码、类型、业务测试                 |
| pnpm openapi:verify / pnpm openapi:generate | 契约校验 / 客户端类型                |
| pnpm exec expo export --platform all        | dist/ 内 JS/assets，不是 APK/AAB/IPA |
| pnpm release:check                          | 真实身份、HTTPS、原生备份规则        |
| pnpm artifact:seal / artifact:verify        | bundle 清单，参数见部署教程          |
| node scripts/check-repository.mjs           | Git 索引 SDK/凭证/产物边界           |

实机检查冷启动、四入口/圆角/字号/深色、登录恢复、切号、知识详情、相册授权/上传、AI 流式/历史、弱网/后台。记录设备/系统、包版本、证书公开指纹、API 环境、通过与待办；单测、浏览器、模拟器、实体手机分别记录。

## 8. 当前交付与排错

截至 **2026-11-19**，已构建签名 APK **1.0.4 / versionCode 5**，包名 com.linji.snow.preview，ARM64、Android 7.0+。本机位于 `outputs/apk/linji-snow-1.0.4-arm64.apk`。含官网风格、圆角导航与知识分类裁切修复；1265 项测试及最终包模拟器检查通过，实体手机由用户安装测试，尚无实体机通过结论。见[更新记录](docs/engineering/rounded-tabbar-20261119.md)。

**GitHub 克隆不包含本地 APK、签名或 SDK**，新开发者按教程构建自己的包。OpenAPI **1.55.0**；文章图片不设固定张数上限，单图、归属、扫描、正文/传输限制保留。

| 问题                  | 检查                                                     |
| --------------------- | -------------------------------------------------------- |
| 手机 API 不通         | localhost/10.0.2.2/局域网、HTTPS、证书、防火墙、网络策略 |
| Web 登录恢复失败      | Origin、安全上下文、Web Locks、Cookie/CSRF、host         |
| EAS 身份缺失          | 本地进程变量和所选 environment；.env 不上传              |
| Native module missing | 模块是否包含，需重建匹配开发包                           |
| 源码变但旧包不变      | push 不等于发布，需构建、签名、版本、安装                |
| 签名不一致            | 旧应用 ID/证书连续性，不贸然卸载重要数据                 |

入口：[从零教程](docs/guide/from-zero.md) · [路线](docs/guide/learning-roadmap.md) · [开发](docs/guide/development.md) · [发布回滚](docs/guide/deployment.md) · [安全](docs/guide/repository-security.md) · [索引](docs/README.md)。SDK、依赖、真实 .env、模型、keystore 和安装包不进 Git。CI 不自动部署、签名或提交商店。教程不代表任意新设备和云镜像已验收，请逐阶段保留自己的结果。
