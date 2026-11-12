# README历史进度（截至2026-11-02）

本文归档原README首页记录。版本、测试数量和未完成项均属于各自阶段，当前启动方式与状态以[本仓README](../../../README.md)为准；旧记录不作为当前全部验收结论。

2026-11-02 资料编辑：补齐焦点取消、同步门禁、账号/权限/epoch复核、ready资产复用和未知结果“刷新后人工核对”。[工程说明及独立复现](../profile-lifecycle.md)。冻结安装、完整check33文件603项、lint零警告/typecheck/Doctor20/20和三平台导出通过；另两项真实HTTP/Nest/PostgreSQL联调及后台2+1次成功审计断言通过。契约1.50.0保持；设备相册/原生存储和Expo Web认证仍待验，项目整体未完成，下文为历史证据。

2026-11-02 设置：改密成功立即停用旧身份并清理凭证进入登录；网络结果不明禁止重放，焦点/账号/epoch隔离和密码清空已补。见[工程说明](../settings-lifecycle.md)。新增37项，完整32文件556项/lint零警告/typecheck/Doctor20/20、三平台导出通过；另有两项真实Nest/PostgreSQL HTTP联调和后端持久审计验证通过，仅Native存储被替换。新增独立pnpm test:settings-http，不纳入离线check。OpenAPI1.50.0不变，无新依赖。Expo Web登录当前不可用，平台Cookie适配待确认；原生设备和整体交付仍未完成，下方为历史证据。

2026-11-02 文章详情：迁移共享收藏生命周期，焦点取消/身份前后核对、未知结果恢复和无图封面已补齐；个人收藏使用绝对路由。见[工程说明](../article-lifecycle.md)。独立冻结安装、完整30文件519项、lint/typecheck/Doctor20/20与iOS/Android/Web导出通过。OpenAPI同步1.50.0/143操作；管理员重置仅Web提供，不新增移动端管理页。Settings仅审计未改写，真机/API/供应商仍待验，下文为历史记录。

2026-11-02 收藏列表与雪场详情：增加焦点取消、同步操作锁、账号/权限复核、明确状态写入与异常后只读核对，移除雪场乐观反转。新增82项测试；独立冻结安装、lint/typecheck、29文件500项和Doctor20/20通过，三平台导出至dist/favorites-flow-validation/。见[收藏生命周期与限制](../favorites-lifecycle.md)。契约保持1.49.0，文章详情本轮未改写；设备/API成功流程仍待验，下文带日期结果为历史证据。

本阶段最终验证：独立冻结安装、lint零警告/typecheck、27文件418项测试与Expo Doctor20/20通过，iOS/Android/Web导出至dist/own-dynamics-validation/。新增75项本人动态测试，最后焦点代次改动已复跑完整检查。三仓OpenAPI1.49.0哈希不变，未新增依赖、HTTP或真实数据库/设备验收。

2026-11-02 本人动态流程完善：列表/详情增加焦点取消、身份/权限核对、正int4路由、同步删除锁、未知结果刷新与显式核对；只读账号隐藏维护入口，错误时隐藏旧私有内容。新增75项测试通过，复现与验收范围见[本人动态工程记录](../own-dynamics-lifecycle.md)。OpenAPI仍1.49.0，无新增依赖/API；真实设备焦点/手势与API成功流程仍待验收，下文为历史阶段。

2026-11-02 后端数据库续验配套：本仓业务/API/依赖未变，OpenAPI保持1.49.0。后端新建隔离库23项迁移、AI会话审计11项及RAG控制14项真实数据库专项通过；不新增移动端管理页。本仓沿用较早343项/Doctor20/20与三平台导出证据，真实设备/SecureStore及API工作流仍待验收，下文为历史阶段记录。

2026-11-02 审计契约配套验证：本仓无业务代码/依赖/API变更；独立冻结安装、完整`pnpm check`（24文件/343项、lint/typecheck、Doctor20/20）及iOS/Android/Web导出通过。产物保留在本仓已忽略的`dist/audit-contract-validation/`。OpenAPI保持1.49.0；不新增移动端管理功能。真实设备/SecureStore、API成功操作及模型/存储联调仍待验收，项目整体未完成，下方日期记录为历史证据。

2026-11-01 D-44至D-47契约同步与最终验证：OpenAPI升级到1.49.0，公开雪场标签、管理员全局雪场字段和RAG/AI审计契约类型已同步；不增加移动端管理页。App完整`pnpm check`通过，24个测试文件343项、Expo Doctor 20/20通过。真实数据库/浏览器/设备/provider验收仍待完成；未提交/推送/部署，下文为历史阶段。

2026-11-01 消息任务页面配套验证：App业务代码、依赖与OpenAPI1.46.0不变，不增加移动端管理页面。本仓独立冻结安装、完整check342项、lint/typecheck、Doctor20/20及iOS/Android/Web导出全部通过，保留dist-event-pages-validation和event-pages-日志。Backend942单测/97 HTTP/747数据库及构建、Web1308项/官网与Admin构建配套通过；三仓契约哈希一致。原生设备、真实API/provider与项目整体验收仍待完成，未提交/推送/部署，下文为历史阶段。

2026-11-01 商家雪场页面配套验证：本仓业务代码/依赖及OpenAPI1.46.0保持；独立冻结安装、24文件342项、lint零警告、类型检查、Doctor20/20及iOS/Android/Web导出通过。dist-merchant-pages-validation和日志merchant-pages-保留，不引入跨仓依赖。Backend942单测/97 HTTP/746数据库与构建配套通过；真实设备/API/供应商及整体交付仍缺，未提交/推送/部署，下文为历史阶段。

