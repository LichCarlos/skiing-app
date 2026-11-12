# 独立安装与三平台导出

2026-11-02，在无原 node_modules、.expo、dist、.env 或父目录依赖的独立源码副本中，以独立新 store 冻结安装。运行时清空 NODE_PATH/NODE_OPTIONS；Expo、React Native、TypeScript 模块 realpath 均位于副本自身 node_modules。

结果：Node v22.16.0/pnpm 11.25.0、Expo 58.0.22；完整 check 通过，包括 OpenAPI 校验、lint 零警告、typecheck、35 文件 635 项测试、Doctor 20/20；iOS/Android/Web 三平台导出通过。没有借用原 .expo 类型目录，未发现冷安装额外类型生成依赖。

按本仓 [README](../../README.md) 配置工具和 API 地址后可独立执行：

```powershell
pnpm install --frozen-lockfile --store-dir D:/linji-validation-store/app
pnpm check
pnpm exec expo export --platform all --output-dir dist/isolated-start-validation
```

三平台 bundle 不等于原生安装包、设备测试或 Web 浏览器运行。项目 web.output=server，本轮没有运行导出后的 Web 服务。Expo Web Cookie/CSRF 与 SecureStore 平台差异已有待确认方案，本轮没有擅自实现；原生 refresh 仍由 SecureStore 管理，access 仅内存。后台、数据库及模型均由 Backend 提供，App 没有引入其代码或连接。

产品源码、依赖和 OpenAPI 未变，只补充验收记录与产物忽略规则。本轮原始日志为本地忽略的 `isolated-start-install.log` 和 `isolated-start-check-build.log`；完整原生存储、设备、供应商以及发布验收仍待完成。
