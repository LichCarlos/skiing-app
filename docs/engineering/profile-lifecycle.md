# 本人资料编辑生命周期

2026-11-02，D-30 / APP-11 / API-A02，现行实现说明。OpenAPI 1.50.0、143 个操作保持；无新接口、依赖、数据库迁移或跨仓库源码引用。

路由 `app/profile/edit.tsx` 仅导出 `src/features/profile/profile-screen.tsx`。screen 负责 Expo Router 焦点、相册、FormData、会话合并与当前缓存失效；`profile-run.ts` 负责同步操作门禁、编辑状态、焦点生命周期和未知结果恢复；`profile-api.ts` 采用本仓生成 DTO/VO，捕获 session epoch、AbortSignal，并校验响应账号与正 int64 AssetId。保留 `profile-submission.ts` 的昵称/图片校验及提交规则，大小拒绝非有限值和非整数。

进入/重新聚焦先读取 `/auth/me`，不使用缓存昵称初始化可编辑表单。读取、上传和保存共享同步门禁；失焦取消请求、清空表单/头像并隔离迟到结果。账号、account、认证状态、权限和 epoch 变化重新建立页面实例。`account:profile:update` 决定编辑权限，`asset:upload` 决定选取/上传新头像；无上传权限仍可按资料权限改昵称或清除头像。上传前和 PATCH 前重新确认身份及相应权限，后端继续独立授权。

昵称 trim 后 1–50 个 Unicode 码点；不变头像省略字段、清除传 null、新头像仅关联本人上传并 ready 的 AssetId。已知 ready 资产在明确表单拒绝后保留于本页，用户修正后显式保存可复用；不自动删除资产。上传或 PATCH 的网络/408/5xx、无效成功响应，以及写入中失焦，均暂停写入，禁止自动重传。409同样要求刷新与人工核对。401/403隐藏旧资料；第二次权限预读失败且 PATCH 尚未发送时，不误称已尝试保存。明确成功后才合并资料，保留原有角色/grants；缓存失效和导航均需焦点及 epoch 仍有效，UI刷新失败不将已确认成功降级为未知。

`/auth/me` 没有头像 AssetId，签名 URL 会变化。因此刷新仅展示最新昵称/头像，不能证明此前头像关联成功。未知结果须先成功刷新，再点击“我已核对，重新编辑”，两步均不触发写入。相同页面实例重新聚焦保留核对门禁；完全卸载后不持久保存未知台账或本地图片，重新进入仍会先读取资料。现有 PATCH 没有客户端版本条件，前端预读不保证跨设备并发编辑不会覆盖。

本阶段资料专项 3 文件 68 项通过，较上一阶段净增47项，完整 App 33 文件603项、lint零警告、typecheck、Doctor20/20和iOS/Android/Web导出通过。命令在本仓独立执行：`pnpm install --frozen-lockfile`、`pnpm exec vitest run src/features/profile`、`pnpm check`、`pnpm exec expo export --platform all --output-dir dist/profile-flow-validation`。失败与修复后的 profile-flow 日志均保留并忽略入库；初次纯控制器测试误引入Expo运行时与一条catch变量lint警告已修正。

另以 `pnpm test:profile-http` 完成两项真实HTTP测试，使用本仓api-client/auth-session/SessionController/ProfileRun，经独立Nest连接专用PostgreSQL。分别验证昵称修改保留旧头像、显式null清除并保留grants，以及真实提交后注入响应丢失、不重放、重新聚焦读取和显式核对。Backend另核对实际昵称/旧头像字段及成功审计次数2+1。仅替换Native SecureStore，picker/upload端口明确不在本套件范围，不模拟HTTP或数据库成功。配置 `EXPO_PUBLIC_API_BASE_URL`、`PROFILE_HTTP_FIXTURE_PASSWORD`、`PROFILE_HTTP_FIXTURE_JSON` 后运行；仅接受loopback和专用库清单，参见[后端复现](../../../backend/docs/engineering/profile-http-validation.md)。

本次不证明React交互/设备相册、原生SecureStore、真实对象存储/扫描或Expo Web浏览器登录成功。Expo Web认证平台适配后续已按用户确认实施，现行实现见[Cookie/CSRF平台适配](expo-web-auth.md)；真实浏览器仍待验，三平台bundle导出不能替代该验收。项目整体仍在进行。

本次变更前已核对 expo~58.0.22、expo-image-picker~58.0.10、expo-router~58.0.29。2026-11-02阅读的官方依据：[SDK58](https://docs.expo.dev/versions/v58.0.0/)、[文档目录](https://docs.expo.dev/llms.txt)、[焦点处理](https://docs.expo.dev/router/reference/focus-handling.md)、[ImagePicker](https://docs.expo.dev/versions/v58.0.0/sdk/imagepicker/)。实际应用为useFocusEffect失焦清理、权限检查和图片选择后的取消边界；未新增包或原生目录。
