# 个人中心入口与资料刷新

2026-11-03；对应 APP-10 / API-A01、APP-11，沿用 OpenAPI 1.50.0 / 143 操作。没有新业务接口、请求字段、依赖或迁移；App 仍只连接后端 HTTP，凭证继续使用原生 SecureStore / Web Cookie 适配。

## 页面行为

六项失败先复现：无 AI 权限仍显示入口、旧会话按钮触发退出、旧账号按钮导航、聚焦后未更新资料，以及较早资料读取覆盖新权限或刚提交的资料编辑。日志 `profile-home-before.log` 保留；修复后原回归与专项三文件58项、类型检查通过。

个人中心按账号、状态和 storage epoch 建立组件边界。`ProfileHomeRun` 管理焦点、资料读取、导航/退出/恢复门禁；输入身份只用于本地校验，没有发送 userId、角色或商家 ID 来决定服务端权限。

- 编辑资料、收藏、本人动态和 AI 入口分别读取 `account:profile:update`、`member:favorite:toggle`、`community:dynamic:read-own`、`ai:conversation:use`。不根据商家/管理员角色键判断；设置和退出对当前登录账号保留。
- 操作处理器再次核对当前账号、epoch、焦点及最新已知 grant。导航同步去重；退出或恢复期间不发竞争操作。旧账号/失焦按钮不能操作后来会话。
- 每次聚焦通过既有 `refreshProfile` / `GET /auth/me` 更新账号、角色/grants及头像签名 URL；也提供手动“更新账号资料”。该请求仍受后端 `account:profile:read` 限制，不把客户端缓存的 grant 当成服务端现行授权。
- 读取失败隐藏身份详情并允许重试；独立功能入口仍各自按 grant 判断，目标 API 继续由后端授权。资料读取不改变 AI、收藏等动作所需的权限集合。
- 失焦、导航或退出取消本页资料读取。取消不清除其他账号/页面的数据；旧请求结束不能解除新读取或退出的门禁。游客不查询私人资料，保留登录、恢复重试及公开平台信息。

退出使用现有全局会话服务；本页提交本地预期账号给 SessionController，服务在调用平台 logout 前再核对自身当前账号，旧账号意图不能中断新的登录。HTTP logout body 和凭证清理/撤销规则保持。全局服务在退出同步停用身份之后负责展示未确认警告，旧页面不会给新账号追加迟到错误。

## 会话资料一致性

SessionController 的资料读取增加独立递增代次并透传 AbortSignal；只有当前会话、最后发起且未取消的读取可更新完整 CurrentUserVO。后发读取、同账号重新登录或已合并的资料编辑会使旧读取失效。编辑投影须匹配 userId 与 account，只合并昵称/头像，不覆盖完整角色/grants。

完整刷新在发布前检查用户 ID、账号/昵称、头像类型、角色标签、权限键、菜单数组与商家摘要的结构；菜单子树不是本页的动态路由输入，本次不增加菜单递归协议。异常成功体不进入全局资料，页面提示更新失败。

此处代次表示客户端发起顺序，不是数据库提交版本，也不提供服务端串行化快照。焦点期间没有权限推送/轮询；角色变更在下次成功读取或会话边界同步，所有目标 API 仍独立检查当前授权。已有缓存信息在读取期间可能短暂展示，失败后身份详情隐藏；不宣称实时撤权隐藏或物理删除客户端历史。

## 验证范围

`profile-home-run.test.ts` 覆盖权限组合、过期按钮、取消/失焦/重聚焦、重复导航/读取/退出/恢复、未知退出结果及资料失败；页面测试通过 React 服务端渲染和原生组件/焦点替身捕获真实处理器。SessionController 测试覆盖读取顺序、已提交编辑、跨身份退出、取消和异常资料。新增44项（页面模型22、页面处理器7、会话服务15），专项三文件58项通过。

独立冻结安装、完整check（61文件1110项）、lint零警告、TypeScript与Doctor20/20通过；iOS/Android/Web导出退出0，产物 `D:/linji-profile-home/20261103/app-export`。日志前缀profile-home-保留，三仓配套复验结果见共享阶段记录。

页面测试和传输替身不等于真实设备、浏览器、SecureStore、Cookie、实际头像过期或 PostgreSQL 验收。本次没有重试此前被拒绝的 Next 生产/Expo Web 启动，也没有重启 Docker；真实运行、模型供应商及整体验收继续待办。

独立复现：

```powershell
pnpm install --frozen-lockfile
pnpm exec vitest run src/features/profile/profile-home-run.test.ts src/features/profile/profile-home-screen.test.tsx src/platform/auth/session-controller.test.ts
pnpm check
pnpm exec expo export --platform all --output-dir D:/linji-profile-home/20261103/app-export
```

实现沿用本轮已查阅的 [Expo SDK58](https://docs.expo.dev/versions/v58.0.0/)、[文档索引](https://docs.expo.dev/llms.txt)与[焦点处理](https://docs.expo.dev/router/reference/focus-handling.md)（2026-11-03，SDK58.0.22 / Router58.0.29，HTTP200；focus 文档修改日期2026-10-12），采用 useCallback + useFocusEffect 清理；没有新增 Skill 或跨仓运行依赖。
