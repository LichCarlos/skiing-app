# 知识列表会话隔离与真实 HTTP 验收

当前补充：Expo Web Cookie/CSRF已在随后阶段实施，见[认证证据](expo-web-auth.md)；文章详情已完成后续固定epoch与VO校验，知识HTTP套件现为7项，见[文章详情证据](article-lifecycle.md)。下文836项和HTTP三项属于知识列表原阶段范围。

2026-11-02；APP-06/API-K01，OpenAPI **1.50.0 / 143 操作**保持，无新增业务接口、依赖或数据库 migration。Expo Web 的 Cookie/CSRF 方案已获用户确认，当前尚未接入，本文不宣称浏览器登录已可用。

## 实现

Tab 路由只导出 `knowledge-list-screen.tsx`。页面子树按账号、有效 grants、session epoch 重建，列表与分类缓存包含固定 epoch 和焦点代次。恢复登录时不读列表；返回页面重新读取，失焦取消本会话列表和分类请求。读取失败为 401/403 时隐藏旧个人投影；响应格式错误也隐藏卡片。普通网络刷新失败仍可保留同会话已验证的列表并显示重试，分页失败支持主动继续；分类失败独立处理，仍可清除分类筛选。

`knowledge-list-session.ts` 捕获同一次登录，所有文章、身份和分类请求均绑定 expectedSessionEpoch、AbortSignal、no-store。登录用户在列表读取前后确认账号，不要求收藏写权限；游客投影强制 favoriteByMe=false。分类公开读取仍受本次页面会话取消与 epoch 限制。输入条件先校验，非法页码/超长筛选不请求；保留当前每页12条的界面选择。

`article-list-validation.ts` 校验页码/页大小、非负整数total、hasNext、同快照应返回的条数、唯一正int4文章ID、标题/摘要、可空封面/作者、分类、日期和收藏布尔值；分类项需非空value/label且value唯一。列表按文章ID去重展示，分页契约仍由后端保证稳定的 PublishTime DESC/ArticleId DESC。收藏失效前缀保留 `public-articles,userId`，兼容现有详情收藏成功后的列表刷新。

本轮仅修改知识列表读取；文章详情原有生命周期和收藏控制器保持，不能用列表测试覆盖详情、原生设备或在途撤权所有时序。

## 验证

新增47项：分页/分类响应边界27、会话端口10、页面接线10；知识模块6文件96项通过。页面静态接线使用Native、Router、Query替身，测试恢复/失焦、401/403/格式错误隐藏、网络失败保留、分类独立失败、非法输入和缓存取消，不等同原生点击验收。

完整 App 48文件836项、lint零警告/typecheck、Expo Doctor20/20及iOS/Android/Web导出通过；三仓冻结安装、Backend1039项/check/build和Web1459项/check/官网/Admin构建通过（Web两构建缓存命中）。三平台导出证据保留于本仓忽略的 `knowledge-list-export.log`，产物为 `D:/linji-knowledge-mobile/export-20261102`。

独立 `pnpm test:knowledge-list-http` 三项通过，使用实际 transport/auth/session→编译Nest/PostgreSQL17/pgvector，只有Native SecureStore为内存替身。14篇公开文章12+2分页和同时间ID倒序、草稿/撤回/软删/停用分类排除、第三页空结果、分类目录、标题/摘要大小写不敏感、字面量 `%_` 与分类组合、账号收藏隔离及同账号重登录旧epoch请求前拒绝已验。后端另确认18篇夹具文章未变、两个账号各自收藏不同文章。

## 独立复现

本仓不导入Backend源码、不连接数据库。由API负责人准备空专用库和非凭证夹具清单，在回环地址运行编译后服务；向本仓提供清单JSON和合成用户密码：

```powershell
$env:EXPO_PUBLIC_API_BASE_URL='http://127.0.0.1:62940/api/v1'
$env:KNOWLEDGE_LIST_FIXTURE_JSON='<API负责人提供的合成夹具JSON>'
$env:KNOWLEDGE_LIST_FIXTURE_PASSWORD='<临时合成密码>'
pnpm test:knowledge-list-http
```

测试仅接受回环地址和清单数据库名 `linji_knowledge_list_validation`，注册两个合成账号，不能在同一夹具上重复注册；失败后重建空库。后端迁移/双seed/前后db:verify及持久断言由其独立执行。无真实设备、Expo Web登录、生产供应商、远程CI或完整历史数据库/HTTP套件的本轮新增结论。

实现前按App AGENTS读取 [SDK58](https://docs.expo.dev/versions/v58.0.0/)、[官方文档索引](https://docs.expo.dev/llms.txt)及[Router hooks](https://docs.expo.dev/router/reference/hooks/)（2026-11-02，PowerShell HTTP200）；useFocusEffect文档明确失焦执行清理。尝试同路径`.md`返回404，随后读取成功的HTML正文核对API，未以404当作已读。没有新增Skill或跨仓源码共享。
