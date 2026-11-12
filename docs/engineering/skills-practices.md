# App 工程实践来源

当前核对日期为2026-11-04：Expo Web Cookie/CSRF适配已有实现；契约现为1.51.1/143操作。下列带日期的实践记录按其当时范围阅读，上游技能版本和查阅日期保持，本次未重新审查上游。

本页只记录已采用的项目规则与代码落点，不复制上游 Skill 文档。

| 来源                                                                                                                                                                                                                                           | 版本/提交                                            | 查阅日期                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------- |
| [Expo Building Native UI](https://www.skills.sh/expo/skills/building-native-ui)，上游名 [expo-native-ui](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-native-ui/SKILL.md)             | `1.1.1` / `d5caf7fdf8b4854351f05841a7e315ac87ad7d24` | 2026-10-27（上游提交 2026-10-23） |
| [Expo Native Data Fetching](https://www.skills.sh/expo/skills/native-data-fetching)，上游名 [expo-data-fetching](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-data-fetching/SKILL.md) | `1.0.0` / `d5caf7fdf8b4854351f05841a7e315ac87ad7d24` | 2026-10-27（上游提交 2026-10-23） |

2026-11-04查阅本地vercel-react-native-skills 1.0.0（Vercel）及SDK58官方ImagePicker/FileSystem/Expo文档；落实为image-upload-form平台适配，头像/动态上传复用，4项字节回归与真实Android头像验收。技能为审查方向，未复制其他UI库或改仓库边界，详见[上传修复](native-upload-validation.md)。

## 工程落点

2026-11-02，知识列表落实固定epoch、焦点代次/取消、分页与分类响应校验及同账号重登录隔离，新增47项及真实HTTP三项通过；SDK58/Router核对、源码位置与替身边界见[知识列表生命周期](knowledge-list-lifecycle.md)。Expo Web Cookie/CSRF适配已实施，见[平台适配](expo-web-auth.md)；浏览器验收仍待完成。

2026-11-02，设置将焦点清理、同步命令锁、session epoch和未知结果门禁落到独立screen/run/API适配；37项专项及两项真实HTTP/Nest/PostgreSQL联调通过。SDK58/Router资料和替身边界见[设置工程记录](settings-lifecycle.md)，不新增依赖或跨仓源码共享。

2026-11-02，本人动态列表/详情落实焦点代次、账号/权限双向核对、同步锁与结果不明核对；SDK58和Router官方出处、代码落点与测试替身范围见[本人动态生命周期](own-dynamics-lifecycle.md)。没有增加依赖或跨仓库代码共享。

2026-10-31，认证链路采用会话版本、原生存储串行队列、共享 refresh 与按操作归属的用户状态，实际位置、官方 SDK 58 依据及设备验证边界见 [认证并发与隔离](session-isolation.md)。

2026-10-31，AI 列表落实焦点清理、账号查询隔离、同步写锁与未知结果核对；SDK 58 和 Router 官方资料及测试边界见 [会话列表工程说明](ai-conversation-list.md)。协议继续为 OpenAPI 1.44.0，没有新增依赖。

- Expo Router 导航装配位于 `app/_layout.tsx` 与 `app/(tabs)/`；雪场列表/详情已接入 API，动态/知识与 AI 会话页面已接 API，尚未完成逐屏原生交互、可访问性和安全区验收。
- 集中式请求 envelope/字段错误/traceId 处理和受限 API URL 校验在 `src/platform/api/`；access JWT 仅驻内存、401 自动刷新，原生 refresh token 由 Expo SecureStore 保存；Web 通过 HttpOnly Cookie、CSRF 和 credentials: include，平台适配位于 `src/platform/auth/`，不会将浏览器 refresh token 写入 SecureStore。
- Backend OpenAPI `1.51.1` 快照锁于 `contracts/openapi.json`，SHA-256 记录在 `contracts/openapi.lock.json`，生成类型位于 `src/platform/api/openapi.ts`。

## 2026-10-29 SDK 兼容补丁核对

补充查阅 [Expo SDK 58 官方文档](https://docs.expo.dev/versions/v58.0.0/)（2026-10-29，HTTP 200）。本轮 Expo Doctor 报告 react-native 期望 0.88.1、实际 0.88.0，因此使用 `pnpm exec expo install react-native @react-native/metro-config@0.88.1 --pnpm` 对齐两个补丁，实际版本记录于本仓 package.json 和 pnpm-lock.yaml；没有变更 SDK 主版本或排除 Doctor 检查。该官方资料是补充核对来源，不冒充新增 skills.sh Skill。

`pnpm peers check` 另发现既有工具链声明冲突：openapi-typescript 7.13.0 的 TypeScript peer 要求 ^5.x，而项目使用 6.0.3；类型生成、校验和业务类型检查当前通过。没有用 overrides 或忽略规则伪造依赖兼容；上游 peer 声明兼容仍需跟进。

登录/注册表单、输入校验、启动会话恢复/重试/退出及 SecureStore refresh token 流程已建立；注册成功不自动登录，游客可继续浏览。业务页面已有 query/mutation；AI 流复用凭证刷新，完整回复确认后在组件状态保留并刷新服务端历史，失败由用户以相同幂等键重试。2026-10-31 的焦点清理、消息 ID 核对及官方资料见 [AI 生命周期](ai-conversation-lifecycle.md)。尚无离线策略与真实设备/API 端到端验收。类型生成和 bundle 导出不代表业务页面或 API 集成已完成。

## 当前验证范围

本仓产品代码保持；1217项业务测试、Doctor20/20、三平台导出和88文件产物迁移检查见[工程证据](../validation/owned-asset-access-20261104.json)。本轮补齐的后端全业务数据库回归见[回归证据](../validation/full-database-regression-20261104.json)，按源码指纹关联，未把历史测试累计为本轮新增。实际iOS/Android设备、SecureStore行为、签名安装包、浏览器与生产服务仍需分别验收。
