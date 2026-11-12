# 动态发布、雪场关联与预览

2026-11-02 APP-03 续验：当前消费 OpenAPI **1.50.0 / 143 操作**，未新增接口、依赖或 migration。以下带 2026-10 日期段落保留原阶段设计与验证边界；本轮证据以本节为准。

2026-11-04补充：[SDK58原生上传兼容修复](native-upload-validation.md)已将URI描述对象替换为File/Blob适配；头像原生真实链通过，多图社区完整链仍待验。下方原FormData描述及计数按历史日期阅读。

## 当前实现与生命周期

路由 `app/dynamics/create.tsx` 仅转出功能页面。`composer-model.ts` 负责严格正 int4 编辑目标、1–10000 Unicode 字符正文、最多 9 张图片、每张 10 MiB 及内容快照；`composer-session.ts` 捕获账号/目标/epoch，所有请求带固定 expectedSessionEpoch、AbortSignal、no-store。创建要求 create，编辑要求 read-own/update-own；上传、补偿另核对资产 grant，最终权限和归属仍由后端执行。

`ComposerRun` 用同步锁串行选图、上传及提交；失焦取消整个操作，迟到 picker 回调不能更新新焦点。页面子树按账号/grants/epoch/目标重建，查询加入焦点代次；失焦取消本人详情及雪场选择查询。刷新中、权限或详情失败时隐藏保留草稿；同一次页面返回保持未保存内容，不以后台读取覆盖输入。签名 URL 更新可刷新原图地址，不构成内容冲突。

编辑保存先重新读取本人详情，比较作者、目标、updatedAt、状态、正文、雪场及有序 Asset ID，变化时阻断保存并保留草稿；只有明确点击“重新载入最新内容”才替换草稿和基线。读取后到写入之间仍存在并发窗口：当前 PATCH 没有 expectedVersion，此检查不能替代服务端原子乐观锁。

实际 POST/PATCH 发出前才标记 attempted；编辑预检失败可补偿本次新上传图，原图永不补偿删除。命令已发但结果未知时保留资产并锁定再次提交；成功后导航失败保持 confirmed，不重新发送。失焦再返回仍保留当前控制器的 uncertain/confirmed。完全卸载、进程重启或跨设备没有持久幂等保证，POST 仍没有幂等键；孤立资产回收尚待完成。

## 本轮验证与独立复现

新增 57 项，composer 专项 5 文件 74 项；完整 App 45 文件 789 项、lint 零警告、typecheck、Doctor 20/20 及 iOS/Android/Web 导出通过，产物为 `D:/linji-composer-mobile/export-20261102`。页面接线测试使用 Native/Router/Query 替身，覆盖入口/权限、隐藏草稿、冲突、未知/确认状态和取消查询，不能证明原生相册交互。

`pnpm test:composer-http` 四项使用实际 api-client/auth-session/ComposerRun，经编译后的 Nest、PostgreSQL17/pgvector、真实 ClamAV 扫描；仅 Native SecureStore 和外部 S3 HTTP 为测试替身。验证创建两张图片、原图复用且只上传一张新图、图片顺序/雪场解除、已发布编辑复审、旧快照冲突和明确重载、他人 404/旧 epoch 无请求、提交后丢响应不重发。后端另核对两条 pending 动态、三张 ready 资产及三次 PUT；本仓不导入后端源码或访问数据库。

由 API 负责人提供新建专用库及夹具 JSON、测试 API 地址、合成账号密码。在本仓设置以下环境；不要将真实凭证写入文档或提交仓库：

```powershell
$env:EXPO_PUBLIC_API_BASE_URL='http://127.0.0.1:62930/api/v1'
$env:COMPOSER_FIXTURE_JSON='<API负责人提供的合成清单JSON>'
$env:COMPOSER_FIXTURE_PASSWORD='<临时合成用户密码>'
$env:COMPOSER_ADMIN_ACCOUNT='<专用管理员账号>'
$env:COMPOSER_ADMIN_PASSWORD='<专用管理员密码>'
pnpm test:composer-http
```

