# 收藏跨页面恢复

日期：2026-11-03。对应 APP-04、APP-05、APP-07、APP-13 / API-F01。沿用 OpenAPI 1.51.1 / 143 操作，没有新增接口、权限、依赖或数据库迁移。

雪场列表、雪场详情、文章详情与本人收藏共用 `useFavoriteRun`。原控制器的同步锁和待核对目标只属于页面实例，完全卸载后，另一页面可能再次发出收藏命令。本轮新增 `FavoriteRecoveryLedger`，按 QueryClient 对象和账号 ID 共享运行期状态。它只记录目标类型、编号、是否收到写入确认及操作租约，不保存凭证、正文或目标值，也不重放命令。

控制器在异步准备前同步取得租约。离开页面会取消本地请求和订阅，但租约持续到旧异步任务结束；新页面此时不能写入或核对。任务结束且结果仍未知时，新页面只允许读取原目标的实际收藏状态。核对成功后解除门禁，并清除其他活动页面的待核对提示；确认写入但读取失败也继续要求核对。旧租约不能释放新操作的锁。读取期间其他页面开始操作时，账本版本变化会使旧读取失效。

同一账号在同一 QueryClient 中重新登录，仍需核对旧目标；所有请求继续捕获各自的 session epoch。另一个账号、另一个 QueryClient 与游客实例互相隔离。此实现覆盖当前运行期的页面卸载/重建，没有进程重启、完整浏览器刷新或跨设备的持久恢复能力。请求 Promise 结束也不能证明远端不存在尚未提交的请求；读回状态只代表该次读取所观察到的结果，后端幂等设置与事务仍是并发依据。

新增 17 项控制器/账本测试，收藏、雪场和知识专项合计 380 项。覆盖跨实例同步锁、卸载中任务、未知与已确认结果、明确 4xx、只读核对竞争、旧读失效、账号隔离和提示清除。它们替换 HTTP 端口，不代表设备或 React 导航验收。

既有独立 HTTP 套件改为使用同一账本工厂，并增加两项实际请求场景：服务端已提交但响应仍被延迟时重建控制器；响应丢失并读取失败后，在同一 QueryClient 中切换账号和重新登录。原响应丢失用例也改为完全替换控制器。真实测试使用原生风格认证、生产 API client、QueryClient 与编译 Nest/PostgreSQL，只有 SecureStore 用内存替身；HTTP 响应故障由 fetch 包装器注入。后置数据库要求两账号各仅保留一条不同雪场收藏，新场景的临时收藏已显式取消。

本阶段完整结果与日志哈希见[验证报告](../validation/app-favorite-recovery-20261103.json)，后端临时库步骤见[HTTP 工程说明](../../../backend/docs/engineering/app-favorite-recovery-http.md)。历史页面内状态的范围见[原生命周期记录](favorites-lifecycle.md)，以本篇为当前跨页面行为说明。

复现：本仓独立运行 `pnpm install --frozen-lockfile` 和 `pnpm check`；专项使用 `pnpm exec vitest run src/features/favorites/ src/features/resorts/ src/features/knowledge/`。HTTP 由后端独立准备临时库并运行编译服务，向本仓提供 `EXPO_PUBLIC_API_BASE_URL`、`RESORT_LIST_FIXTURE_JSON`、仅进程环境中的 `RESORT_LIST_FIXTURE_PASSWORD`，执行 `pnpm test:resort-list-http`。本仓不导入后端源码或连接数据库。

修改前核对 expo ~58.0.22 / expo-router ~58.0.29，读取 [SDK 58 文档](https://docs.expo.dev/versions/v58.0.0/)和 [Router hooks](https://docs.expo.dev/router/reference/hooks/)。沿用现有 useFocusEffect，没有添加 Expo API 或原生依赖。真实设备、浏览器与签名包仍待验，整体项目未完成。
