# 原生交互反馈优化 · 2026-11-06

## 已实现

通用 `src/components/controls.tsx` 的 Pressable 增加主题化 Android 原生 ripple、按压透明度反馈和键盘焦点描边。保留所有调用方 onPress/onFocus/onBlur、ref、布局、变换、自定义 ripple 与可访问状态；空闲时不再强制 opacity=1 覆盖调用方的透明度。禁用态继续最优先，最小触控高度44。

`control-feedback.ts` 是可测试的纯样式策略。没有新增包装 View、动画计时器、JS/GPU循环、平台检测依赖或第三方原生模块；不将网页 React Bits Canvas/WebGL 直接塞入 Android/iOS。即时按压反馈不含位移和循环动画，不依赖减少动画设置才能安全使用。

这只是交互反馈层，不改变认证、权限、网络调用、AI流式输出、收藏写入和成功判定。Android ripple 使用 RN 标准 android_ripple prop，非Android由平台按标准忽略，调用方传入值保持优先。

## 验证

- TypeScript 通过；Oxlint **0警告、0错误**。
- 全量 **1260 项 / 78 文件**测试通过，含本轮4项纯策略测试及2项 RN 静态替代下的控件集成测试。
- 首次新增 Platform 检测导致既有 RN 静态 mock 缺少导出，97项失败；移除不必要检测后全量通过，没有弱化原有测试。
- 官方 SDK58 文档页面本次请求403；补读官方 Expo 仓库 Reanimated 文档及当前安装的 RN0.88.1 Pressable 源码。最终只用已安装 RN Pressable 标准能力，未新增 Expo API 或 Reanimated 实现。
- 未运行 Expo Web、新 Android/iOS 导出、APK打包、真机或模拟器交互；静态测试不等于原生画面验收。

## 待验与回退

Android真机重点检查 ripple 不遮挡文案、禁用不触发操作、列表按压/长按不冲突；Expo Web验证键盘焦点；iOS检查透明度、主题和VoiceOver。若反馈不合适，仅回退这两个控件层文件的本轮增量，不修改业务页面和会话状态。没有服务器部署、线上数据变更或新APK，本轮代码尚不包含在此前1.0.2下载包中。
