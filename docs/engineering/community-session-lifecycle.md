# 社区动态的会话与焦点隔离

2026-11-02，APP-01/02 按既定 API-C01/C02/C03/C04 续验。OpenAPI 1.50.0/143 操作保持一致，没有增加业务协议、依赖或数据库迁移。

## 实现

动态广场和公开详情改为薄路由，代码放在本仓 `src/features/community/feed-screen.tsx` 和 `dynamic-detail-screen.tsx`。原实现仅在卸载时关闭写入门禁，评论查询不区分登录会话，同账号重登录可能沿用旧查询和本地表单。现在子树按账号、有效 grants 和 epoch 重建；列表、详情、评论缓存包含 epoch，焦点代次保证返回页面重新读取。失焦取消本会话查询与写入，迟到回调不能更新新会话缓存。

[community-session.ts](../../src/features/community/community-session.ts) 捕获固定 epoch，所有请求带 expectedSessionEpoch、AbortSignal、no-store；登录用户公开读取前后核对身份，游客强制 likedByMe=false。响应检查公开状态、ID/目标、作者、时间、图片数量、计数、分页和重复 ID，防止异常响应进入页面。

点赞先读取最新服务端状态，再发明确 PUT/DELETE，避免直接反转过时页面值；写入前核对独立 grant，动态删除另核对作者。界面同时按 grant 显示或禁用操作，最终所有权与权限由后端负责。详情重新读取期间隐藏历史内容，读取失败不继续显示旧详情；评论刷新失败隐藏旧评论并保留重试入口。信息流普通网络错误保留已有列表，401/403 隐藏个人投影。

[CommunityActionGate](../../src/features/community/community-action-gate.ts) 保留同步锁，在实际命令发送前标记 attempted，准备读取失败不误判为写入未知。提交成功后再核对原会话；确认写入与后续刷新失败分别处理。若失焦时请求已发送但未确认，返回页面仍锁定新提交，用户需要刷新核对并显式确认后继续。评论没有服务端幂等键，不能自动重放；此门禁不保证跨设备或进程重启去重。

## 验证

- 新增 47 项：会话端口 13、响应边界 18、提交门禁 5、页面接线 11；社区专项共 10 文件 182 项通过。
- App 完整 41 文件 732 项、lint 零警告、typecheck、Doctor 20/20、iOS/Android/Web export 通过。页面接线测试替换 Native、Router 和 Query hooks，只验证接线及输出。
- 独立 `pnpm test:community-http` 四项使用实际 API/auth/session、门禁和 QueryClient，经编译后 Nest HTTP 连接一次性 PostgreSQL/pgvector；仅 Native SecureStore 替换为测试内存存储。这里不调用模型或对象存储。
- 真实 HTTP 验证游客 20+2 游标分页、待审核/隐藏排除、点赞同步锁与账号隔离、越权删除、评论已提交后合成丢响应/阻止重发/显式核对、21 条评论 20+1 分页、本人评论及动态软删除、旧 epoch 在请求前拒绝。
- 后端另核对 24 条动态剩余 21 条公开、21 条评论中丢响应内容恰好一条、动态与评论各软删一条、点赞只属于原账号。23 迁移、双 seed、前后 db:verify 通过。
- 三仓冻结安装通过；Backend 130 文件 1039 项及 check/build，Web 1459 项 check 与官网/Admin build 通过，两项 Web 构建命中缓存。完整历史数据库/HTTP 套件未重跑。

本轮没有关闭检查或忽略失败测试。独立证据为本地忽略的 `community-mobile-*.log`，导出位于 D 盘独立产物目录；正式仓库不依赖这些绝对路径。

## HTTP 复现

本仓测试不导入后端源码、不访问数据库。由后端负责人创建专用回环 `linji_community_mobile_validation` 数据库、迁移/双 seed、核验并生成合成夹具，运行编译后 API；测试要求独立的合成管理员账号与密码。然后在本仓设置：

```powershell
$env:EXPO_PUBLIC_API_BASE_URL='http://127.0.0.1:62920/api/v1'
$env:COMMUNITY_MOBILE_FIXTURE_JSON='<后端提供的夹具JSON>'
$env:COMMUNITY_MOBILE_FIXTURE_PASSWORD='<合成用户密码>'
$env:COMMUNITY_MOBILE_ADMIN_ACCOUNT='<合成管理员账号>'
$env:COMMUNITY_MOBILE_ADMIN_PASSWORD='<合成管理员密码>'
pnpm test:community-http
```

测试会注册两个用户并通过正式 API 发布/审核合成动态、评论和点赞，必须使用一次性空库。App 只能检查回环地址和夹具标记，无法经 HTTP 证明后端数据库连接目标；运行者须核对服务端配置。用例按顺序执行，重复运行需重新创建专用空库。结束后由后端核验持久结果并清理自己的服务与数据库。

## 依据与未完成项

本轮读取 [Expo SDK58](https://docs.expo.dev/versions/v58.0.0/)、[文档索引](https://docs.expo.dev/llms.txt)和 [Router useFocusEffect](https://docs.expo.dev/versions/v58.0.0/sdk/router.md#usefocuseffecteffect-do_not_pass_a_second_prop)。焦点回调使用 useCallback，并在失焦时清理。

发布编辑页及图片上传本轮未改写；原生导航/键盘/SecureStore、Expo Web 认证、真实对象存储/模型供应商、在途撤权完整时序、生产恢复和远程 CI 仍待验。本轮 HTTP 和导出结果不能替代这些验收，项目整体仍进行中。
