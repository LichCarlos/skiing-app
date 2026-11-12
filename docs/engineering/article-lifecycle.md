# 文章详情收藏生命周期

2026-11-02 当前续验：APP-07/API-K01/FAV-01已补齐固定登录epoch、账号/grants/路由子树隔离、完整VO校验和真实HTTP验收。下方“原阶段”保留较早实现范围。

## 当前实现与证据

路由只导出本仓功能页 `article-detail-screen.tsx`。工作区按账号、排序后的有效grants、session epoch、恢复状态和路由重建；详情Query key保留 `public-article,userId,articleId` 失效前缀，并加入epoch/焦点revision。恢复、失焦、无效路径及收藏写入期间禁用读取；关闭自动窗口聚焦/重连重试，返回页面以新的焦点revision重读。共享收藏hook沿用失焦取消和同步提交锁。

`article-detail-session.ts` 捕获一次登录，`readArticle` 的两次身份校验和内容请求全部传入同一 expectedSessionEpoch，且每个await之后再次检查。即使同一个账号重新登录，旧流程也不能继续发下一次请求或交付迟到内容。游客不查本人身份，favoriteByMe强制false；只读账号不要求收藏写grant。

详情与列表复用卡片字段校验，详情另校验目标ID和正文字符串，覆盖分类、可空作者/封面、发布时间和收藏布尔值。错误、未就绪或失焦时隐藏旧正文；收藏操作明确传入目标布尔值，成功或未知结果都重新读取服务端，不能反转旧卡片或自动重放。收藏后继续使用现有账号前缀使列表、详情缓存失效。

新增44项（会话16、详情响应17、页面接线11），知识模块9文件140项、完整App **52文件918项**、lint零警告/typecheck、Doctor20/20与iOS/Android/Web导出通过。产物 `D:/linji-article-detail-mobile/export-20261102`，本仓忽略的日志前缀 `article-detail-`。三仓冻结安装通过；Backend130文件1039项/check/build、Web1459项/check/官网及Admin构建通过，Web两构建缓存命中。

`pnpm test:knowledge-list-http` 扩展为 **7项通过**，包含原列表三项和新增详情四项。实际本仓transport/auth/session/FavoriteRun/QueryClient经编译Nest连接PostgreSQL17/pgvector；仅Native SecureStore为内存替身。验证公开完整正文及四类404、收藏账号归属、实际204写入后丢响应仅一次PUT并读取真值、明确DELETE取消、缓存失效而非假装更新旧卡片、同账号重登录旧读/旧收藏在HTTP前拒绝，以及真实详情响应延迟到新登录后被拒绝。后端再次核对18篇文章数量、三个账号及两条分别归属的收藏；23迁移、双seed、前后db:verify通过。完整历史数据库/HTTP套件没有在本轮重跑。

独立复现沿用本仓[知识列表HTTP说明](knowledge-list-lifecycle.md)的清单/密码环境和同一 `pnpm test:knowledge-list-http` 命令，API地址改为本轮的回环62960；后端负责人在自己的空专用库准备夹具和核验持久结果。本仓测试不导入后端源码，不连接数据库。测试有持久副作用，重复/失败重跑需重建专用库，不能清空业务库。

页面接线测试使用Native/Router/Query替身，不证明真机导航、SecureStore、浏览器点击或后台撤权后所有时序。Expo Web Cookie/CSRF已在上一阶段实施，其真实浏览器启动曾被自动审批审查拒绝；本轮未重试。文章接口仍无客户端条件版本锁，不能把前后身份预读称为原子授权保证；服务端负责实际命令授权。整体目标仍未完成。

本轮再次读取 [SDK58](https://docs.expo.dev/versions/v58.0.0/)、[文档索引](https://docs.expo.dev/llms.txt)和[Router hooks](https://docs.expo.dev/router/reference/hooks/)（2026-11-02，HTTP200），核对useFocusEffect及cleanup规则；无新增依赖、Skill、API或migration，OpenAPI1.50.0/143操作保持。

## 原阶段记录

2026-11-02；Expo ~58.0.22、Router ~58.0.29、React Native 0.88.1；消费 OpenAPI 1.50.0，无新增移动端管理页面、依赖或协议。

文章详情迁移至既有 `useFavoriteRun`，与雪场详情共用同步锁、明确目标状态、身份/grant复核和未知结果只读核对。移除 article-api 中重复的旧收藏写帮助函数；列表/详情改为 no-store，个人读取在前后两次验证身份，响应需匹配目标与 favoriteByMe 布尔值，路径校验正 int4。

失焦时取消当前用户 public-article 查询与收藏工作流；焦点 revision 进入详情 Query key。独立 article-detail-view 在失焦、会话恢复、加载、错误时隐藏旧内容；显示核对状态、游客登录、无 grant 只读及404后的未知结果恢复入口。没有封面时显示“暂无封面”，不再使用无关图库图。个人中心“我的收藏”改为绝对路由 `/profile/favorites`。

验证：`pnpm check` 完整30文件519项、lint/typecheck和Doctor20/20通过；`pnpm exec expo export --platform all --output-dir dist-password-reset` 已完成iOS/Android/Web导出。文章展示新增13项Native/Router替身静态渲染测试，article-api读取测试重写；收藏控制器沿用上一阶段真实有行为的测试。静态渲染和 transport mock 不证明真机导航、触摸、SecureStore或HTTP成功工作流。

修改前已查阅 [SDK58入口](https://docs.expo.dev/versions/v58.0.0/)、[Expo文档索引](https://docs.expo.dev/llms.txt)和[Router焦点处理](https://docs.expo.dev/router/reference/focus-handling/)，查阅日期2026-11-02；焦点页最后修改日期2026-10-12。缓存与凭证继续使用本仓既有Query/SecureStore边界，客户端不连接数据库或模型。

同步锁仅当前页面实例；完全卸载不保留未知收藏台账，重新进入须读取服务端状态。Settings本阶段仅审计，未改写其生命周期；真实设备、API、登录切换与生产供应商验收继续列为未完成。
