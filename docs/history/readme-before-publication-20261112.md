# 首次公开推送前 README 归档

归档日期：2026-11-12。下文保留原阶段叙述，当前安装、版本与状态以仓库根 README 为准。

---

# 凛迹雪客 App

2026-11-06 本地增量：[原生按压与键盘反馈](docs/engineering/community-ui-feedback-20261106.md)，1260项全量测试通过；未重新打APK或真机验收，下面1.0.2包不含此增量。

2026-11-06 最新交付：[APK1.0.2与富文本](docs/engineering/markdown-release-20261106.md)，[立即下载arm64 APK](https://lichcarlos.top/snow-downloads/linji-snow-1.0.2-arm64.apk)。versionCode3，同测试证书可覆盖旧包，连接已更新的线上API；社区排版/图片/站内链接及文章阅读已包含。签名和公网下载哈希核对通过；未连接真机，安装与原生交互待验；下方旧包/未打包为历史。

2026-11-06 最新本地增量：[社区排版与Markdown阅读](docs/engineering/markdown-editor.md)。Expo Web使用Tiptap，原生使用轻量工具栏；图片和链接协议一致，OpenAPI1.53.0。**未部署、未更新APK**；以下安装包记录属于此前版本。

2026-11-05 最新交付：蓝色主体、红黄橙多巴胺撞色；[下载新版 1.0.1 arm64 APK](https://lichcarlos.top/snow-downloads/linji-snow-1.0.1-arm64.apk)。已签名并核对 HTTPS 下载哈希，连接线上 API，可覆盖安装此前测试包。1240 项测试、三平台 bundle 导出和 20 项浏览器检查通过，物理真机安装待验。详见[构建与交付说明](docs/engineering/dopamine-release.md)。

此前 UI 优化：[界面规范](DESIGN.md)、[工程验证与边界](docs/engineering/project-ui-system.md)。统一控件，修复 SDK58 Web 文档资产注入和游客字段查询；当时未更新 APK 的记录已由上述 1.0.1 交付替代。[冰蓝主题验证](docs/validation/ice-theme-20261105.json)保留为历史证据。

2026-11-05部署增量：[线上API与APK构建](docs/engineering/server-apk-delivery.md)。线上API为https://lichcarlos.top/snow-api/api/v1，[独立arm64 Release测试APK](https://lichcarlos.top/snow-downloads/linji-snow-1.0.0-arm64.apk)已签名、校验并上传，物理真机安装尚未验收；本机BGE-M3已接入服务器并通过真实RAG链路。

2026-11-05 收尾：五项闭环实现已交付。Backend1494单测/177框架HTTP/865真实DB、8项真实服务场景通过；Web3062业务测试及双生产构建通过；App1238测试、三平台导出及4项Android实操通过。完整浏览器、iOS/真机与新增依赖真实Kafka仍待验；构建和API测试不代替完整三端点击验收。 详见[本轮报告](docs/validation/business-closure-20261105.json)。

2026-11-05 当前基线 **OpenAPI 1.52.0 / 151 操作**。动态发布/编辑接入类型化扩展字段和权限差异提交；新增 `/catalog` 公开组合查询，雪场列表可进入。AI沿用现有对话协议，精确计数/排序由服务端执行；原生和Web认证仍分别适配。 [工程说明](docs/engineering/business-closure.md)与[本轮结果](docs/validation/business-closure-20261105.json)分别记录实现和验收。以下2026-11-04测试计数是历史，不能代替本轮复验。

独立Expo/TypeScript应用，面向Android、iOS与Web，通过Backend API获取数据；不依赖父目录清单、锁文件或源码。核对日期：2026-11-04。

上一阶段OpenAPI **1.51.1 / 143操作**，Expo SDK58、React Native0.88.1。最近独立冻结安装/check、1217业务测试、20源码工具与10产物工具、Doctor20/20及三平台导出通过，88文件产物封存/迁移校验通过。[产品报告](docs/validation/admin-asset-read-authorization-20261104.json)和[本轮文档核对](docs/validation/document-lifecycle-20261104.json)区分证据；本轮已重新冻结安装/check和三平台导出，见[本轮证据](docs/validation/five-source-kafka-rag-20261104.json)。

[工程文档索引](docs/README.md)含路由、凭证平台适配、状态恢复和发布说明；[历史README](docs/history/README-20261104.md)仅记录旧阶段。Android模拟器已完成SecureStore冷恢复/退出及真实API/AI等11项验收，SDK位于D盘；物理真机、iOS、备份恢复与签名安装包仍待验。云构建/上传及远程CI未执行，当前改动未提交/推送/发布。

本轮补充[RAG回填CLI验收报告](docs/validation/rag-backfill-cli-20261104.json)：8项真实PG/BGE-M3用例通过，三仓独立工程检查与构建/导出复验通过；未改产品接口、schema、前端行为或依赖。

本轮补充[Android原生模拟器验收](docs/validation/android-emulator-20261104.json)：11项场景通过，包括SecureStore进程重启/退出、真实RAG对话及历史引用、文章收藏与资料更新；三仓25条工程命令全部通过。Android真机、iOS与签名包仍待验。

最新专项：[SDK58原生上传修复](docs/validation/native-upload-20261104.json)。App使用Blob兼容文件替代旧URI multipart，头像实际上传/扫描/存储及账号绑定通过；多图社区完整原生链仍待验。三仓工程复验通过，失败与资源限制保留。

## 技术栈与目录

Expo SDK 58、Expo Router、React Native、TypeScript、TanStack Query、Expo SecureStore、OpenAPI TypeScript、Oxlint、Vitest、Expo Doctor。

2026-10-29 经 Expo 安装器将 React Native 与 Metro config 对齐为 0.88.1，沿用 SDK 58；兼容核对来源与既有 TypeScript peer 声明差异见 [工程实践记录](docs/engineering/skills-practices.md)。

| 路径                                                        | 职责                                            |
| ----------------------------------------------------------- | ----------------------------------------------- |
| `app/(tabs)/index.tsx`                                      | 动态首页                                        |
| `app/(tabs)/resorts.tsx`、`app/resorts/[resortId].tsx`      | 雪场列表与详情                                  |
| `app/(tabs)/knowledge.tsx`、`app/knowledge/[articleId].tsx` | 滑雪知识列表与阅读                              |
| `app/(tabs)/profile.tsx`                                    | 个人中心与登录/退出                             |
| `app/auth.tsx`                                              | 登录与注册                                      |
| `app/dynamics/[dynamicId].tsx`、`app/dynamics/create.tsx`   | 动态详情、评论、发布/编辑与图片上传             |
| `app/profile/favorites.tsx`                                 | 本人收藏                                        |
| `app/settings.tsx`                                          | 账号摘要、版本、本人改密与退出确认              |
| `app/ai/index.tsx`、`app/ai/[conversationId].tsx`           | 本人会话、流式回复、重试与引用                  |
| `src/platform/api`                                          | API transport、错误、SSE 解析和 OpenAPI 类型    |
| `src/platform/auth`                                         | 原生 SecureStore、Web Cookie 平台适配与会话恢复 |
| `src/platform/query`                                        | TanStack Query 配置                             |
| `src/features`                                              | 功能请求、状态与表单校验                        |
| `components`                                                | 通用展示组件                                    |
| `contracts`                                                 | Backend OpenAPI 快照与哈希锁                    |

## 本地开发

需要 Node.js 22（见 `.nvmrc`）、pnpm 11.25.0，以及 Expo Go、Development Build、模拟器或浏览器。仓库 `.npmrc` 固定官方 npm 源，避免依赖开发机全局镜像配置。Windows 可预览 Android/Web；iOS 本地原生构建需要 macOS 与 Xcode。

在本仓库根目录执行：

```powershell
Copy-Item .env.example .env
pnpm install --frozen-lockfile
pnpm start
```

按平台启动：`pnpm android`、`pnpm ios`、`pnpm web`。

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1
```

真机需改为设备可达的开发机局域网地址，并配置 Backend CORS、监听地址与防火墙。`EXPO_PUBLIC_*` 会进入客户端产物，只允许放公开配置，不放模型密钥、数据库密码或 JWT secret。

Expo Web 需使用支持 Web Locks 的 HTTPS/localhost 浏览器、可用站点存储、同站但不同 Origin 的 API，并将 UI Origin 加入后端 `WEB_ORIGINS`。不能混用 localhost/127.0.0.1；目前不支持同 Origin CSRF 代理，跨站部署及 Next/Expo 跨 Origin 共享 Cookie 并发切换尚未验收，详见[Expo Web认证说明](docs/engineering/expo-web-auth.md)。

## 业务与凭证边界

- 游客可浏览公开雪场、动态和知识；AI 首期仅供登录用户使用。商家和系统管理员的管理业务在 Web Admin 完成。
- 登录/注册、恢复/刷新/退出、雪场/收藏、动态/评论/发布、知识阅读与本人改密已接 API。注册成功不会自动登录。
- 原生access仅内存、refresh由SecureStore保存。Expo Web仅使用HttpOnly Cookie，写入前取CSRF；同Origin标签页用Web Locks串行协调Cookie响应，以非凭证revision/停用意图同步身份。401恢复最多重试一次，刷新/退出结果未知时停用会话并阻断自动恢复；不在浏览器存储令牌。
- AI 支持本人会话列表/创建/软删除、SSE 回复、停止、原 UUID 幂等重试与引用展示。收到 completed 前仅显示未确认片段。后端负责来源授权过滤；App 不接触模型凭证。
- 路由隐藏不替代授权，权限、数据范围和字段策略均由 Backend 强制执行。

本人动态列表、状态筛选、详情、完整图片/正文编辑和软删除已接 API。AI 使用当前问题、有限近期用户问题与本轮授权 RAG 检索结果；历史AI回答精确指代、目标设备与全部页面/API联合验收仍待完成；bundle 导出不代表业务验收完成。

动态发布和编辑支持图片排序/预览、原图移除与新图补充，以及公开雪场搜索、改绑和解除关联。只上传新图，旧图通过本人详情返回的 Asset ID 复用；账号切换/卸载后不再发后续写入，结果不明时引导本人列表核对。D-37 已实施，真实设备/API 验收待补。

收藏页支持雪场和文章详情跳转，雪场/文章收藏缓存均按账号隔离并联动列表/详情刷新；设置页提供账号摘要、配置版本、本人改密与退出确认。D-36 文章收藏状态、详情收藏/取消及未知结果核对已完成，隐私/协议入口已接入公开配置，正式政策正文待运营方配置；见 [系统配置](docs/engineering/system-config.md)。

## API 契约

Backend 发布 Swagger/OpenAPI，本仓库保存消费快照。当前 `contracts/openapi.json` 为 **1.51.1**，SHA-256：

`e5570e24af7bf5670cda3914591924f3c0d4321248c01ce0e7d2a95bd34745a8`

锁信息位于 `contracts/openapi.lock.json`，本地类型生成到 `src/platform/api/openapi.ts`。契约更新时先同步快照与锁，再执行 `pnpm openapi:generate`、`pnpm check`；不复制 Backend DTO、Prisma Entity 或实现代码。契约包含认证、系统管理、资产、雪场、文章/项目知识、收益、收藏、社区与 AI 本人会话接口，具体以快照为准。

## 检查与发布

| 命令                                   | 用途                                               |
| -------------------------------------- | -------------------------------------------------- |
| `pnpm lint`                            | Oxlint 静态检查                                    |
| `pnpm typecheck`                       | TypeScript 检查                                    |
| `pnpm test`                            | transport、表单、会话与 Query 单测                 |
| `pnpm test:expo-web-http`              | 专用夹具上的Cookie/CSRF真实HTTP五项                |
| `pnpm openapi:verify`                  | 契约哈希与生成类型一致性                           |
| `pnpm openapi:generate`                | 重新生成类型                                       |
| `pnpm check`                           | 契约、lint、类型、单测、源码/产物工具、Expo Doctor |
| `pnpm exec expo export --platform all` | 导出 iOS/Android/Web bundle                        |
| `pnpm release:check`                   | preview/production 原生配置与备份排除检查          |

GitHub Actions 位于 `.github/workflows/ci.yml`，执行 frozen install、检查、使用虚构身份的原生配置内省与三平台导出。`eas.json` 已提供 preview APK / production AAB 与 iOS 对应档位；发布环境必须提供真实应用标识、Expo owner、EAS project ID 和 HTTPS API 地址，配置缺失会阻断。SecureStore 插件已排除 Android 凭证备份。云构建、签名和设备验收仍待完成，详见 [原生发布工程说明](docs/engineering/native-release.md)。新增 Expo 原生依赖使用 `pnpm exec expo install`，按当前 SDK 对齐版本。

本目录独立提交和发布，不从父目录读取 package manifest、锁文件或源码。不提交 `.env`、签名、凭证、缓存和产物；三端通过版本化 API 协作，各自维护 Git 历史。

## 工程文档

- [个人中心入口与资料刷新](docs/engineering/profile-home-lifecycle.md)
- [登录与注册页面生命周期](docs/engineering/auth-form-lifecycle.md)
- [原生构建与发布配置](docs/engineering/native-release.md)

- [社区账号与操作隔离](docs/engineering/community-recovery.md)

- [知识目录与读取隔离](docs/engineering/public-knowledge-directory.md)

- [雪场组合筛选](docs/engineering/resort-directory.md)
- [我的动态工程说明](docs/engineering/own-dynamics.md)
- [动态发布与雪场关联](docs/engineering/dynamic-composer.md)
- [收藏与账号设置说明](docs/engineering/favorites-and-settings.md)
- [收藏跨页面运行期恢复](docs/engineering/favorite-runtime-recovery.md)
- [收藏列表与雪场详情生命周期](docs/engineering/favorites-lifecycle.md)
- [AI 对话工程说明](docs/engineering/ai-conversations.md)
- [skills.sh 实践来源](docs/engineering/skills-practices.md)

- [D-30 本人资料工程说明](docs/engineering/own-profile.md)

- [AI原请求跨页面恢复](docs/engineering/ai-runtime-recovery.md)

- [AI会话列表核对恢复](docs/engineering/ai-list-recovery.md)

源码接收校验：在安装依赖/创建.env前运行 `pnpm source:verify <副本绝对路径> <外部可信sourceSha256>`，或直接用Node运行校验器。详见[独立源码导出与冷安装](docs/engineering/source-export.md)。

- [SDK58兼容版本维护](docs/engineering/sdk58-maintenance-20261104.md)