测试应使用空夹具串行运行；失败后重新创建专用库，不能直接重复注册同名账号。证据保留于本仓忽略的 `composer-*.log`，三平台导出使用 D 盘独立产物目录。真实设备、SecureStore、相册、生产 S3 签名校验及故障恢复尚待验；完整历史数据库/HTTP 套件本轮未重跑。

## 原阶段设计与证据

2026-10-29；消费 OpenAPI 1.28.0；D-37 增加本人图片 ID 与 nullable 雪场编辑契约，未增加依赖。

`/dynamics/create` 通过 `DynamicResortPicker` 搜索已发布雪场。选择器只使用公开 `GET /resorts`，按名称正序、每页 10 条偏移分页，支持关键词、重试、空状态与加载更多；默认收起且不请求。组件只保留 `{resortId,name}`，不传作者、商家、角色或状态。创建可不关联，编辑可改绑另一已发布雪场。编辑可清空选择，PATCH 显式传 null 解除；省略保留，正整数改绑。

新建照片支持最多 9 张 JPEG/PNG/WebP、每张 10 MiB；同 URI 去重；选择顺序展示编号，可前移/后移/删除。iOS picker 开启 orderedSelection；客户端按最终顺序逐张上传，发布 imageAssetIds 顺序与预览一致，服务端校验图片 ID 格式/去重、归属、ready、MIME 与雪场公开性。2026-10-30 用户确认统一 9 张上限，OpenAPI 1.38.0 的创建/编辑 DTO 和后端领域规则均限制，超限 400。预览显示当前正文、图片和关联雪场；编辑预览使用当前原图/新图组合。

初始化编辑正文/雪场只执行一次，后台重新读取不会覆写正在编辑的内容。页面按账号和动态 ID 重建，选图及提交共用同步锁，避免重复点击和并发操作。picker 返回、每张上传结束以及发布返回后均检查组件是否仍存活；切换账号/卸载后不发出后续上传、发布、清理，也不跳转新账号页面。在途请求可能已经由原账号提交，客户端不能撤销已经发生的服务端写入。

`composer-submission.ts` 编排上传、发布与补偿。上传失败或明确 4xx 拒绝（不含 408）时尝试清理已获 Asset ID 的未关联图片；清理失败不覆盖原始错误，后端仍拒绝删除已引用 Asset。发布网络错误、408、5xx 或无效成功响应视为结果不明，保留图片，禁用当前表单再次发布并引导本人列表核对。该机制不是后端创建幂等，离开后重新创建仍可能重复；动态 POST 尚无契约约定的幂等键。

切换账号、未知上传响应或清理失败可能留下孤立 Asset，自动过期清理尚未实现；后续应通过受控后端回收机制处理，客户端不跨账号清理。本人详情 images 返回可回传的 Asset ID 与 URL；imageUrls 为兼容字段。只上传新图并按最终顺序组装完整 imageAssetIds，空数组移除全部关联。明确失败只清理本次新上传图，原图 Asset 永不由该补偿流程删除。

验证：submission 单测覆盖顺序、仅文字、扫描状态、分段失败/清理失败、明确拒绝、0/408/5xx/无效成功响应、上传中换号和发布返回前换号；transport 测试验证公开雪场分页/编码、创建与编辑关联字段。执行 `pnpm check` 和 `pnpm exec expo export --platform all`；真实相册、选图/拖动或按钮交互、MinIO/ClamAV、数据库和设备/API 联调仍待验。

D-37 新增 mixed-image 单测：原图与新图顺序、仅上传新图、移除所有图片不删除原 Asset、明确失败只补偿新 Asset、结果不明保留所有关联候选。transport 校验 null 解绑、字段省略及图片顺序。本人不可用图片不返回可回传 ID，页面提示保存后仅保留当前显示图片。
