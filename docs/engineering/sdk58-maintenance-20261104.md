# SDK 58 兼容版本维护

维护：App。日期：2026-11-04。本轮独立源码副本的 lint、TypeScript、1217 项业务、20 项源码工具和 10 项产物工具均通过，但 Expo Doctor 实际返回 19/20：官方在线 SDK 58 基线要求更新六个包。保留该失败记录，不通过排除包、关闭联网或跳过 Doctor 规避检查。

先核对本仓 Expo 主版本仍为 58，并查阅 [SDK 58 官方文档](https://docs.expo.dev/versions/v58.0.0/)、[官方文档索引](https://docs.expo.dev/llms.txt)及[升级与依赖校验说明](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)，查阅日期 2026-11-04。使用本地 Expo CLI 和 pnpm 对齐 Doctor 明确报告的六个版本，不跨 SDK 主版本：

| 包                             | 原锁定版本 | Doctor 要求 |
| ------------------------------ | ---------- | ----------- |
| expo                           | 58.0.22    | ~58.0.23    |
| expo-constants                 | 58.0.14    | ~58.0.15    |
| expo-linking                   | 58.0.15    | ~58.0.16    |
| expo-router                    | 58.0.29    | ~58.0.30    |
| expo-splash-screen             | 58.0.12    | ~58.0.13    |
| react-native-safe-area-context | 5.10.1     | ~5.11.1     |

```powershell
pnpm exec expo install expo@~58.0.23 expo-constants@~58.0.15 expo-linking@~58.0.16 expo-router@~58.0.30 expo-splash-screen@~58.0.13 react-native-safe-area-context@~5.11.1 --pnpm
```

实际安装版本及传递依赖以本仓 `pnpm-lock.yaml` 为准。维护 package.json 与锁文件，不修改业务 API、生成的 OpenAPI 类型、路由、凭证协议或原生目录。依赖代码可能影响运行时，须重新冻结安装、完整检查、Doctor、iOS/Android/Web 导出及产物校验；实际设备和原生签名包仍需单独验收。此说明不把仅构建通过视作原生运行通过。

最终验证结果随[本轮配套报告](../validation/native-storage-20261104.json)归档；同一轮中已通过的 Backend/Web 验收不重复累计。

安装同时更新了本仓pnpm-workspace.yaml既有依赖发布时间策略中的具体版本例外；没有新增跨仓workspace或全局关闭检查。旧openapi-typescript7.13.0与TypeScript6.0.3的peer声明差异仍在，pnpm peers check日志保留，实际生成类型和完整检查通过不等同于上游已声明兼容。镜像缺新包404后在同一副本/store使用官方源恢复。

本轮最终独立副本完整check、Doctor20/20、三平台导出及产物迁移核对通过；锁定版本和全部安装/失败/恢复证据见本仓配套报告。未执行原生签名/设备运行，不将依赖对齐视为设备兼容验收完成。
