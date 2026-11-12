# 账号设置与自助改密生命周期

2026-11-02；OpenAPI1.50.0/143操作，沿用 `ChangeOwnPasswordDto`、`PATCH /account/password`、`GET /auth/me` 与既有退出协议，无新增接口/权限/依赖。iOS/Android凭证保持access内存、refresh仅SecureStore。

原设置页成功后仅显示“密码已更新”，但后端已撤销全部会话，客户端却仍展示原身份；网络结果不明可再次提交，失焦请求未取消。本轮路由变为单行入口，业务位于 `src/features/settings/`：`settings-screen.tsx`负责表单/焦点，`settings-run.ts`负责同步门禁、命令状态和取消，`settings-api.ts`负责生成DTO及HTTP/凭证适配。

表单按账号、权限及session epoch重建；失焦取消请求、清空三个密码输入和退出确认。提交后立即清空密码，控制器只保存错误/状态，不保存凭证。提交前以no-store读取本人/grant，读写均绑定捕获的会话epoch；改密请求 `skipAuthRefresh=true`，不会因旧密码401触发refresh后重放。原密码保持原样，新密码8–72 UTF-8字节，需两次一致且不同于原密码。

真实204确认后，后端已撤销全部会话；客户端直接清除本地凭证，不再额外调用远程logout。清理同步推进epoch，使根SessionController匿名并清空当前账号Query缓存，然后进入登录页显示重新登录提示。原生存储删除排队执行，失败时access仍为空且refresh读取阻断；下次登录仍须先成功删除旧凭证。导航只针对原epoch一次失效，不允许旧完成操作清掉新账号。操作触发的凭证清理由会话epoch归属，页面卸载不取消这次清理。

网络/408/5xx或成功响应解析失败可能发生在服务端提交后，显示未知并禁止再改密；页面同一实例失焦再回来仍需先退出并登录核对。不会自动尝试新旧密码，也不会用账号详情推断改密成功。明确4xx拒绝才允许用户修正后手动提交。完全卸载不持久化未知台账或密码，再进入须以服务端登录结果为准；不宣称跨设备/跨卸载幂等。

## 验证

独立冻结安装、完整 `pnpm check` 通过：32文件556项、lint零警告、typecheck与Doctor20/20。设置新增37项控制器/transport/原生存储替身测试，覆盖同步锁、明确拒绝与未知结果、身份错配/撤权、取消/迟到、凭证epoch及延迟/失败清理。`pnpm exec expo export --platform all --output-dir dist/settings-flow-validation` 三平台通过。首轮三个unbound-method警告已用明确this:void修正，日志保留。

另有 `test/settings.http-spec.ts` 两项真实HTTP联调：使用本仓生产api-client、auth-session、SessionController、SettingsRun，对独立Nest/PostgreSQL验证错误旧密码401、204后UI身份及access/refresh清除、服务端会话拒绝，以及真实提交后响应被注入丢失且不重放。只有Native SecureStore模块被替换为可观察内存适配；无HTTP/授权/密码散列/数据库替身。后端另断言两个模拟账号各一次成功改密审计、零有效会话。这不是原生OS存储、触摸、导航或浏览器成功流程验收。

HTTP套件不加入离线单测命令：先由后端独立创建专用可销毁环境和模拟清单；通过环境传入 `EXPO_PUBLIC_API_BASE_URL`、`SETTINGS_HTTP_FIXTURE_JSON`、`SETTINGS_HTTP_FIXTURE_PASSWORD`，在App本仓运行 `pnpm test:settings-http`。测试仅接受loopback API及linji_settings_validation清单标记，无数据库访问和跨仓导入。配置为本仓 `vitest.config.http.ts`，无需新依赖；测试文件在普通Vitest默认命名规则之外。

## 来源与未完成项

已于2026-11-02查阅[SDK58](https://docs.expo.dev/versions/v58.0.0/)、[SDK58 SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/)、[Router焦点](https://docs.expo.dev/router/reference/focus-handling.md)和[参数](https://docs.expo.dev/router/reference/url-parameters.md)。焦点页最后修改2026-10-12；SDK版本来自本仓lockfile。沿用此前skills.sh实践记录，将焦点清理、适配层和会话归属落到源码。

当时发现Expo Web的SDK SecureStore模块为空，原生transport省略Cookie，与后端浏览器Origin/CSRF规则不匹配。后续已按用户确认完成[Cookie/CSRF平台适配](expo-web-auth.md)，现行Web实现采用平台文件；本说明保留当时原生设置流程证据。真实浏览器仍待验，三平台导出不等同Web登录通过。D-09自助注销为独立可选未决项。真机SecureStore/导航、生产HTTPS/Cookie、真实模型/Kafka/provider及整体验收继续待完成。