2026-11-01 资产管理最终配套验证：本仓代码/依赖保持；独立冻结安装、24文件342项、lint零警告、类型检查、Doctor20/20和iOS/Android/Web导出通过。Backend942单测/97 HTTP/746真实数据库与构建、Web1079项/双应用构建配套通过；OpenAPI1.46.0三仓哈希一致。日志asset-pages-、dist-asset-pages-validation保留；未提交/推送/部署，设备/API/供应商与项目整体验收仍缺，下文为历史阶段。

2026-11-01 社区审核页面最终配套验证：本仓冻结安装、完整check24文件342项、lint零警告、Doctor20/20及三平台导出通过；Backend906单测/97 HTTP/736真实数据库与构建、Web1001项/双应用构建配套通过。三仓OpenAPI1.46.0哈希不变，dist-moderation-pages-validation与日志保留。原数据与进程保留，未提交/推送/部署，真实设备/API/供应商及项目整体验收仍缺，下文为历史阶段。

2026-11-01 社区审核页面配套验证：本仓代码、依赖和OpenAPI1.46.0保持；独立冻结安装、24文件342项、lint零警告、Doctor20/20及iOS/Android/Web导出通过。日志moderation-pages-和dist-moderation-pages-validation保留。管理端变化不引入跨仓依赖；真实设备/API/供应商与整体验收仍缺，下文为历史阶段。

2026-11-01 项目知识契约最终验证：本仓冻结安装、完整check24文件342项、lint零警告、Doctor20/20及iOS/Android/Web导出通过。Backend906单测/97 HTTP/736真实数据库及构建、Web909项/双应用构建配套通过；三仓OpenAPI1.46.0哈希一致。dist-knowledge-pages-validation和日志保留，原数据/进程保留，未提交/推送/部署；真实设备/API/供应商与整体验收仍缺，下文为历史阶段。

2026-11-01 项目知识契约配套：独立复制OpenAPI1.46.0及锁文件并重新生成本仓类型；sourceUrl由误标object修正为string|null。三仓快照SHA-256为`e18e8cd888793a76fac80c6be22161f930485694a7eac95c42f8865439d52de6`。本仓无业务、依赖或Expo API变更；冻结安装、24文件342项、lint零警告、Doctor20/20及三平台导出通过，产物dist-knowledge-pages-validation保留。设备/API/供应商与整体验收仍缺，下文为历史阶段。

2026-11-01 文章页面最终配套验证：本仓冻结安装、完整check24文件342项、lint零警告、Doctor20/20和iOS/Android/Web导出通过。Backend906单测/96 HTTP/736真实数据库与构建、Web812项/双应用构建配套通过。三仓OpenAPI1.45.0哈希不变，dist-article-pages-validation及日志保留；原数据与进程保留，未提交/推送/部署，项目整体未完成。下文为历史进度。

2026-11-01 文章页面配套验证：本仓业务代码、依赖和OpenAPI1.45.0保持。独立冻结安装已通过，完整check及三平台导出正在运行；管理端文章流程变更不增加App接口或跨仓代码依赖。设备/API成功工作流及项目整体验收仍缺。

2026-11-01 文章边界阶段最终验证：冻结安装、完整check24文件342项、lint零警告、Doctor20/20及iOS/Android/Web导出通过。Backend906单测/96 HTTP/736真实数据库与构建、Web699项/双应用构建配套通过；三仓OpenAPI1.45.0哈希不变。导出dist-article-boundaries-validation保留，原数据与进程保留，未提交/推送/部署，项目整体未完成。

2026-11-01 文章边界配套验证：本仓无业务代码、生成类型或依赖变更；独立冻结安装、App完整check24文件342项、Doctor20/20和iOS/Android/Web导出通过。后端修正整体 customFields 容器、受保护管理员身份与正 int4 边界，沿用既有文章协议。本仓OpenAPI1.45.0快照不变；浏览器/设备/API成功工作流与项目整体验收仍未完成，下文为历史阶段记录。

2026-10-31 工作台阶段最终验证：三仓独立冻结安装通过；Backend lint/typecheck、120文件881单测、3文件88 HTTP、31文件728真实数据库、build/OpenAPI与前后db:verify（20迁移）通过；Web完整check699项及官网/Admin build通过；App完整check24文件342项、lint零警告、Doctor20/20与iOS/Android/Web export通过。OpenAPI1.45.0三仓SHA-256一致（7143202ba63822b11c3275ef7c2c466390222cb1fea9716d784cb9d68f60540e）。123份Markdown、691个本地链接有效。原管理员、四项active账号权限、pending Outbox、验证容器及开发进程保留，测试夹具无残留。失败及复验日志dashboard-保留，未提交/推送/部署。仍缺RAG来源运维三接口、AI审计、待确认协议与真实浏览器/设备/供应商验收，项目整体未完成。

2026-10-31 全局工作台阶段：用户已确认API-M01/ADM-01汇总协议，后端与管理端已实现；七面板按授权及既有数据范围读取，商家隔离、精确累计收益与同快照统计。OpenAPI 1.45.0三仓同步。见[本仓契约同步说明](../dashboard-contract-sync.md)。后端881单测、88 HTTP、728真实数据库及构建通过；三仓完整结果见上方最终记录。RAG运维/AI审计、待确认协议及浏览器/设备/真实供应商等仍缺，项目整体未完成。

