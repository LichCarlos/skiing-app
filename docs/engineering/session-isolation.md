# App 认证并发与账号隔离

2026-10-31，适用于 API-A01、APP-10/14/15 和全部 App HTTP 请求。OpenAPI 保持 1.44.0，没有新增接口、依赖、迁移或服务端认证规则。

## 凭证与存储

`src/platform/auth/secure-session.ts` 维护进程内的会话版本。开始登录、退出、清理失效凭证都会同步递增版本并清空内存 access token；随后以同一条异步队列读写 SecureStore 的 refresh token。写入前后都核对版本，旧原生写入即使无法取消，也不能重新发布 access；之后排队的清理和新账号写入按顺序完成。

旧请求清理凭证时必须带原版本，不得清掉新账号。原生写入失败会尝试清理并保持未登录；清理失败时，本进程阻止读取旧持久凭证。底层原生存储失败不能被描述为“已成功删除”，退出提示保留设备清理/服务端撤销未确认的事实。进程重启后的实际持久状态仍取决于原生存储，需设备故障验收。

开始重新登录会先清理上一份本地凭证；新密码错误或网络失败时保持未登录，不回退到上一账号。access 不落盘，refresh 不进入 AsyncStorage、localStorage、查询缓存或日志。

## HTTP、refresh 与退出

`src/platform/api/api-client.ts` 在每个普通请求及 SSE 建立阶段绑定会话版本，发送前、返回后及续期重发前复核。跨账号的旧 JSON 结果直接拒绝；未交付给调用方的旧 SSE 响应取消 body。`expectedSessionEpoch` 仅是本地请求选项，不传给 fetch 或后端。

启动恢复、显式恢复与 API 401 共用按版本隔离的 refresh 请求。并发请求只轮换一次；迟到的旧 access 401 会复用已经获得的新 access，不再轮换。旧 refresh 成功、401、网络错误或 finally 均不得覆盖/清理新账号或释放新账号的 refresh 锁。其他网络错误不自动重试业务写入。

一个调用方取消等待时立即结束该调用，不取消其他调用方共用的 token 轮换；轮换仍会安全保存新的 refresh，以免丢失已被服务端轮换的凭证。取消者不会在轮换完成后继续重发原写入。SSE 开始后的流取消仍由 AI 页面生命周期负责，见 [AI 生命周期](ai-conversation-lifecycle.md)，不自动重连。

`auth-session.ts` 的登录结果在保存和返回用户前再次复核版本；恢复时若当前登录尚在进行则等待同一登录结果。退出先同步停用当前会话，再串行读取并删除凭证；使用捕获的旧凭证请求服务端撤销，远程完成后不再无条件清空本地。重复退出共享一次操作。远程失败不能证明服务端会话已撤销；原生清理失败也不保证设备上的 refresh 已删除。

## 用户状态与查询缓存

`session-controller.ts` 与 React Provider 分离，按操作版本控制状态归属。启动恢复、旧错误、退出完成和同账号旧资料响应不能覆盖后来的操作；显式登录/退出进行时恢复按钮不启动另一次恢复。Provider 卸载时取消订阅并忽略旧状态回调。

凭证边界会立即通知 Provider 切到游客，并通知根布局清空 TanStack Query 缓存；各业务页面仍按账号划分键并由后端独立鉴权。`refreshProfile` 对同一有效账号采用完整 `/auth/me` 投影，更新权限与菜单；资料编辑的 `applyProfile` 仍仅合并昵称和头像，不覆盖 grants。登录/注册和个人页退出增加同步点击锁。

## 验证边界

认证与 HTTP 专项 8 文件/73 项，App 完整 24 文件/342 项通过；相对上阶段净增 39 项。覆盖现有注册校验、密码、资料合并与 transport 回归，并新增原生写入、共享轮换和 UI 状态竞争场景。lint 零警告，Doctor 20/20 与三平台导出通过。

认证、存储、真实请求适配器和 UI 状态模型的专项测试使用受控 HTTP 响应与原生 SecureStore 替身，覆盖迟到响应、串行写入、清理失败、共享轮换、重复退出、取消等待和 Provider 状态竞争。这些是进程内确定性测试，不等于 iOS/Android 真机 Keychain/Keystore 或真实后端点击验收。

完整检查与导出结果见本仓 README、共享追踪矩阵和测试覆盖记录。Expo Web 导出只证明编译；SecureStore 官方支持 Android/iOS/tvOS，本阶段没有为 Expo Web 声明持久登录能力。官网与管理端继续使用独立 Next.js Web 项目。

## 实践来源

已确认本仓 Expo 为 `~58.0.21`，2026-10-31 查阅 [SDK 58 SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore.md)：get/set/delete 均为可失败的原生异步操作，因此必须处理写入与清理竞争，不能将组件取消视为原生存储写入已撤销。已有 skills.sh 来源、版本与落点继续维护在 [工程实践来源](skills-practices.md)，本阶段没有安装新的 Skill。
