# AI 会话接入

契约基于仓库内 OpenAPI 1.44.0，类型来自 `src/platform/api/openapi.ts`。入口在个人中心，路由为 `/ai`、`/ai/[conversationId]`。仅登录且拥有 AI 使用权限的账号可用，后端强制验证权限和会话所有权。2026-10-31 补齐 [对话生命周期与确认消息](ai-conversation-lifecycle.md)：按消息 ID 核对、刷新失败保留回复、离页停止与取消等待中的 reader。

## 请求与状态

会话列表的新建/删除共享锁、身份复核、焦点取消、未知结果核对与末页恢复见 [会话列表工作流](ai-conversation-list.md)。创建 DTO 固定为空对象，文档表中旧的可选 title 已纠正。

- 列表采用 `page/pageSize/total`；创建发送空对象；删除采用软删除。写操作不自动重试。
- 发送为 `POST /ai/conversations/:id/messages`，DTO 为 `{clientRequestId: UUID, content}`。每次新问题生成一个 UUID，失败重试沿用原 DTO；编辑后重新提问生成新 UUID。
- 最多 4000 Unicode code point，每用户滚动 60 秒最多 5 条新消息；服务器执行最终校验。
- `delta` 的 `{text}` 仅展示临时片段；`completed` 是已落库的完整 `AiMessageVO`，包含引用。没有 completed 的断流、解析错误或 `error` 事件都不能报成功。重放可能直接返回 completed。
- 生成时同步锁定并拦截重复提交；停止、失焦或卸载中止请求。失败保留本页面实例的原问题与幂等键供手动重试，查询按账号隔离；完整卸载后不保存临时请求。

## 传输与引用

SDK 58 默认全局 fetch 支持流式响应；依据 [SDK 58 Expo API](https://docs.expo.dev/versions/v58.0.0/sdk/expo/) 使用 `ReadableStream` 与 `TextDecoder`。`apiStreamRequest` 复用普通请求的受限 URL、内存 access token、SecureStore refresh token 与 single-flight 401 刷新；仅在响应流开始前重试一次 401。已开始的生成流不自动重连。

解析器按行处理 CR/LF/CRLF 和跨包 UTF-8，限制单事件大小；已完成消息校验 role/status/content/citations，失败释放 reader。引用展示标题和片段；雪场、文章、动态引用根据已知类型和数字 ID 映射到公开 App 页面，不执行模型提供的任意 URL。项目与字典引用仅展示内容。

## 验证边界

`pnpm check` 覆盖契约锁、lint、类型、单测与 Expo Doctor；`pnpm exec expo export --platform all` 验证三平台编译。AI transport 测试覆盖中文/emoji 逐字节分包、换行边界、心跳、提前断流、错误/畸形 completed、直接重放、取消、401 刷新和引用路由。

尚未完成页面组件交互测试及真实设备、PostgreSQL、模型服务联调。服务端现读取本会话最近已完成轮次中的用户问题（最多 4 条、合计 2000 Unicode 字符），帮助检索和理解追问；每轮重新按权限检索，历史 AI 回答与引用不作为本轮证据。仅依赖上一条 AI 回答才能理解的追问仍需补充具体名称，页面提示写明雪场或主题。客户端无需上传历史，发送 DTO/SSE 保持原契约。配置中的对话模型实际可用性及指代效果须经供应商验证。

2026-10-29 使用 Expo 官方安装命令对齐 SDK 58 的 expo、constants、font、linking、router、splash-screen 补丁并同步锁文件及 font config plugin。安装源固定官方 npm；镜像超时导致的中断已恢复。`openapi-typescript@7.13.0` 仍声明 TypeScript 5 peer，而项目固定 TypeScript 6.0.3；类型生成与编译有回归验证，该工具声明差异尚待上游支持，未全局忽略 peer 检查。