认证隔离阶段最终验证：独立冻结安装、OpenAPI校验、lint零警告、类型检查、24文件342项测试（认证HTTP专项8文件73项）、Doctor20/20及iOS/Android/Web export通过；最终导出dist-session-isolation-validation-final/，所有session-isolation-失败及复验日志保留。Backend873单测/88 HTTP/690真实数据库与构建、Web684项/双端构建配套通过，三仓契约一致。原数据、容器与开发进程保留，未提交/推送/部署；原生设备/API与全项目验收仍缺。

2026-10-31 认证隔离阶段：完善会话版本、SecureStore 串行读写、共享 refresh、重复退出与迟到响应隔离、用户状态归属和缓存清理；登录/注册及个人页退出使用同步锁。见 [认证并发与账号隔离](../session-isolation.md)。认证/HTTP专项8文件73项、完整24文件342项、lint零警告、Doctor20/20与三平台导出通过。无新依赖、迁移或协议；原生存储与真实API设备验收仍缺。

本阶段最终验证：独立冻结安装、OpenAPI 校验、lint 零警告、类型检查、22 文件/303 项测试与 Doctor 20/20 通过；iOS/Android/Web 最终导出 dist-ai-list-validation-verified/，ai-list- 失败和最终日志均保留。Backend 873 单测/88 HTTP/690 真实数据库测试及构建、Web 684 项及双端构建配套通过；三仓契约哈希一致。设备与真实供应商/API 成功流程仍待验收，未提交/推送/部署。

2026-10-31 AI 会话列表阶段：APP-08 完善新建/删除共享同步锁、身份复核、焦点清理、迟到结果隔离、未知结果核对与末页恢复；确认创建后的跳转独立于列表刷新。见 [会话列表工作流](../ai-conversation-list.md)。AI 专项 5 文件/126 项、完整 App 22 文件/303 项；真实设备与实际 API 导航交互仍待验收。OpenAPI 1.44.0、依赖与数据库不变。

2026-10-31 AI 对话阶段最终验证：三仓独立冻结安装通过；Backend lint/typecheck、119 文件/873 单测、3 文件/88 HTTP、30 文件/690 真实数据库测试、build/OpenAPI 与前后 db:verify（20 迁移）通过；Web 完整 check 684 项及官网/Admin build；App 完整 check 20 文件/247 项（AI 专项 3 文件/70 项）、lint 零警告、Doctor 20/20 与三平台 export 通过。三仓 OpenAPI 1.44.0 哈希一致，118 份 Markdown 的 660 个本地链接有效。测试后仅原管理员，动态/评论/操作日志为 0，四项账号管理权限均 active；原 pending Outbox、验证容器和开发进程保留。日志与最终导出保留，未提交、推送或部署。真实设备/浏览器/API 成功工作流、真实模型/Embedding、全局工作台、RAG 运维/AI 审计及整体验收仍未完成。

2026-10-31 AI 对话阶段：APP-09 完善同步发送门禁、身份复核、失焦停止、原请求重试、迟到结果隔离及按消息 ID 核对。已确认回复在网络刷新失败时保留，服务端历史不写入虚构用户消息；权限/所有权失败隐藏旧内容，引用编号与 [S1] 一致。见 [AI 对话生命周期](../ai-conversation-lifecycle.md)。OpenAPI 仍为 1.44.0，无业务接口或数据库变更；新增 @types/react-dom 19.3.0 开发类型用于静态渲染测试。

当前本仓 AI 专项 3 文件/70 项、完整 check 20 文件/247 项、lint 零警告、Doctor 20/20 通过。Native/Router 替身静态渲染不代表真实设备交互；实际模型与 Embedding、浏览器/API 成功流程及项目整体验收仍待完成。三平台导出与其他仓库复验见本阶段最终记录，下文按历史阶段阅读。

本阶段最终验证：Backend 119 文件/873 单测、3 文件/88 HTTP、30 文件/690 真实数据库测试、build/OpenAPI 及前后 db:verify（20 迁移）通过；Web 完整 check 684 项（账号专项 5 文件/113 项）、官网/Admin build；App check 183 项、Doctor 20/20 与三平台 export 通过。三仓独立冻结安装通过，OpenAPI 1.44.0 哈希一致。117 份 Markdown 的 648 个本地链接有效。测试后仅原管理员、动态/评论/操作日志为 0，四项账号管理权限均恢复 active，原 pending Outbox、验证库与开发进程保留。日志与导出产物保留，未提交、推送或部署。浏览器/API 成功流程及整体验收仍未完成。

2026-10-31 账号页面配套复验：Web ADM-05/06 补齐目录分页、最新账号读取、初始密码和未知写入核对；本仓业务代码与 OpenAPI 1.44.0 保持不变，系统配置继续读取已确认的公开投影。项目整体未完成。

本阶段独立冻结安装、check 183 项、Doctor 20/20 与 iOS/Android/Web export 均通过，导出保留在 dist-user-console-validation/，日志前缀 user-console-。三仓契约哈希一致，无新依赖或迁移；原开发进程与验证库保留，未提交、推送或部署。浏览器/API 成功工作流、真实设备和真实供应商仍待验收；下文按历史阶段阅读。

2026-10-31 账号事务授权阶段：账号创建、角色全量替换与启停在 Serializable 事务内复核有效主体、管理入口、动作和最新 user 范围；授予 system_admin 核实受保护身份，最后管理员锁与原子审计保留。修复目标 ID 被 self/selected 范围覆盖的问题，详情及写入统一以 AND 交集匹配。正 int4 编号与分页边界校验已补。OpenAPI 仍为 1.44.0，无新依赖或迁移，项目整体未完成。 本仓业务页面和接口类型不变。

