# 收藏列表与雪场详情的状态核对

2026-11-03 收藏跨页面运行期恢复续验：当前跨页面范围以[共享账本说明](favorite-runtime-recovery.md)为准。雪场列表/详情、文章详情与本人收藏共用按QueryClient和账号隔离的运行期账本；页面卸载后仍保留未知目标和未结束异步任务租约，同账号重登录继续只读核对，另一账号不受影响。核对成功清除其他页面提示，其他实例写入使旧读失效。新增17项，收藏/雪场/知识专项380项通过。原页面实例内锁的段落属于历史实现。

2026-11-02 当前续验：APP-05/APP-13 已补齐固定登录代次、完整响应校验与缓存隔离，新增 **80项**，App完整 **56文件998项**、lint零警告/typecheck、Doctor20/20及iOS/Android/Web导出通过。专项9文件223项，真实HTTP由原3项扩为 **8项**。OpenAPI仍为1.50.0/143操作，无新接口、权限、依赖或migration。下方500/635项均保留原阶段范围。

路由 `app/resorts/[resortId].tsx`、`app/profile/favorites.tsx` 仅导出各自功能页。工作区包含账号、account、有效grants、认证恢复状态与session epoch；雪场工作区还包含路由。Query保留账号失效前缀并增加epoch/焦点代次，关闭窗口聚焦/网络恢复自动重读。失焦、恢复登录、无效路由或错误时隐藏旧数据；事件处理器同样检查读取/写入门禁。

`favorites-session.ts`捕获一次epoch。雪场详情的前置身份、公开详情、后置身份请求都传相同`expectedSessionEpoch`，每个await后检查；同账号重新登录也不接受旧响应。共享收藏端口将自己的epoch传给身份核对、状态读取和PUT/DELETE；不再由每个API调用重新捕获登录代次。本人收藏仍经FavoriteRun读前/读后核对账号与grant。

详情按生成`PublicResortDetailVO`检查地区、评分/计数、金额字符串、营业状态、标签、相册、雪况、坐标、时间和动态字段；官网链接仅接受HTTP(S)。收藏分页按`FavoritePageVO`检查offset条数、total、bigint字符串ID、日期、雪场/文章摘要、筛选、重复收藏与重复目标。无效响应作为错误处理，不将未知状态推断为取消成功。保留同步锁、明确目标及网络结果不明后的只读核对；没有新增跨卸载持久台账。

新增4个测试文件80项覆盖固定epoch/每个读取检查点、两种目标响应、分页/详情形状和Native/Router/Query替身页面接线；旧API测试夹具改为完整VO及一致分页。`pnpm test:resort-list-http`现有8项使用真实API/auth、FavoriteRun和QueryClient：原3项列表/丢响应流程，加上完整公开详情/非公开404、本人收藏20+2分页/类型筛选/显式取消/他人隔离、同账号重登录前零HTTP、详情与收藏各一次真实迟到响应被拒绝。只有原生SecureStore替换为内存存储；页面替身测试与HTTP均不代表设备/浏览器点击验收。

复现：独立冻结安装后运行`pnpm check`，专项为`pnpm exec vitest run src/features/favorites src/features/resorts`；HTTP需独立Backend负责人准备既有专用`linji_resort_list_validation`库/夹具，并提供API地址、非凭证清单JSON、临时测试密码，按`test/resort-list.http-spec.ts`的环境守卫运行。App不导入后端代码或访问数据库。导出命令`pnpm exec expo export --platform all --output-dir D:/linji-resort-detail-mobile/export-20261102`，输出目录可改为本仓发布产物路径。

本轮三仓冻结安装/check/构建通过：Backend130文件1039项、Web1459项且两个应用构建缓存命中。Backend实际验证23迁移/双seed/前后db:verify、两账号各一条不同雪场收藏，并在核对清单后清理模拟记录；专用API、PG容器/卷和临时凭证已清理。没有重跑完整历史数据库/HTTP/Kafka套件。实际设备/SecureStore、浏览器、模型/Embedding供应商、生产恢复与整体交付仍待验。

