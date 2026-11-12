# 登录与注册页面生命周期

2026-11-03；对应 APP-14 / API-A01，沿用 OpenAPI 1.50.0 / 143 操作及原生 SecureStore、Expo Web Cookie/CSRF 协议。没有新增接口、依赖、数据库迁移或跨仓源码引用。

## 已修复的问题

四项页面回归先复现失败：显式登录未结束时可选择游客入口、离开页面后仍被迟到响应跳转、会话被替代后旧登录结果仍跳转，以及恢复会话的边界警告没有显示。失败日志 `auth-screen-before.log` 保留。页面测试以 React 服务端渲染和替身原生组件/焦点钩子捕获处理器，不是真实导航或设备验收。

新增 `AuthFormRun` 管理焦点代次、同步提交门禁、反馈和注册响应校验；页面输入与密码显示状态仍在组件内，会话凭证继续由现有 SessionController 和平台适配器持有。表单运行状态不包含密码，不将密码写入缓存或设备存储。

- 焦点激活后才能操作。恢复会话期间展示状态并停用表单，游客与返回入口仍可用，公开浏览不等待凭证恢复；恢复失败或浏览器结果未确认的原始警告可见。
- Enter、按钮、模式切换、返回和游客入口共用同步门禁，避免 React 尚未渲染 loading 时重复触发。提交期间输入不可编辑。
- 登录开始后捕获其同步提升的 storage epoch；只有同一页面焦点和同一 epoch 的结果可导航。旧结果不能在用户离开或换号后触发跳转和错误反馈。返回原页面也不会接纳旧焦点结果。
- 切换模式、提交有效表单和失焦时清空组件内密码并恢复隐藏。账号 trim 后转小写，密码保留空格，注册昵称 trim；沿用 UTF-8 字节和字符长度规则。校验失败保留输入供用户修正。
- 注册不自动登录。成功必须得到本人规范账号和有效 RegisteredUserVO；错误账号、非法 int4 ID、空昵称等不会显示成功。正常成功切换到登录模式。
- 注册失焦会向原生/Web transport 传递 AbortSignal。即便传输层忽略取消，迟到响应仍不能更新页面。取消可能发生在服务端提交之后，返回页面提示结果未确认；网络、408、5xx 或异常成功体同样提示人工核对，不自动重复注册。

## 凭证与取消边界

页面失焦取消注册等待，不表示撤销已创建账号；账号唯一约束及注册事务仍由后端保证。用户可手动切换登录模式核对，应用不自动探测密码。当前接口没有新增注册结果查询或幂等键。

显式登录由全局会话服务执行。用户通过硬件返回或外部导航离开后，登录仍可能在会话服务完成；本次仅禁止旧页面导航和反馈，不把 UI 取消误报成服务端撤销登录，也不擅自清理后来建立的其他会话。若页面保留并重新聚焦，旧请求未结束前继续保留提交门禁；结束后可手动操作。实际网络超时和服务端会话生命周期保持原协议。

已存在的原生刷新与存储轮换、浏览器 Web Locks 和跨标签页 revision 不因页面重构改变。App 只调用后端 HTTP，不接触 PostgreSQL、Kafka 或模型凭证。

## 验证与复现

四项原始失败回归修复后通过；随后补充恢复期间键盘提交、快速重复提交和返回处理器测试。纯模型测试覆盖登录同步 epoch、跨焦点/跨身份成功与失败、注册取消及迟到响应、规范化、字节校验、未知结果与脱敏反馈。Web transport 专项覆盖获取 CSRF 期间离开页面后不发送注册 POST；使用替身 fetch/storage/locks，不证明浏览器执行 CORS 或 Cookie 属性。

初轮修复后的页面夹具因在每次渲染重新注入空字符串种子，使后续渲染账号为空而失败；改为只初始化 React state 后通过，没有降低行为断言。最终新增38项（表单模型30项、页面7项、Web注册取消1项），专项四文件88项通过。首次1065项及导出证据保留；补充恢复期间游客入口后完整本仓check（59文件1066项）、lint零警告、TypeScript和Doctor20/20再次通过，冻结安装已通过且依赖未变；iOS/Android/Web最终导出退出0，产物 `D:/linji-auth-screen/20261103/app-export-final`。

Backend配套独立冻结安装、完整check（138文件1192项）、8文件156项HTTP/框架测试及build通过；Web独立冻结安装、完整check（1459项业务加20项发布测试）、官网/Admin无缓存构建及standalone包打包校验通过。日志前缀auth-screen-，契约与历史验证边界保持，不把这组配套检查记为数据库或真实设备通过。

在本仓独立执行：

```powershell
pnpm install --frozen-lockfile
pnpm exec vitest run src/features/auth/ src/platform/auth/auth-session.test.ts src/platform/api/api-client.web.test.ts
pnpm check
pnpm exec expo export --platform all --output-dir D:/linji-auth-screen/20261103/app-export-final
```

没有启动先前被自动审批审查拒绝的 Expo Web 服务，也没有绕行启动。原生键盘、硬件返回、真实导航焦点、SecureStore、浏览器多标签页及生产 API 点击流程继续待验。Docker 查询显示引擎命名管道不存在，按用户决定不重启；数据库/容器待办保持。

## 官方资料

遵循本仓 AGENTS，在修改前核对 Expo **58.0.22** / Router **58.0.29** 与 [SDK58](https://docs.expo.dev/versions/v58.0.0/)、[文档索引](https://docs.expo.dev/llms.txt)及[焦点处理](https://docs.expo.dev/router/reference/focus-handling.md)，查阅日期 2026-11-03，均 HTTP200；焦点文档标记修改日期 2026-10-12。采用文档要求的 useCallback 包装 useFocusEffect，并在失焦/卸载清理。资料副本位于本机 `D:/linji-auth-screen/20261103/docs`，仓库不依赖该路径运行。