本阶段最终验证：三仓独立冻结安装通过；Backend lint/typecheck、119 文件/873 单测、3 文件/88 HTTP、30 文件/690 真实数据库测试、build/OpenAPI 导出及前后 db:verify（20 迁移）通过。新账号数据库专项 51 项与认证会话 12 项合计 63 项通过；Web 完整 check 579 项及官网/Admin build；App check 183 项、Doctor 20/20 与三平台 export 通过。三仓 OpenAPI 哈希一致。初轮完整数据库 682/688 通过、6 项失败已修正，失败及最终日志保留。测试后仅原管理员、动态/评论/日志为 0，权限已恢复，原 Outbox、验证库和开发进程保留；未提交、推送或部署。账号 UI、全局工作台、RAG 运维/AI 审计、浏览器/设备/真实供应商仍有缺口；下文按历史阶段阅读。

2026-10-31 角色页面配套复验：本仓业务页面、依赖和 OpenAPI 1.44.0 不变；系统配置继续按已确认协议读取公开投影。项目整体未完成。

本阶段最终验证：三仓独立冻结安装通过；Backend lint/typecheck、118 文件/855 单测、3 文件/88 HTTP、29 文件/639 真实数据库测试、build/OpenAPI 导出与前后 db:verify（20 迁移）通过。Web 完整 check 579 项（角色专项 6 文件/106 项）及官网/Admin build 通过，构建包含角色详情路由；App check 183 项、Doctor 20/20 与三平台 export 通过。三仓契约哈希一致。测试后仅原管理员，动态/评论/操作日志为 0，原待处理 Outbox、开发进程和验证库保留；日志与导出产物保留，未提交/推送/部署。首轮参数化测试夹具、null 类型及 React Key 类型适配问题已修正，失败日志保留。浏览器/设备/真实供应商、全局工作台与 AI 运维/审计等仍待完成，下文按历史阶段阅读。

2026-10-31 角色事务授权阶段：角色创建、修改、停用及授权快照替换在 Serializable 事务内重读有效身份、管理入口、动作权限和 role 范围；创建要求 all，修改/停用要求 all 或 selected 含目标。管理员专属范围配置和快照替换另核实受保护身份。撤权拒绝不写角色、授权集合或成功审计；授权依据为写事务快照，不保证取消快照建立后的全部撤权。OpenAPI 保持 1.44.0，无新依赖或迁移，项目整体未完成。 本仓页面与协议不变。

本阶段验证：三仓独立冻结安装通过；Backend lint/typecheck、118 文件/855 单测、3 文件/88 HTTP 与 build/OpenAPI 导出通过，三组角色真实数据库专项 3 文件/65 项通过。Web 完整 check 488 项及官网/Admin build；App check 183 项、Doctor 20/20 和三平台 export 通过。最终完整数据库 29 文件/639 项通过，测试前后 db:verify 通过（20 迁移）；三仓 OpenAPI 1.44.0 哈希一致。114 份 Markdown 的 614 个本地链接有效。首轮旧错误断言和无授权夹具三项失败，以及夹具角色键超长初始化失败均已修正，保留失败与复验日志。原开发进程及验证库保留；未提交/推送/部署。浏览器、设备、真实供应商、全局工作台和 AI 运维/审计仍有缺口，下文为历史阶段记录。

2026-10-31 权限目录页面配套复验：本仓业务、依赖和 OpenAPI 1.44.0 保持不变；系统配置继续按已确认协议读取公开品牌与政策投影。项目整体未完成。

本阶段最终验证：三仓独立冻结安装通过；本仓 check 183 项、Doctor 20/20 与 iOS/Android/Web export 通过，保留 permission-console-*.log 和 dist-permission-console-validation/。Backend lint/typecheck、118 文件/853 单测、3 文件/88 HTTP、28 文件/598 真实数据库测试及 build、前后 db:verify 通过（20 迁移）；Web check 488 项及官网/Admin build 通过。三仓 OpenAPI 哈希一致，无新增依赖或迁移；原开发进程和验证库保留，未提交、推送或部署。真实设备、浏览器/API 成功交互及供应商验收仍缺，下文为历史阶段记录。

2026-10-31 字典与权限目录事务授权阶段：字典六类写命令、权限目录三类写命令与注册表同步均在 Serializable 事务内复核有效身份、管理入口和动作授权；同步另需受保护 system_admin 身份。自定义角色保持按授权管理，拒绝不留下配置、审计或字典 Outbox。OpenAPI 仍为 1.44.0，无新依赖或迁移；项目整体未完成。

本阶段验证：三仓独立冻结安装通过；Backend lint/typecheck、118 文件/853 单测、3 文件/88 HTTP、28 文件/598 真实数据库测试及 build 通过，测试前后 db:verify 通过（20 迁移）。新增事务授权 32 项，与原字典/权限目录套件合计 104 项通过；初轮一次夹具事务超时已记录，复验与全量通过。Web 完整 check 422 项及官网/Admin build；App check 183 项、Doctor 20/20 与三平台 export 通过。客户端业务和契约不变，测试夹具无残留，原管理员、待处理 Outbox 和开发进程保留；未提交、推送或部署。浏览器/设备、真实供应商与整体验收仍待完成。

2026-10-31 字段写入授权阶段：七类字段/分组命令在 Serializable 事务内重读有效身份、管理入口与动作授权；显式启用公开字段需核实受保护管理员身份。自定义角色仍按授权工作，事务快照建立前已提交的撤权会拒绝写入。OpenAPI 保持 1.44.0，无新依赖或迁移，项目整体未完成。