修改前再次核对expo~58.0.22、expo-router~58.0.29，并读取[SDK58文档](https://docs.expo.dev/versions/v58.0.0/)、[Expo文档索引](https://docs.expo.dev/llms.txt)、[Router hooks](https://docs.expo.dev/router/reference/hooks/)。沿用既有`useFavoriteRun`焦点清理，没有添加原生模块。

2026-11-02续验：雪场列表已接同一控制器，新增共享epoch/Query缓存端口，写前/失焦取消包含雪场及文章列表，旧会话不得读写或失效新会话缓存。三项真实App→Nest/PostgreSQL联调通过，完整App635项；见[列表生命周期与验收边界](resort-list-lifecycle.md)。下方1.49.0与82项是原阶段记录，当前契约为1.50.0。

日期：2026-11-02。对应 APP-05、APP-13 / API-R01、API-F01。沿用 OpenAPI 1.49.0 的公开详情与本人收藏接口，无新接口、权限、依赖或 migration。

## 行为与实现

原收藏列表只依赖异步 mutation loading，雪场详情通过反转旧布尔值更新缓存；保留页面失焦时没有完整取消，异常后可能直接再次写入。本轮两处页面共用 `FavoriteRun`，同步获取操作锁，先读取最新状态，再提交明确的目标值。已经等于目标值时跳过写入，不反转可能过时的状态。

收藏仍使用 `PUT /me/favorites` 和 `DELETE /me/favorites/:targetType/:targetId`，请求中不包含账号 ID。列表和操作均沿用 `member:favorite:toggle`；公开雪场浏览不要求该权限，游客显示登录入口，游客投影的 favoriteByMe 固定为 false。账号和权限检查由客户端辅助执行，服务端 RBAC、本人关系及事务仍是授权依据。

`src/features/favorites/favorites-api.ts` 使用生成的 DTO/VO 类型，限制路径 ID 为规范正 int4，检查分页、筛选、返回目标及布尔状态。本人列表读取前后复核 `/auth/me`；写入前先复核账号/权限，读取目标，再次复核身份。写入后读取实际状态并复核身份，才失效当前账号的收藏、雪场及文章缓存，不乐观反转状态。

`use-favorite-run.ts` 用 `useFocusEffect` 管理生命周期。页面按账号重新挂载，雪场详情另按目标重新挂载；焦点代次进入 Query 键，离开页面取消查询和操作，迟到响应不能更新缓存或 UI。收藏列表在加载、刷新、失败、失焦或写入时隐藏旧记录；雪场详情失焦隐藏，刷新时禁用收藏并显示核对状态。

## 异常结果

- 网络、408、5xx 或其他不能确定提交结果的错误：不重放写入，尝试读取目标的实际 favoriteByMe。
- 核对成功：只采用读回的真实状态；若与本次目标不同，提示可能已被其他操作更新。
- 核对失败：保留待核对目标，暂停新收藏写入，用户通过“核对上次操作的收藏状态”只读核对，不再发送原命令。
- 明确 4xx 拒绝（408 除外）：显示失败，要求刷新或重新登录，不自动重试。
- 已确认 204 但最新状态读取失败：明确提示服务端已确认操作、最新状态待核对，不把它描述为已知写入失败。

目标下架、撤回或删除后，收藏列表会隐藏该目标，公开详情也可能返回 404。这些结果不能证明某次取消已提交，因此不会据此显示取消成功。后端 DELETE 本身允许清理不可见目标；本轮客户端统一流程需要可读取目标状态，未引入新的关系状态查询接口。

历史范围（2026-11-02，已由[共享账本](favorite-runtime-recovery.md)扩展）：恢复状态当时仅保留于当前页面实例，完全卸载、进程退出后没有持久收藏台账。重开页面必须重新读取并在写前复核。同步锁属于当前页面实例，不是跨屏或跨设备锁；幂等设置、并发和所有权仍由后端处理。取消请求不能撤销服务端已经提交的操作。

## 来源与验证

当前 Expo ~58.0.22、React Native 0.88.1。2026-11-02 查阅 [SDK 58](https://docs.expo.dev/versions/v58.0.0/)、[官方索引](https://docs.expo.dev/llms.txt)及 [Router focus handling](https://docs.expo.dev/router/reference/focus-handling.md)：使用 useCallback 稳定焦点回调，并在失焦/依赖变化/卸载执行清理。skills.sh 的固定来源与应用位置见[实践记录](skills-practices.md)。

新增两个测试文件共 82 项：`favorite-run.test.ts` 29 项、`favorites-api.test.ts` 53 项。覆盖同步锁、明确目标、无须写入、账号/授权变化、五个阶段失焦、重进页面与迟到响应、列表读取被写入取代、确定拒绝、响应丢失、核对 403/404/500、目标不符、分页/ID/筛选边界、游客和只读权限。测试替换 HTTP 端口，不是原生设备或真实 API 验收。文章详情仍使用其既有实现，见[文章收藏](article-favorites.md)，本轮未将其改为共享控制器。

专项及独立复验命令：

```powershell
pnpm install --frozen-lockfile
pnpm exec vitest run src/features/favorites/
pnpm check
pnpm exec expo export --platform all --output-dir dist/favorites-flow-validation
```

首轮类型检查残留两个旧 mutation 引用，已移除；首轮控制器测试有两个 mock 队列未重置，暂停了错误阶段，修正后全部通过。失败日志与最终日志均保存在本仓 `favorites-flow-*.log`，已忽略入库。最终三仓检查、构建及导出结果见各仓 README 和交付记录。本轮不运行数据库/HTTP 集成，不启动模型、Broker 或业务服务；实际设备返回/手势、API 成功链路与跨卸载恢复仍未验收，项目整体未完成。

最终结果：App独立冻结安装、lint零警告/typecheck、29文件500项与Doctor20/20通过，iOS/Android/Web导出至dist/favorites-flow-validation/。Backend128文件1017项、check/build通过；Web完整1432项/check及双应用构建通过，两个构建均复用Turbo缓存。三仓OpenAPI1.49.0/142操作，SHA-256仍为9168fb665aa3c3e494be26d1429b7a76bc3869472fc25995d27443085e0c215a。
