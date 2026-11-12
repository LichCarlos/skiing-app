# Expo Web Cookie/CSRF 认证适配

2026-11-02；用户已确认，代码与专项 HTTP 验证完成，真实 Expo 浏览器点击验收待完成。OpenAPI **1.50.0 / 143 操作**保持；没有新增运行时依赖、业务接口或数据库 migration。

## 平台与会话边界

Metro 通过 `api-client.web.ts`、`auth-session.web.ts`、`secure-session.web.ts` 选择浏览器适配；业务页面保持平台无关。iOS/Android 保留内存 access、SecureStore refresh、Bearer 和既有轮换规则。响应解包、URL 限制和请求体序列化提取到本仓 `api-protocol.ts`，原生回归纳入完整检查。

Web 强制 `credentials: include`，移除调用方 Authorization/CSRF 头；每次写入在同一个 Web Lock 内获取 `/auth/csrf` 并发送 `X-CSRF-Token`。仅精确的 403 `CSRF validation failed` 允许重取一次，业务拒绝和未知写入不重放。登录/刷新响应不得含 accessToken/refreshToken；JS 不读取 HttpOnly Cookie，也不调用原生 SecureStore。

浏览器 localStorage 只保存 API 地址对应的随机 revision、blocked 和 unconfirmed 意图标记，不保存用户资料、密码或令牌。登录/退出立即提升 epoch 并停用旧页面、缓存和在途响应；同一 Expo Origin 的 Cookie 请求由 Web Locks 串行执行，防止旧登录/刷新响应在新身份建立后覆盖 Cookie。storage/pageshow 事件及请求前后读取 revision 捕获其他标签页切换。其他标签页先清理身份，之后可显式恢复，不自动把旧页面迁入新账号。

恢复先 GET `/auth/me`，仅 401 才刷新；相同 epoch 恢复共享一个 promise，并发请求在锁内复核 Cookie。刷新网络错误、5xx 或无效响应可能发生在服务端提交之后，因此停用当前浏览器会话并持久提示未确认，禁止自动重放。退出成功保留 blocked 标记；退出结果丢失保留未确认提示，重载也不自动恢复。本人改密成功后停用本地会话；服务端撤销全部会话。只有新的显式登录能够解除停用。

存储不可用、标记损坏或 Web Locks 缺失时拒绝凭证操作；存储读取失败不使渲染崩溃。损坏标记可由显式登录替换。被停用的公开读取使用 `credentials: omit` 返回游客投影；受保护读取在发请求前拒绝。原生会话通知默认无浏览器提示。

## 部署条件

使用支持 Web Locks 的 HTTPS 浏览器（本机 localhost 安全上下文可开发）。Expo UI 与 API 使用同站但不同 Origin，后端 `WEB_ORIGINS` 显式列出 UI Origin，CORS 允许凭证；统一使用 localhost，避免混用 127.0.0.1。现有 `/auth/csrf` 依赖允许的 Origin，不能宣称已支持同 Origin 代理部署；跨站部署受 SameSite=Lax 限制。

Web Locks/localStorage 只协调同 Origin 标签页，不能协调不同 Origin 的 Next 与 Expo。部署时应给两客户端独立的 API 主机和 host-only Cookie 空间，或只启用一个浏览器登录入口；共享同一个 API Cookie 空间的多 Origin 并发账号切换尚未验证。用户手动移除站点数据会移除本地意图标记。需要长期可靠的站点存储，存储被禁用时不开放浏览器凭证操作。

## 已运行的验证

新增38项：37项 Web transport/会话测试和1项未确认提示保留测试。覆盖凭证通道、CSRF 重取、JSON/FormData/204/SSE、URL 越界、并发轮换、迟到响应、跨标签页 revision、取消、存储失败、SSR 及未知结果重载。完整 App **49文件874项**、lint 零警告、typecheck、Doctor20/20通过；三仓冻结安装通过，Backend1039项/check/build、Web1459项/check/双应用构建通过（两构建缓存命中）。iOS/Android/Web 导出到 `D:/linji-expo-web-mobile/export-20261102`；检查 Web JavaScript 已包含浏览器适配标记且不含原生 refresh 存储键。日志前缀为本仓忽略的 `expo-web-`。

`pnpm test:expo-web-http` **5项通过**：实际本仓 Web transport/auth → 编译 Nest → PostgreSQL17/pgvector。测试仅替换浏览器 storage/locks/fetch Cookie 容器，HTTP 响应均来自后端；故意丢弃的是后端真实提交后的响应。验证注册不自动登录、Cookie 属性与无 JSON 令牌、恢复/一次刷新、真实 CSRF 拒绝后重取、资料持久化、改密撤销独立原生会话，以及已提交退出/刷新不重放。后端另核对密码哈希、昵称、被撤销会话和丢刷新响应后仍活动的会话。该容器不证明浏览器实际执行 CORS 预检、Secure/SameSite 限制、Web Locks 或 Expo UI。

曾有一项新增提示测试失败：通用恢复错误覆盖浏览器未确认提示。修正恢复错误优先级后完整874项通过；不把失败记录计为已通过。

自动审批审查拒绝了 `expo start --web --port 62952`（返回 blocked by policy，未说明具体原因），没有重试或替代启动。真实浏览器注册/登录、刷新重载、多标签页、资料编辑、本人改密、退出及响应丢失点击流程仍待验。三平台导出只证明构建；真机 SecureStore、真实供应商和生产部署不在本轮证据内。

## 独立复现

在本仓按 README 冻结安装；由后端负责人准备空专用库及清单，通过既有浏览器协议提供回环 API。测试负责人只接收非凭证清单和临时合成密码，不导入后端源码或连接数据库：

```powershell
$env:EXPO_PUBLIC_API_BASE_URL='http://localhost:62950/api/v1'
$env:EXPO_WEB_FIXTURE_JSON='<后端提供的JSON清单>'
$env:EXPO_WEB_FIXTURE_PASSWORD='<合成账号初始密码>'
$env:EXPO_WEB_FIXTURE_REPLACEMENT='<不同的合成新密码>'
pnpm test:expo-web-http
```

仅接受回环62950和清单库名 `linji_expo_web_validation`。用例有顺序和持久副作用，失败或重复运行需重建专用库，不能清空业务库。测试最后故意保留一次已轮换但客户端停用的服务端会话，用后端断言核对后销毁整个专用库。

实现前已按 App AGENTS 阅读 [SDK58](https://docs.expo.dev/versions/v58.0.0/)、[索引](https://docs.expo.dev/llms.txt)、[SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/)和[平台文件选择](https://docs.expo.dev/router/advanced/platform-specific-modules.md)（2026-11-02，HTTP200）。没有新增 Skill 或跨仓源码依赖。
