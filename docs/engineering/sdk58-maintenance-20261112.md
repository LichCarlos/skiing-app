# SDK 58 补丁依赖与首次公开仓库 CI

日期：2026-11-12。本轮公开仓库的在线 Expo Doctor 报告 SDK 58 补丁版本需要更新。使用匹配的 [SDK 58 文档](https://docs.expo.dev/versions/v58.0.0/)、[StatusBar 文档](https://docs.expo.dev/versions/v58.0.0/sdk/status-bar/)和本地 Expo CLI 对齐依赖，没有跨 SDK 主版本。

| 包 | 原版本 | 当前版本 |
| --- | --- | --- |
| expo | 58.0.23 | 58.0.24 |
| expo-constants | 58.0.15 | 58.0.16 |
| expo-font | 58.0.11 | 58.0.12 |
| expo-linking | 58.0.16 | 58.0.17 |
| expo-router | 58.0.30 | 58.0.31 |
| expo-secure-store | 58.0.2 | 58.0.3 |
| expo-splash-screen | 58.0.13 | 58.0.14 |
| expo-status-bar | 58.0.4 | 58.0.5 |
| expo-symbols | 58.0.4 | 58.0.5 |
| expo-web-browser | 58.0.7 | 58.0.8 |

```bash
pnpm exec expo install expo@~58.0.24 --pnpm
pnpm exec expo install expo-constants@~58.0.16 expo-font@~58.0.12 expo-linking@~58.0.17 expo-router@~58.0.31 expo-secure-store@~58.0.3 expo-splash-screen@~58.0.14 expo-status-bar@~58.0.5 expo-symbols@~58.0.5 expo-web-browser@~58.0.8 --pnpm
pnpm install --frozen-lockfile
pnpm check
pnpm exec expo export --platform all
pnpm artifact:seal dist
pnpm artifact:verify dist
```

动态 app.config.ts 无法由安装器自动写入插件，按 CLI 提示在 app.json 原有 plugins 中显式加入 expo-status-bar，供动态配置继承。package.json、锁文件和既有依赖发布时间策略的具体版本例外一起维护；不关闭依赖或联网检查。

本地冻结安装、契约、lint、类型检查、1263 项业务测试、20 项源码工具测试和 10 项产物工具测试通过。Doctor 的依赖版本校验通过；本地两次完整联网检查分别遇到 React Native Directory 服务异常和 Expo API 超时，保留失败日志。最终完整联网检查与三平台导出结果以当前提交的 [GitHub Actions](https://github.com/LichCarlos/skiing-app/actions) 为准，交付记录另存本机资料索引。

本轮只交付源码和 JS/assets 导出，不构建新的 APK/AAB/IPA，不进行商店发布或原生设备验收。此前已安装的 APK 不会随 GitHub 推送更新。补丁依赖仍可能影响原生运行，发布安装包前按[部署教程](../guide/deployment.md)重新构建和验收。
