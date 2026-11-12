# 本人动态页面生命周期与删除恢复

日期：2026-11-02。对应 APP-12 / API-C05，沿用 OpenAPI 1.49.0，不新增路由、字段、权限或依赖。后端仍是授权与软删除的唯一执行方。

## 本轮发现与修复

原详情仅用 useMutation 的异步 loading 控制按钮，没有同步锁，也没有在保留页面失焦时取消请求；错误后可直接再点删除。列表和详情虽按账号分区缓存，但缺少本人查询前后的身份核对，错误或重进页面可能展示旧私有内容。

本轮使用本仓 `OwnDynamicRun` 管理一个账号与动态目标，`useFocusEffect` 为焦点生命周期入口。离开页面立即终止本次生命周期并取消读取/删除，迟到回调不能修改页面、缓存或导航；失焦时已发出的删除视为结果不明。重新聚焦重新核对，不把旧 ready 状态带入新生命周期。不能撤销服务端已经提交的写入。

列表使用账号、状态、页码和焦点代次的查询键；新焦点代次不会先展示上一轮缓存。查询前后读取 `/auth/me`，要求账号相符且有 `community:dynamic:read-own`，结果还须匹配页码与作者。切换筛选重置第一页，缩减后的末页自动回退；加载、错误和失焦时不展示本人旧记录。服务端状态由 TanStack Query 管理，页码/筛选/确认由组件管理，不持久化正文。

详情只接受规范正 int4 路径，拒绝小数、科学计数、前导零、数组和越界值。读取前后核对账号与 read-own；即使缓存仍在，未完成当前核对、正在刷新或读取报错时也不展示正文/图片/编辑入口。只读账号隐藏编辑与删除。创建入口使用 create grant；编辑和删除均沿用正式 `community:dynamic:update-own`，不发明 delete-own 权限。

## 删除协议

1. 显式确认后同步获取操作锁；核对当前账号及 read-own/update-own 权限。
2. 从受保护的本人详情接口重新核对当前目标与作者，再次复核身份/权限后发送原 DELETE。接口不接收客户端 authorId/merchantId。
3. 明确成功后清除本人详情、公开详情/评论缓存，失效本人列表和公开信息流，再返回本人列表；缓存刷新失败不把已确认删除误判成结果不明。
4. 4xx（408除外）明确拒绝后要求刷新；网络、408、5xx 等不确定响应锁定操作，不自动重放。必须刷新看到动态仍存在并显式确认已核对，才可重新操作。404可能表示删除或不可见，不能仅凭它宣称删除成功。

恢复状态仅在当前页面实例保留，失焦保留实例时继续生效；完全卸载后没有跨重挂载的持久删除台账，重开页面仍须重新查询、确认和写前核对。既有 DELETE 无客户端幂等键，本轮不新增。所有这些客户端门禁不能替代后端所有权/RBAC/事务授权；服务端快照开始后的撤权取消仍不作保证。

## 来源与工程落点

当前依赖 Expo ~58.0.22、React Native 0.88.1。2026-11-02 查阅 [SDK 58](https://docs.expo.dev/versions/v58.0.0/)、[官方文档索引](https://docs.expo.dev/llms.txt)、[Router focus handling](https://docs.expo.dev/router/reference/focus-handling.md)（页面 modificationDate 2026-10-12）：useFocusEffect 包裹 useCallback，清理在失焦、依赖变化和卸载执行。官方文档提供 API 依据，未执行文中反馈提交等与本任务无关的动作。skills.sh 来源/固定提交继续见[本仓实践记录](skills-practices.md)。

| 层次                           | 文件                                                                   |
| ------------------------------ | ---------------------------------------------------------------------- |
| 路由与Query装配                | `app/profile/dynamics.tsx`、`app/profile/dynamics/[id].tsx`            |
| 权限、参数、缓存键、受保护读取 | `src/features/community/own-dynamics-query.ts`                         |
| 读取/删除生命周期              | `src/features/community/own-dynamic-run.ts`                            |
| 展示与只读/未知状态            | `src/features/community/own-dynamic-detail.tsx`、`own-dynamics-ui.tsx` |
| 既有HTTP适配                   | `src/features/community/community-api.ts`；详情/删除新增int4本地拒绝   |

## 测试与限制

新增3个文件75项测试：生命周期23项、参数/身份/transport35项、展示/入口17项。覆盖同步锁、两阶段核对、失焦/迟到/重进页面、重叠读取、401/403/404/409/422、网络/408/5xx、显式恢复、目标不符、账号/授权变化与成功后UI失败。详情展示测试使用 Native/Router 替身和静态渲染，不能证明真实Native手势、焦点事件、照片或设备存储。没有把这75项称为设备或真实API端到端验收。

独立复验：

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm exec expo export --platform all --output-dir dist/own-dynamics-validation
```

专项可执行 `pnpm exec vitest run src/features/community/own-dynamic-run.test.ts src/features/community/own-dynamics-query.test.ts src/features/community/own-dynamic-detail.test.tsx`。首轮全量类型检查发现测试mock推断Promise<undefined>过窄、四个视图回调类型有unbound-method警告，已显式标注Promise<void>和函数属性；失败日志保留。最终结果以本仓README和阶段交付记录为准。

## 本轮验证结果

三仓独立冻结安装均通过，无锁文件变化。App最终lint零警告、typecheck、27文件418项测试和Doctor20/20通过，iOS/Android/Web导出至本仓已忽略的`dist/own-dynamics-validation/`。Backend128文件1017项单测、lint/typecheck/build通过；Web完整1432项、lint/typecheck/边界/契约/格式和官网/Admin构建通过，两个构建均复用Turbo缓存。最终焦点代次补充后再次执行App完整check；导出已包含该改动。

三仓OpenAPI仍1.49.0/142操作，SHA-256均为`9168fb665aa3c3e494be26d1429b7a76bc3869472fc25995d27443085e0c215a`。本轮没有新增服务端代码或migration，不重跑真实数据库/HTTP集成；此前的810项数据库/126HTTP仅是历史证据。所有日志保存在各仓`own-dynamics-*.log`且已忽略入库。未启动业务数据库、提交/推送或部署，设备/API成功流程、跨卸载持久核对及全项目验收仍未完成。
