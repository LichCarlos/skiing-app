# 雪场列表与收藏状态核对

2026-11-02当前续验：[雪场详情/本人收藏](favorites-lifecycle.md)补齐固定epoch、完整VO与缓存边界，新增80项，App56文件998项/Doctor20/20/三平台导出通过；同一雪场HTTP套件现为8项（原列表3项+详情/收藏5项），持久归属断言通过。下文635/三项保持列表原阶段范围，OpenAPI1.50.0/143操作保持。

2026-11-02，APP-04 / API-R01、API-F01；OpenAPI1.50.0保持，无接口/权限/依赖/迁移变化。本文更新列表阶段事实，早期文档的“公开标签待定版”已由D-44和现有`GET /resorts/fit-tags`替代。

`app/(tabs)/resorts.tsx`仅导出`src/features/resorts/resorts-screen.tsx`。原列表以mutation loading防重复，仅锁一个卡片并反转旧favoriteByMe，失败后也可直接重试。现接入既有FavoriteRun同步门禁，提交明确目标前读最新详情/复核账号和grant；已有目标状态则不发命令。网络不明时不重放命令，尝试只读核对；读回失败则锁住所有卡片，保留目标，由“核对上次操作的收藏状态”恢复。

共享`favorite-ports.ts`捕获账号/session epoch，阻止旧会话的读写和缓存失效；写前取消当前账号收藏、雪场及文章的列表/详情请求，补上原hook遗漏的公开列表。只失效当前账号相关缓存，不反转卡片字段，不影响另一账号或公开标签缓存。hook失焦时停止工作，旧epoch清理不取消新会话查询。该改动也用于原收藏列表、文章/雪场详情，完整App回归验证其兼容性。

列表按账号/account/认证状态/grants/epoch重建操作实例，焦点代次进入列表和标签Query键；失焦取消查询并隐藏旧卡片，重新聚焦读取最新页。筛选应用/清除按账号和完整条件前缀重置分页，仍匹配附加焦点代次后的Query键；操作中不应用新条件。游客只读且favoriteByMe强制false；没有member:favorite:toggle的账号不显示收藏控件。401/403即使存在旧缓存也隐藏卡片，普通刷新/更多失败保留已有公开列表并给出独立重试反馈。

`readResorts`读前/读后复核身份，传no-store和调用方epoch。分页校验页码、页大小、非负整数total、hasNext布尔、条数、正int4 ID、重复ID及收藏布尔；公开标签校验结构和重复value。前端不添加merchantId或依赖硬编码商家角色。地区、整数票价、评分、状态、成对参考坐标、四类排序、全包含多标签保持既定协议。

本阶段专项5文件143项（新增32项：数据边界15、真实QueryClient端口7、Native/Router/Query替身静态渲染10）。完整App35文件635项、lint零警告/typecheck/Doctor20/20及iOS/Android/Web导出通过，产物dist/resort-list-flow-validation。独立命令：`pnpm install --frozen-lockfile`、`pnpm exec vitest run src/features/resorts src/features/favorites`、`pnpm check`、`pnpm exec expo export --platform all --output-dir dist/resort-list-flow-validation`。初次格式命令的Windows括号路径转义和渲染夹具city/startingPrice类型问题已修复，失败日志resort-list-flow保留。

独立`pnpm test:resort-list-http`三项真实Native风格HTTP→Nest/PostgreSQL通过：22公开/1非公开雪场，标签全包含、隐藏标签过滤、零距离、20+2分页；明确收藏/取消/重复添加、实际列表缓存重读和跨账号隔离；真实204提交后注入响应丢失及详情503，阻止新写入并在恢复后只读核对。实际QueryClient、FavoriteRun、平台API/auth均参与；仅Native SecureStore替换，后端API/数据库不替换。后台verify断言两账号分别只收藏各自雪场。复现见[后端专用夹具](../../../backend/docs/engineering/resort-list-http-validation.md)。

2026-11-02已核对本仓expo~58.0.22、expo-router~58.0.29，变更前阅读[SDK58](https://docs.expo.dev/versions/v58.0.0/)、[文档目录](https://docs.expo.dev/llms.txt)及[Router焦点规范](https://docs.expo.dev/router/reference/focus-handling.md)，实际使用稳定useCallback和失焦清理。未添加原生模块。

本阶段不证明原生设备交互、真实SecureStore、Expo Web认证、模型/Embedding或生产恢复；静态替身渲染不是设备交互，原生风格HTTP不等于浏览器Cookie流程。同步锁仅单个页面实例，完全卸载不保留持久未知台账；失焦不能撤销服务端已提交写入，跨设备并发仍以最新读回状态为准。项目整体仍在进行。