本阶段验证：三仓独立冻结安装通过；Backend lint/typecheck、118 文件/852 单测、3 文件/88 HTTP、27 文件/566 真实数据库测试及 build 通过，测试前后 db:verify 通过（20 迁移）；Web 完整 check 422 项及官网/Admin build；App check 183 项、Doctor 20/20 和 iOS/Android/Web export 通过。字段配置与事务授权专项合计 50 项。客户端业务与契约未变化；真实浏览器、设备、供应商及整体验收仍待完成。

2026-10-31 字段实体路由阶段：补齐/admin/system/fields/[entityType]，四类实体URL校验、列表/返回/切换导航和直达权限已接，复用字段/分组表单与写门禁。字段专项73项及三仓完整回归通过。OpenAPI保持1.44.0，无新依赖或迁移；项目整体未完成。下文按历史阶段阅读。 [OpenAPI](../../../contracts/openapi.json)

字段实体路由阶段最终验证：三仓独立冻结安装通过；Backend lint/typecheck、118文件/851单测、3文件/88 HTTP、26文件/542真实数据库测试与build通过，前后db:verify通过（20迁移）。Web完整check422项及官网/Admin构建通过，构建产物包含/admin/system/fields/[entityType]；App check183项、Doctor20/20和三平台导出通过。103份Markdown、552个本地链接有效。OpenAPI1.44.0快照及生成类型不变；原开发服务、验证库、管理员与待处理Outbox保留，未提交/推送/部署。真实浏览器、设备、供应商与项目整体验收仍缺。

2026-10-31 字段配置页阶段：分离字段/分组/详情请求与失败状态，账号/实体切换隔离旧回调；编辑前读取最新详情，提交前同步锁与身份核对，支持显式null清除和结果不明后的刷新核对。修正字段DTO的Swagger类型，三仓同步OpenAPI1.44.0，无新依赖或迁移。字段专项49项与三仓完整回归已通过；项目整体未完成，下文按历史阶段阅读。 [OpenAPI](../../../contracts/openapi.json)

字段配置页阶段最终验证：三仓独立冻结安装通过；Backend lint/typecheck、118文件/851单测、3文件/88 HTTP、26文件/542真实数据库测试及build通过，前后db:verify通过（20迁移，字段配置专项26项）。Web完整check398项（字段专项49项、字典专项68项）与官网/Admin构建通过；App check183项、Doctor20/20和三平台导出通过。三仓OpenAPI1.44.0 SHA-256均为 `98baf03cc01588729adc9581fce4980a7eca8855b91e03fc37a9aa8a51d99cc2`。无新依赖或迁移；原开发服务、验证库、管理员及待处理Outbox保留，测试夹具无残留，未提交/推送/部署。浏览器/设备/真实供应商和全项目验收仍未完成。

2026-10-31 字段组详情阶段：补齐既有契约 GET /admin/custom-field-groups/:entityType/:groupKey；沿用管理入口与 system:field-group:list，复合键查询、停用可读、非法参数400、缺失404，读取不写审计或Outbox。OpenAPI1.43.0，三仓同步快照与生成类型，无新依赖或迁移。本阶段验证已通过；下文旧版本与测试数按历史阶段阅读。 [OpenAPI](../../../contracts/openapi.json)

本阶段最终验证：三仓独立冻结安装通过；Backend lint/typecheck、118文件/851单测、3文件/88 HTTP、26文件/539真实数据库测试、build/OpenAPI及前后db:verify通过（20迁移）；字段配置专项现为23项。Web完整check349项及官网/Admin构建通过；App check183项、Doctor20/20和iOS/Android/Web导出通过。三仓OpenAPI1.43.0哈希一致，无新依赖或迁移。测试夹具已清理，原管理员、既有待处理Outbox和开发服务保留，未提交、推送或部署。

2026-10-31 字典独立详情路由阶段：ADM-10 的 /admin/system/dictionaries/[dictType] 已实现，列表链接与返回入口接通；共用表单与写门禁，支持类型资料与多层级项维护。类型键校验、单次解码、直达权限与URL切换实例隔离已接，字典专项68项通过。Backend/App业务和OpenAPI1.42.0不变，无新依赖或迁移。真实浏览器/设备/供应商、全局工作台、AI运维/审计及待定版协议仍有缺口，项目整体未完成。下文旧阶段按历史阅读。

独立字典详情阶段最终验证：三仓独立冻结安装通过；Backend lint/typecheck、118文件/843单测、3文件/88 HTTP、26文件/527真实数据库测试、build及前后db:verify通过（20迁移）；Web完整check349项、窄屏换行调整后68项字典专项与官网/Admin构建通过，构建明确包含独立动态路由；App check183项、Doctor20/20和三平台导出通过。99份Markdown、529个本地链接有效，三仓OpenAPI1.42.0哈希仍为 `9be7657a9dd581d3f0aa2649b4a2d32e156acf2379d63842619ebf52679788c2`。原开发进程和验证库、日志与导出产物保留，未提交/推送/部署。以上不证明登录后浏览器点击、窄屏实测、真实设备或供应商验收；字段组单条GET、全局工作台和AI运维/审计等仍待完成。

2026-10-31 管理端字典稳定性阶段：修复选中字典后的持续请求、迟到响应覆盖、树表重复节点和清空父级未提交 null；父级候选排除整棵子树，账号/权限快照隔离、校验前写锁、提交前身份核对及不确定结果刷新核对已接。新增42项模型/竞争/SSR测试已通过，补齐原契约遗漏的字典项GET详情及int4边界；OpenAPI更新到1.42.0，无新依赖或迁移。本仓同步快照与生成类型，移动端业务行为未变。系统配置保持已确认方案。公开标签目录、全局雪场字段/资产授权及RAG运维仍待定版；全局工作台、AI会话审计、真实浏览器/设备/供应商验收仍缺，项目整体未完成。下文旧阶段记录按历史阅读。

