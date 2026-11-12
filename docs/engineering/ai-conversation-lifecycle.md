# AI 对话生命周期与确认消息

更新日期：2026-10-31。对应 APP-09、API-AI-01/02，继续使用本仓 OpenAPI 1.44.0。没有新增 HTTP 路由、DTO、数据库字段或业务权限。

## 请求与状态

`AiConversationRun` 管理单个账号、单个会话的临时状态。新提问 trim 后为 1–4000 Unicode code point，同步锁在身份读取和网络等待之前建立；同一时刻仅执行一次发送。每次新问题生成 UUID，停止、断流、失败后的手动重试沿用原请求；明确选择“编辑后重新提问”才生成新请求。不会自动重试模型调用。

读取历史及每次发送/重试前，通过已有 `/auth/me` 确认账号 ID 和 `ai:conversation:use`。服务器继续独立验证会话所有权、当前授权、限流、生成租约和幂等。客户端身份检查与发送之间不是原子操作，不解决后端 Guard 通过后发生的在途撤权。

AiAccess 要求 authenticated、有效账号和 AI 使用权限，并按账号重挂载子树；会话路由校验标准 UUID，拒绝数组、多余片段和宽松的伪 UUID。用户、会话、临时提问和流状态不会共用跨账号实例。

## 历史与本次确认回复

服务端历史只通过查询接口更新。页面不再给用户消息制造 `local:*` 编号，也不根据正文相同判断消息是否相同。连续两次相同问题使用不同请求 ID，分别保留。

`completed` 的已保存 assistant 消息与本次提问保留在组件状态，供历史刷新失败时继续展示。历史包含相同服务端 messageId 后，才删除对应临时确认记录；引用和时间仍使用 completed 原值。临时提问标记为“本轮提问”，不冒充拥有服务端编号、保存时间或状态的消息。该阶段不新增 clientRequestId 到历史 VO，因此无法可靠把未完成的本轮提问与历史中同文本用户消息一一对应；页面显式区分两者，避免用文本猜测关联。

网络刷新失败不会把已保存回复重新标记为发送失败。历史 401/403/404 时隐藏缓存历史、本地确认回答和未确认片段，保留加载恢复入口；后端授权与来源公开性仍是最终边界。历史回答、过期来源引用及敏感历史删除策略未在本阶段改写。

## 停止、离页与 SSE

Expo Router 会在导航栈保留未卸载页面。对话通过 `useFocusEffect` 管理活动生命周期，失焦、卸载或账号切换取消当前请求；返回页面显示已停止状态并保留本实例原请求供手动重试。旧 delta、completed、error 和 finally 只属于旧 controller，不能覆盖新的重试或触发旧账号的缓存刷新。

流传输在等待 reader.read 时也监听 AbortSignal，主动 cancel reader；取消后的数据不再解析或展示，finally 移除监听并释放 reader。UTF-8 使用 fatal 解码，畸形编码拒绝；按服务器现有上限限制累计输出为 100000 UTF-16 单元，校验非空完整回答、正整数消息编号、可解析时间与引用结构。分包、CR/LF/CRLF 和单事件大小仍由已有 SSE 解析器处理。

只有 completed 代表成功。停止或断流可能发生在服务器提交之后，使用原请求重试由服务器幂等重放确认；客户端取消不是服务端回滚承诺。完整卸载、重启、跨标签页和跨设备不会保存临时重试 DTO，未增加聊天内容持久化。

引用显示 `[S1]` 等与模型提示词一致的编号；只允许雪场、文章、动态的已知公开 App 路由和正 int4 业务 ID，忽略提供的 href，不执行任意 URL。项目/字典引用仅展示标题和片段。

## 验证与实践依据

`src/features/ai/conversation-run.test.ts` 验证同步门禁、Unicode 长度、身份失败、原 DTO 重试、停止/重试竞争、失焦重新激活、卸载迟到结果、相同问题和按 ID 核对。`conversation-timeline.test.tsx` 使用 React DOM 静态渲染及受控 Native/Router 替身，验证已保存回复在刷新失败时可见、401/403/404 隐藏旧内容、未确认/停止状态、引用和文本转义。它不是原生点击、导航或焦点集成测试。

`ai-api.test.ts` 验证逐字节中文/emoji、断流、重放、主动取消等待中的 reader、迟到片段、畸形编码、完整消息边界、输出总长和引用白名单。大输出预算测试使用 4096 字节块，逐字节编码测试另行保留。全量 check、Doctor 和三平台 export 的结果见阶段记录，不据此宣称真实 DeepSeek/Embedding 或设备验收完成。

新增 `@types/react-dom` 19.3.0 开发类型依赖，通过 Expo 官方 install 命令安装并纳入本仓锁文件，用于静态渲染测试；不新增运行时组件库。现有 openapi-typescript 的 TypeScript 5 peer 与项目 TypeScript 6 声明差异继续保留记录，没有忽略或覆盖该检查。

沿用 [skills.sh 实践记录](skills-practices.md)，2026-10-31 另核对官方文档：

- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/) 与 [Expo API](https://docs.expo.dev/versions/v58.0.0/sdk/expo/)：uuid、全局流式 fetch、TextDecoder 与 Streams 的当前支持。
- [URL parameters](https://docs.expo.dev/router/reference/url-parameters/)：local 参数与导航栈保留页面行为。
- [Handle screen focus](https://docs.expo.dev/router/reference/focus-handling/)：useFocusEffect 配合 useCallback，在失焦和卸载时清理。

日志前缀 `ai-workflow-`，最终导出目录 `dist-ai-workflow-validation-final/`。原开发进程、验证容器和既有数据保留；未提交、推送或部署。真实设备、浏览器/API 成功工作流、真实模型语义/引用准确性、RAG 运维与 AI 管理审计仍未完成。

最终验收记录：AI 专项 3 文件/70 项，完整 App 20 文件/247 项、lint 零警告、Doctor 20/20 和三平台 export 通过；Backend 873 单测、88 HTTP、690 真实数据库测试及 build/OpenAPI，Web 684 项与官网/Admin build 通过。三仓独立冻结安装、OpenAPI 1.44.0 一致性、数据库前后结构验证通过。原测试数据清理已核验，既有管理员、Outbox、容器和开发进程保留。
