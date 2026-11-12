# AI 会话、焦点与流式回答边界

2026-11-03 AI会话列表跨页面核对续验：列表创建/删除的当前范围以[列表恢复说明](ai-list-recovery.md)为准。AI列表新增按QueryClient/账号隔离的未知结果与任务所有权内存账本；完整卸载和同账号重登录保留待核对标记，另一账号不继承。发出请求后即使卸载仍等原Promise结束才释放共享写入门禁，迟到结果不导航/改缓存；结束后新读取及显式人工核对才能继续。共享修订号和最新读取代次阻止旧核对、旧成功/失败覆盖新状态；预检取消不发送、旧finally不释放新任务。新增22项、AI专项213项通过，原一项测试改为要求未结束任务不能提前解锁。详情原UUID恢复见下一条记录；下方早期检查结果仅为历史范围。

2026-11-03 AI原请求跨页面恢复续验：当前原请求跨页面恢复以[账本说明](ai-runtime-recovery.md)为准。AI详情新增按QueryClient/账号/会话隔离的原UUID及问题DTO内存账本；完全卸载和同账号重登录仍可显式用原键恢复，另一账号不读取原问题。活动操作同步仲裁，停止接收保留原键；旧流/完成/finally不能清除新状态，主动编辑新键的既定规则保持。新增15项、AI专项191项通过。Expo Web认证已在后续阶段适配，下方1.50.0/685项与待确认说明属于2026-11-02历史范围。

2026-11-03 后端来源补充：[生成期间实际引用快照复核](../../../backend/docs/engineering/rag-live-evidence.md)在来源撤回/修改/人工停用后通过既有409或SSE error结束本轮，不继续输出旧证据。App保持未确认片段、原UUID显式重试和会话核对规则；无客户端协议变更，历史来源保留和真实设备验收仍待完成。

2026-11-02 后端补充：生成期间逐片段、保存前后和幂等回放会重新验证原会话及当前AI权限/有效RAG范围，拒绝后沿用现有脱敏error事件并关闭上游。App仍按既有规则将completed前片段视为未确认；无客户端DTO/VO或操作变化。详细边界见[后端AI授权说明](../../../backend/docs/engineering/ai-stream-authorization.md)，替身HTTP证据不等同于真机/API验收。

2026-11-02，APP-08/09 的既定 API-AI-01/02 客户端生命周期续验。OpenAPI 保持 1.50.0/143 操作，无新增业务协议、依赖或 migration。

## 本轮修复

原 AI 详情 query 在失焦后仍启用，只在流式控制器上做 dispose；缓存及 AiAccess 子树主要按 userId 区分，同一账号再次登录可能沿用旧本地状态。身份预读与后续请求各自获取当前会话，也不能证明一组操作属于同一登录。会话列表已有同步锁和未知结果人工核对，但缺少固定 epoch 的传输边界和列表读取后复核。

路由现为薄入口，功能代码分别放在 conversation-screen.tsx、conversation-list-screen.tsx。AiAccess 子树按账号ID/账号名/有效grants/epoch隔离；aiKeys 还把 epoch 放入列表与详情键，详情增加焦点代次。详情仅在焦点内读取，失焦 dispose 流并取消本账号/epoch/会话前缀的 Query；重新聚焦生成新查询，读取及权限复核完成前不显示旧历史、停止重试或新提问。归档会话保留历史、禁用输入和发送。

createAiSession 在组件创建时捕获 epoch；所有身份、历史、创建、删除和流式请求都传 expectedSessionEpoch。详情在读取前后验证当前账号与 AI grant；列表控制器先验证身份，session.list 在读取后再次验证。异步返回后检查取消信号和原 epoch，旧会话结果不能更新新会话缓存或导航。列表创建/删除仍复用原同步锁、未知结果刷新和人工核对。