字典阶段最终验证：三仓独立冻结安装通过；Backend lint/typecheck、118文件/843单测、3文件/88 HTTP、26文件/527真实数据库测试及build/OpenAPI导出通过，前后db:verify通过（20迁移）；Web完整check322项（含新增字典42项）及官网/Admin构建通过；App check183项、Doctor20/20和三平台导出通过。三仓OpenAPI1.42.0 SHA-256均为 `9be7657a9dd581d3f0aa2649b4a2d32e156acf2379d63842619ebf52679788c2`。初轮README/锁文件格式、Swagger参数声明及旧版本断言失败均已修正复验；日志与导出产物保留。原开发进程、既有管理员与待处理Outbox保留，无动态/评论/操作日志测试残留。未提交、推送或部署，登录后浏览器、设备和真实供应商验收仍未完成。

2026-10-31 社区阅读与操作核对阶段：官网信息流搜索/游标重试保留条件、后续空页返回、动态/雪场详情int4边界及独立评论分页恢复已补齐；App会话恢复门禁、个人读取核对、账号缓存隔离、同步写锁、删除确认和不确定结果显式核对已接，迟到回调不再更新其他账号点赞缓存。后端正文查询修复LIKE特殊字符的模式解释，真实社区专项51项通过。详见 [社区工程说明](../community-recovery.md)。OpenAPI仍1.41.0，无新依赖/迁移；评论未新增服务端幂等键，不宣称跨设备去重。公开标签目录、全局雪场字段/资产授权及RAG运维方案仍待确认；全局工作台、AI会话审计、设备/成功数据浏览器及真实供应商验收仍缺，项目整体未完成。下文按历史阶段阅读。

本阶段验证：三仓独立冻结安装通过；Backend lint/typecheck、118文件/833单测、3文件/87 HTTP、26文件/517真实数据库测试及build通过，前后db:verify通过（20迁移）；Web完整check 280项（新增22项社区页面/loader）及官网/Admin构建通过；App check 183项（新增35项社区逻辑/transport）、Doctor20/20及三平台导出通过。三仓OpenAPI1.41.0 SHA-256均为 `6708699df73b08b2dc97653abb886f5af2c3acc8b746430cd95ecc8357d13c6a`。特殊字符初始3项失败、测试hook误返回mock及列表header类型错误均已修正并复验。原3010浏览器验证非法游标恢复保留搜索；因原进程无API地址，成功数据态未验。未提交/推送/部署，保留原开发进程及验证库。

2026-10-31 公开知识目录阶段：官网文章/分类独立降级、非法筛选前置校验、分页/重试保留条件与后续空页返回已实现；App 分类清除、总数、保留列表的加载更多/刷新重试，以及账号/条件缓存和取消读取检查已补齐。后端修复 PostgreSQL 对关键词 %、_、反斜杠的模式解释，按字面内容匹配；真实 HTTP/PostgreSQL 知识专项从16项扩至31项。详见 [知识目录工程说明](../public-knowledge-directory.md)。OpenAPI 仍1.41.0，无新依赖/迁移。公开标签目录、全局雪场字段/资产授权及RAG运维方案仍待确认；全局工作台、AI会话审计、成功数据浏览器/原生设备及真实供应商验收仍缺，项目整体未完成。下文旧阶段按历史记录阅读。

本阶段验证：三仓独立冻结安装通过；Backend lint/typecheck、118文件/833单测、3文件/87 HTTP、26文件/514真实数据库测试及build通过，前后db:verify通过（20迁移）；Web完整check 258项及官网/Admin构建通过，提示区域对齐调整后专项15项和双应用构建再验通过；App check 148项、Doctor 20/20及三平台导出通过。三仓OpenAPI 1.41.0 SHA-256均为 `6708699df73b08b2dc97653abb886f5af2c3acc8b746430cd95ecc8357d13c6a`。初轮真实特殊字符测试3项失败及测试夹具类型检查失败已修正并复验；记录保留。未提交/推送/部署，原开发进程及验证库保留。

2026-10-31 公开雪场筛选阶段：官网与 App 接入地区/价格/评分/营业状态/成对坐标和完整排序，补齐分页、零距离及失败恢复；App 使用生成响应类型并隔离账号/条件缓存。后端修正分页 OpenAPI 类型和公开详情正 int4 边界，专项真实 HTTP/PostgreSQL 23 项通过。浏览器发现并修复缺少 API 地址时的整页崩溃，原 3010 进程已核对表单/校验/重试与窄屏；该进程无 API 地址，成功数据态仍待联调。OpenAPI 1.41.0，三仓同快照，无新依赖/migration；详见 [雪场筛选工程说明](../resort-directory.md)。公开标签目录待定版，完整标签多选 UI 尚未交付；全局工作台、AI 运维/审计、真实供应商/设备等仍缺，项目整体未完成。下文旧数字为历史阶段。

