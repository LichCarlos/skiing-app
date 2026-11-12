# 凛迹雪客 · skiing-app

基于 Expo 的凛迹雪客 Android、iOS 与 Web 客户端。支持雪场目录、知识、社区动态、多图写作、收藏、个人资料和 AI 对话。业务由 [skiing-backend](https://github.com/LichCarlos/skiing-backend) 提供；服务官网与管理后台位于 [skiing-web](https://github.com/LichCarlos/skiing-web)。

## 当前状态

2026-11-12：源码已取消动态与正文图片的固定张数上限，150 张图片模型与解析测试通过，1263 项业务测试、lint 和类型检查通过；同步 OpenAPI **1.55.0**。**本次没有重新构建 APK/AAB/IPA**，线上既有安装包不包含这次 App 源码更新。见[图片更新记录](docs/engineering/article-images-20261112.md)。

此前交付过 1.0.2 arm64 测试签名 APK，物理真机与 iOS 验收仍有待办；旧文档中的阶段状态须按日期理解。测试、bundle 导出、签名构建、真机安装和应用商店发布是不同成果。

## 教程入口

| 目标                            | 文档                                               |
| ------------------------------- | -------------------------------------------------- |
| 理解整体业务与学习顺序          | [三仓技术学习路线](docs/guide/learning-roadmap.md) |
| 安装、模拟器/浏览器、API 联调   | [本地开发教程](docs/guide/development.md)          |
| 环境绑定、EAS、签名、验收和回滚 | [构建与发布教程](docs/guide/deployment.md)         |
| SDK / keystore / 凭证与 GitHub  | [仓库安全管理](docs/guide/repository-security.md)  |
| 查阅具体功能和历次结果          | [文档索引](docs/README.md)                         |

## 技术栈与目录

Expo **SDK 58**、React Native **0.88.1**、React **19.3.0**、Expo Router、TanStack Query **5**、SecureStore、Tiptap / Markdown、TypeScript **6**、Vitest、Oxlint。精确版本以 `package.json` 与 `pnpm-lock.yaml` 为准，Expo 相关依赖按 SDK 对齐。

```text
app/                  Expo Router 路由
src/features/         雪场、知识、社区、资料、收藏、AI 等业务
src/platform/         API、会话、配置和平台适配
components/           公共展示与主题组件
assets/               需随 App 交付的图片和字体
contracts/            OpenAPI 快照与锁文件
scripts/              契约、发布检查、源码与导出工具
test/                 集成夹具
app.config.ts         环境与原生身份绑定
eas.json              preview / production 构建档位
docs/                 开发、发布与工程记录
```

android/、ios/ 是可生成原生目录，SDK/NDK 是开发机工具，均不提交；配置通过 app.json/app.config.ts/plugins 维护。

## 快速开始

需要 Node.js **22.16.0**、pnpm **11.25.0**，以及模拟器、兼容 SDK 58 的运行环境或浏览器。Windows 可开发 Android/Web；本地 iOS 原生构建需要 macOS/Xcode，也可使用 EAS 云构建。

```bash
git clone https://github.com/LichCarlos/skiing-app.git
cd skiing-app
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
```

复制 `.env.example` 为本仓 `.env`（PowerShell：`Copy-Item .env.example .env`；Bash：`cp .env.example .env`）。

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1
```

```bash
pnpm start
# 按需选择一个平台
pnpm android
pnpm web
pnpm ios
```

手机中的 localhost 指手机自身：Android 官方模拟器访问宿主通常用 `http://10.0.2.2:8080/api/v1`，真机用可达局域网 IP 或已部署 HTTPS API。Expo Web 使用同站可信 Origin，加入后端 `WEB_ORIGINS`，避免混用 localhost 与 127.0.0.1。详见[网络与认证调试](docs/guide/development.md)。

## 凭证与平台边界

原生端 access token 仅在内存，refresh token 存 SecureStore；Web 使用 Cookie/CSRF 与浏览器锁协调。切换账号或失去会话时须清理/隔离业务缓存。后端始终验证身份、权限与数据范围。Chat/Embedding Key、数据库密码、存储秘密不能放入 EXPO_PUBLIC_*，也不进入客户端。

## 检查与导出

| 命令                                                                | 用途                                               |
| ------------------------------------------------------------------- | -------------------------------------------------- |
| `pnpm check`                                                        | 契约、lint、类型、业务/导出工具、Expo Doctor       |
| `pnpm lint` / `pnpm typecheck` / `pnpm test`                        | 独立质量检查                                       |
| `pnpm openapi:verify` / `pnpm openapi:generate`                     | 契约验证 / 生成类型                                |
| `pnpm exec expo export --platform all`                              | 三平台 JS / assets bundle 导出，非原生安装包       |
| `pnpm release:check`                                                | 当前 preview/production 环境身份及原生备份规则检查 |
| `pnpm artifact:seal <导出目录>` / `pnpm artifact:verify <导出目录>` | 封装并验证 bundle 导出清单                         |
| `pnpm source:export <新目录>`                                       | 独立源码交付副本                                   |
| `node scripts/check-repository.mjs`                                 | Git 索引 SDK/凭证/产物边界                         |

添加 Expo 依赖使用 `pnpm exec expo install <包>`；先阅读 [SDK 58 对应文档](https://docs.expo.dev/versions/v58.0.0/)，不要照搬其他 SDK 版本 API。原生模块变化可能需要新的 development build。

## 发布概览

`eas.json` 已提供 preview APK / internal 与 production AAB / store 档位。需先绑定实际 Expo 项目、应用 ID、HTTPS API 和签名。`.easignore` 独立控制上传范围，不自动继承 `.gitignore`。构建教程含完整环境表和设备验收清单；仓库没有自动商店提交或 OTA 更新配置。

`.github/workflows/ci.yml` 执行检查、虚构身份配置验证和三平台导出；`security.yml` 检查 SDK/凭证与历史秘密。工作流不会自动签名、推送安装包或更新线上 API。

详见[发布教程](docs/guide/deployment.md)、[安全管理](docs/guide/repository-security.md)与[公开前历史 README](docs/history/readme-before-publication-20261112.md)。