SSE 每次 reader.read 返回和事件处理均检查原会话，完成事件之后再复核身份。中断/丢失 completed 保留原 clientRequestId，只在用户显式重试时发送同一 DTO；未修改服务端幂等规则。收到401/403/404后清除本地片段/确认回答并隐藏缓存，保留原请求但禁用重试/编辑，直到重新取得已授权历史。服务端已完成而客户端复核失败时，不把它当作未提交的新请求。

响应校验覆盖会话UUID、状态/时间/计数、分页与重复ID、详情目标一致性、完整消息及引用基本形状；消息/来源文本按文本渲染，引用仍只映射已知公开App路由。校验不是新的产品限制或来源授权替代，来源可见性仍由后端负责。

## 验收

- 新增50项：响应边界26、固定会话/传输8、控制器拒绝与恢复3、时间线隐藏1、页面接线12；AI专项8文件176项通过。
- App完整38文件685项、lint零警告/typecheck、Doctor20/20通过，iOS/Android/Web导出通过。页面测试替换Native组件和焦点/Query hooks，验证接线/输出，不宣称真机交互。
- `pnpm test:ai-http` 独立3项通过：真实平台API/auth、会话控制器、QueryClient → 编译后Nest/HTTP/SSE/PostgreSQL/pgvector；Native SecureStore以测试存储替换，模型和Embedding为本地HTTP替身，其余产品API不Mock。
- 完成响应真正已提交后被测试截断，原幂等键重试取回同一消息；跨账号404、旧epoch无请求、同账号重登录隔离、本人软删除通过。Backend另核对仅两轮持久消息、一次软删除、两次模型调用、公开来源提示词及引用，详见后端独立复现说明。
- 三仓本轮冻结安装通过；Backend1039项/check/build，Web1459项/check/双应用build通过（两构建缓存命中）。完整历史数据库/HTTP套件和管理浏览器本轮未重跑。

初次响应断言缩窄类型导致 typecheck 失败，改用 unknown 消息属性后修复；unbound-method警告通过显式箭头适配修复，最终零警告。没有关闭检查。原始本地日志 `ai-mobile-*.log` 忽略，导出产物放D盘以避免E盘容量不足。

## 独立 HTTP 复现

本仓测试不导入Backend源码，不直连数据库。先由Backend负责人独立创建一次性 `linji_ai_mobile_validation` 数据库、应用迁移并运行本地合成provider和编译后API；取得其夹具清单（仅数据库标记、公开雪场ID及预期回答，不含生产凭证）。在本仓设置：

```powershell
$env:EXPO_PUBLIC_API_BASE_URL='http://127.0.0.1:62910/api/v1'
$env:AI_MOBILE_FIXTURE_JSON='<Backend提供的合成夹具JSON>'
$env:AI_MOBILE_FIXTURE_PASSWORD='<8至72字节合成密码>'
pnpm test:ai-http
```

测试只接受回环API与专用库标记。它创建两个合成注册账号、会话和消息，不能对普通开发或生产库运行。结束后由Backend销毁自己的验收数据库。App本身不能通过HTTP证明Backend的连接目标，执行者必须核对Backend的专用库配置。

## 文档依据与剩余边界

本轮已读取 [SDK58 Router useFocusEffect](https://docs.expo.dev/versions/v58.0.0/sdk/router.md#usefocuseffecteffect-do_not_pass_a_second_prop)、[焦点处理](https://docs.expo.dev/router/reference/focus-handling.md)及 [SDK58 expo/fetch](https://docs.expo.dev/versions/v58.0.0/sdk/expo.md)。useFocusEffect 使用 useCallback 和失焦清理；SDK58在原生全局安装流式expo/fetch，现有global fetch无须额外换库。Node HTTP 验收不能证明该原生实现或设备SecureStore已验。

原生键盘/导航/存储、真实模型与Embedding、在途撤权与来源变化的端到端时序、Expo Web认证适配和生产恢复仍待完成。当前前端复核有时间窗口，不宣称即时撤权或端到端exactly-once。Expo Web方案仍待确认，不在本轮擅自实现。