公开雪场筛选阶段最终验证：三仓独立冻结安装通过；Backend lint/typecheck、118 文件/833 单测、3 文件/87 HTTP、26 文件/499 真实数据库测试与 build 通过，测试前后 db:verify 均通过（20 迁移）。Web 完整 check 243 项及官网/Admin build 通过；App 完整 check 127 项、Doctor 20/20 与 iOS/Android/Web export 通过（包括筛选重置缓存后的复验）。三仓 OpenAPI 1.41.0 的 SHA-256 均为 `6708699df73b08b2dc97653abb886f5af2c3acc8b746430cd95ecc8357d13c6a`。没有新依赖或迁移；保留原开发进程及验证库，未提交、推送或部署。成功数据态浏览器、原生设备及真实存储/模型联调仍未完成。

2026-10-31 商家工作台阶段：ADM-02 页面已接入现有雪场/收益查询、筛选与状态展示；权限按入口和各数据 API 分别检查，商家身份仍由后端解析。OpenAPI 1.40.0 补齐既有 MerchantResortVO/PageVO，三仓同步生成类型，无新增依赖或迁移。已有非管理员角色不会因重复 seed 自动获得新 grants，须由系统管理员显式授权。系统配置确认方案已实现并进入本阶段回归；工程细节及验收边界见 [商家工作台](../../../../web/docs/engineering/merchant-dashboard.md)。全局工作台 API-M01、AI 运维/会话审计、浏览器/设备与真实供应商等仍未完成，项目整体未完成。下文旧版本/数字为历史阶段记录。

本阶段最终验证：三仓各自冻结安装通过；Backend lint/typecheck、118 文件/827 单测、3 文件/86 HTTP、26 文件/481 真实数据库测试和 build 通过，测试前后 db:verify 均通过（20 迁移）；Web 完整 check 213 项（含新增工作台25项和路由1项）及官网/Admin build 通过；App check 99 项、Doctor 20/20 和三平台 export 通过。三仓 OpenAPI 1.40.0 的 SHA-256 均为 `2f7a4a6da000f866644bae7406c48b9e59c7af43201eb8894320488666c8be50`。系统配置领域/应用、真实 HTTP/数据库和三端展示专项已随全套回归通过。未提交/推送/部署，原有开发进程和验证库保持运行。

2026-10-30 历史知识复验阶段：项目知识 RAG 入口复用既有发布校验，违规旧内容不调用 Embedding；项目知识 sourceState 升级 v2，旧 v1 在复验回填前隐藏。其他来源与 OpenAPI 1.39.0 不变，无新增依赖或迁移。见 [本仓契约快照](../../../contracts/openapi.json)。人工全量语料审查、真实 provider 回填和项目整体验收仍未完成；下方旧阶段按历史阅读。

2026-10-30 RAG 字段分组阶段：修复文章分组停用后公开字段仍进入索引及检索的问题；读取与 SQL 均按活动分组过滤，真实 pgvector 覆盖停用/重建/恢复、无值不误隐藏及 LIMIT 前过滤。OpenAPI 仍 1.39.0，无新增协议、依赖或迁移。见 [本仓契约快照](../../../contracts/openapi.json)。历史知识语料审查、AI 运维及整体验收仍未完成；下方数字按历史阶段阅读。

2026-10-30 知识写入授权阶段：项目知识五类写命令已在事务内复核受保护管理员、入口/动作权限，补齐敏感元数据/来源 URL、发布前存量校验和 ID/版本边界；文章封面/分类增加共享锁、MIME 与 raw 冲突映射。新增 31 项真实数据库测试，知识专项共 50 项通过。三仓冻结安装通过；Backend lint/typecheck、118 文件/816 单测、3 文件/85 HTTP、26 文件/468 真实数据库测试、build 及前后 db:verify（20 迁移）通过；Web check 187 项及官网/Admin production build；App check 99 项、Doctor 20/20 和三平台 export 通过。OpenAPI 仍 1.39.0，三仓哈希一致，无新依赖或 migration。见 [本仓契约快照](../../../contracts/openapi.json)。全局雪场字段/资源授权、RAG 运维、工作台/会话审计与浏览器/设备/真实供应商等仍未完成，项目整体未完成。

2026-10-30 系统配置阶段：用户已确认六项文本配置协议，后端管理员 GET/PATCH 与公开 GET /public/config、expectedVersion、事务内授权/审计已实现；Web 配置页与官网/App 关于/隐私/协议页面已接入。三仓独立冻结安装通过；Backend lint/typecheck、117 文件/772 单测、3 文件/85 HTTP、23 文件/372 真实数据库测试、build/OpenAPI 通过，测试前后 db:verify 通过（20 迁移）；Web check 187 项及官网/Admin production build；App check 99 项、Doctor 20/20 和三平台 export 通过。OpenAPI 1.39.0，三仓 SHA-256 均为 `bd9f3a624ab2263966bc4e9b6a33bd677e735af94f27ff44b446b2ba5a9e9444`；无新依赖或 migration。 见 [系统配置工程说明](../system-config.md)。正式政策内容、浏览器/设备、真实供应商与 AI 管理等仍待完成，项目整体未完成；下方旧阶段记录按历史阅读。

2026-10-30 AI 联合验收阶段：修复会话分页偏移与消息运行时类型校验；新增真实登录/HTTP/SSE/pgvector 测试 22 项，含引用过滤、幂等重放、失败重试、断流取消、删除竞争和跨会话限流。三仓独立冻结安装通过；Backend lint/typecheck、115 文件/751 单测、3 文件/84 HTTP、22 文件/351 真实数据库测试、build/OpenAPI 通过，测试前后 db:verify 均通过（20 迁移）；Web check 175 项及官网/Admin production build；App check 96 项、Doctor 20/20、iOS/Android/Web export 通过。OpenAPI 仍 1.38.0，三仓 SHA-256 均为 `675969590facea86c8228c2e89fc8a69ee0329f893ab0e4314ad8c1fe6fcbc6e`；无新依赖或迁移。 详见 [AI 联合验收](../../../../backend/docs/engineering/ai-http-rag-validation.md)。真实模型/provider/设备、在途撤权与来源变化、系统配置及 AI 管理仍待完成，项目整体未完成。下文其他阶段数字按历史记录阅读。

