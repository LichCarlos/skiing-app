# App 路由错误与未找到页面恢复

根布局改用本仓的 RouteErrorBoundary，替换默认 Expo Router 错误界面；未匹配路由改为中文页面、固定首页链接及 replace 导航。实现位于 src/platform/navigation，app/_layout.tsx 和 app/+not-found.tsx 只保留路由接入。没有新增业务接口、依赖、数据库迁移或认证协议，OpenAPI 仍为 1.50.2 / 143 操作。

## 错误界面

错误界面仅使用 React 与 React Native 基础组件、自带静态颜色及可滚动内容，不读取登录、Query、主题或祖先安全区域上下文，也不尝试在尚未挂载的根导航中跳转。正常的会话恢复、字体加载和根导航逻辑保持原样。错误恢复只提供手动重载及重新打开应用的提示，不展示业务记录或账号信息。

组件不读取、序列化、记录或发送 error/message/stack，也不展示当前路径或查询参数。即使抛出任意对象或带异常 getter 的值，文案仍是固定中文。此约束针对应用新增的兜底界面；框架开发期 LogBox、模块初始化错误、原生崩溃及 React 边界不能捕获的异步事件错误仍需各自处理。

用户点击后才调用本版本 Router 的 retry。同步 ref 抑制同一挂载内的连续点击，按钮显示忙碌/禁用状态；同步抛出与 Promise 拒绝都显示固定恢复提示，允许下一次手动尝试。卸载后忽略迟到结果与旧按钮回调，不自动重试、不重新执行业务写入。

界面提醒用户先核对刚提交的处理结果。路由重新渲染不代表服务器回滚，重挂载可能丢失组件内的未知写入结果锁；本次不提供跨重启台账或补造幂等协议。恢复后仍需通过既有页面只读核对结果，再决定是否提交新操作。

## 未匹配路由与平台边界

404 使用固定“页面未找到”标题和返回 `/` 的 replace 链接，不从未知 URL 拼接返回路径。Link 使用 asChild 包装 Pressable，保留平台导航行为与触控区域。该页面不改变业务详情存在性判断，公开记录的 404 仍由各页面与后端负责。

错误兜底采用独立背景、较大的顶部留白和可滚动布局，以便根 Provider 失效时仍能显示；不同设备刘海、横屏、系统字体放大和焦点行为需真机验证。原生路由未匹配不等同于 HTTP 状态；Web 部署的 404 状态、深链接回退和无障碍树也尚待浏览器验收。

## 版本依据

2026-11-03 查阅 package.json 及实际安装源码：Expo 58.0.22、Expo Router 58.0.29、React Native 0.88.1。按 AGENTS.md 先获取 [SDK 58 文档](https://docs.expo.dev/versions/v58.0.0/)、[文档索引](https://docs.expo.dev/llms.txt)，再阅读 [错误处理](https://docs.expo.dev/router/error-handling/)、[导航](https://docs.expo.dev/router/basics/navigation/) 与 [SDK 58 SplashScreen](https://docs.expo.dev/versions/v58.0.0/sdk/splash-screen/)；下载副本位于 D:/linji-app-recovery/20261103/docs。

本地 expo-router/build/views/Try.d.ts 的 retry 类型为 `() => Promise<void>`；Try.js 在清除错误状态后 resolve，该 Promise 成功不能证明后续页面已正常工作。Try.getDerivedStateFromError 已有隐藏启动屏处理，本次没有重复增加启动屏逻辑。默认 ErrorBoundary.js 会展示 error.message，现由本仓固定文案替换。官方建议启动屏以 release 构建在设备上核对，不能用 Expo Go 或导出代替。

## 验证与复现

在本仓执行 `pnpm exec vitest run src/platform/navigation/route-recovery.test.tsx`：11 项通过，覆盖独立 Provider、敏感信息/异常 getter、禁止自动重试、同步点击门禁、忙碌状态、同步/异步失败、成功后的手动重试、卸载迟到结果、effect 重建及实际未匹配路由出口。该文件位于现有 Vitest 默认发现范围，已随 pnpm check 执行，无需新脚本。

测试通过模拟 React hook 生命周期、React Native 组件、Router 链接与直接调用 press handler 完成同步 SSR/事件验证；没有运行真实 React 错误捕获、原生导航、浏览器、Cookie、设备或启动屏。三端完整安装、检查和构建结果以本阶段交付记录为准，不将导出作为交互验收。

本仓分别执行 pnpm install --frozen-lockfile、pnpm check 和 pnpm exec expo export --platform all --output-dir D:/linji-app-recovery/20261103/app-export，均退出 0。完整检查为 66 文件 / 1162 项、lint 零警告/错误、TypeScript 通过、Doctor 20/20；Android/iOS 为 Hermes bundle，Web 含 client 与 server 导出。日志 app-recovery-install/check/export.log 保留，没有启动 Expo 开发服务或发布应用。