社区事务阶段本仓复验：冻结安装、契约/lint/typecheck/96 项测试、Doctor 20/20 及 iOS/Android/Web export 通过。本轮 Doctor 无上阶段远程清单获取警告。未变更业务代码或依赖，真实设备联调仍缺。

2026-10-30 社区事务阶段：后端补事务内权限复核和图片/雪场引用锁，契约仍为 1.38.0，本仓无需更新类型或 Expo API。前端校验不能替代后端授权；403/404/409 仍按既有错误流程处理。

本阶段：独立冻结安装、OpenAPI 1.38.0 校验、lint/typecheck、96 项测试、Doctor 20/20 和 iOS/Android/Web export 均通过。Doctor 提示远程 native modules 清单获取警告；本地检查正常，真实设备验收仍缺。未新增依赖或修改 Expo API。

2026-10-30 社区边界契约同步：当前 OpenAPI 1.38.0，创建/编辑最多 9 张图片已由后端 DTO/领域规则共同限制，与 App 现有界面上限一致；本仓快照和生成类型已更新，业务说明见 [动态发布](../dynamic-composer.md)。下文旧版本和测试统计为历史阶段记录。

2026-10-30 D-36：知识列表收藏标记、详情收藏/取消、按账号隔离缓存及结果不明核对已实现。当前 OpenAPI 1.37.0。见 [文章收藏](../article-favorites.md)。

完整 check 96 项（新增文章 transport 9 项）/Doctor 20/20、最终 lint/typecheck/test 及 iOS/Android/Web export 通过；真实设备交互仍待验。无新依赖，未提交或推送。

以下为历史阶段记录。

2026-10-30 D-30：`/profile/edit` 昵称/头像、保持/清除/还原、保存与刷新核对已接 API；会话仅合并同账号资料，保留授权集合。当前 OpenAPI 1.36.0，详见 [本人资料编辑](../own-profile.md)。

本仓独立冻结安装、完整 check 87 项/Doctor 20/20 和三平台 export 通过。资料流程新增 23 项模型/transport/合并测试，尚无真实设备、页面点击或真实存储验收。

历史阶段：2026-10-30 D-05契约同步：本仓OpenAPI1.35.0快照/锁和本仓生成类型已更新，无App业务或依赖变更。独立冻结安装、check64项/Doctor20/20及iOS/Android/Web export通过；设备/API联调仍待验。

历史阶段：2026-10-29 收益契约同步：本仓OpenAPI快照/锁/生成类型升级1.34.0，未改App业务或依赖。冻结安装通过；完整check64项/Doctor20/20及iOS/Android/Web export通过，设备/API联调仍待验。

历史阶段：2026-10-29 D-23 契约同步：OpenAPI1.33.0快照、锁及本仓生成类型已更新，无App业务/依赖变化。独立冻结安装、check64项/Doctor20/20与iOS/Android/Web export通过；设备/API联调仍待验。

历史阶段：2026-10-29 权限目录阶段复验：独立冻结安装、check64项/Doctor20/20及iOS/Android/Web export通过。当前OpenAPI1.32.0，快照、锁与本仓生成类型已同步；本轮未改App业务，设备/API联调仍缺。

历史阶段：2026-10-29 字典阶段复验：独立冻结安装、check64项/Doctor20/20及iOS/Android/Web export通过；OpenAPI保持1.31.0，本轮无App业务或依赖变化。设备/API联调仍缺。

2026-10-29 字段配置审计阶段复验：独立冻结安装、check64项/Doctor20/20与iOS/Android/Web export通过；OpenAPI保持1.31.0，本轮无App业务或依赖变化。设备/API联调仍待完成。

2026-10-29 D-42 契约同步：当前 OpenAPI 1.31.0；App无页面/依赖变化，独立冻结安装、完整check（64项、Doctor20/20）与iOS/Android/Web export通过。日志仅管理端可见，未在App增加管理入口；真实设备/API联调仍待验。

历史D-41同步：当时OpenAPI1.30.0，未改 App 页面或依赖。独立冻结安装、完整 check（64 项、Expo Doctor 20/20）与 iOS/Android/Web export 均通过；真实设备/API 验收仍待完成。

历史阶段：2026-10-29 资产后端阶段同步复验：App无业务或依赖变化；独立冻结安装通过。首轮完整check的Doctor因远端元数据服务异常失败（19/20），随后完整check重新通过（64项、Doctor20/20），iOS/Android/Web导出通过；没有关闭网络检查。OpenAPI仍为1.29.0。设备/API验收仍缺。

2026-10-29 最新复验：本轮 frozen install、完整 pnpm check（契约/lint/typecheck、9 文件/64 项单测、Expo Doctor 20/20）及 iOS/Android/Web export 通过。本轮网络恢复，未禁用 Doctor 或变更依赖；上阶段两次 exp.host:443 超时导致当时完整 check 失败，保留为历史。设备/API 联调仍未验收。

独立的 Expo Router、React Native、TypeScript 客户端，支持 iOS、Android 与 Expo Web。App 通过 Backend HTTP API 获取数据，不直接连接 PostgreSQL、pgvector、Kafka 或模型服务，也不依赖 Web、Backend 或父目录的源码包。
