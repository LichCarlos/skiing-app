# 移动端界面规范

按最新要求，品牌以电光蓝 `#2455F5` 为主体，搭配红 `#DC2F43`、亮黄 `#EFFF46`、橙 `#FF9A3C` 的多巴胺撞色。浅蓝 `#EEF7FF` 与白色承担正文、表单和表格背景，深蓝 `#17264C` 用于文字。鲜艳底色必须配套对应前景色；不使用紫色品牌色。

## 唯一主题入口

`src/theme/index.ts` 定义 light/dark 语义颜色、间距、圆角与文字层级；旧 `constants/Colors.ts` 作为兼容入口转发同一主题。页面通过 `createThemedStyles` 获取随外观更新的样式，不再分别维护颜色表。细部图片尺寸与页面布局仍由所属页面维护。

`components/Themed.tsx` 为正文提供基础字号、行高和主题文字颜色。原生端跟随系统，Web 在 SSR 首帧保持一致，水合后响应浏览器深浅色变化。

## 共享组件

- `src/components/controls.tsx`：Pressable 保留原生事件与调用方布局，统一最小触控高度、按下和禁用反馈、无障碍状态；TextInput 统一可读字号、焦点、禁用及主题颜色，并保留原生 ref。
- `src/components/empty-state.tsx`：标题、说明与可选操作组成的真实空状态，屏幕可读区域保持居中。
- AI 与“我的动态”保留业务专属组件，通过主题 hook 接入共享颜色。聊天正文与用户提问用不同底色和缩进区分。

## 页面与状态

覆盖动态列表/详情/发布、雪场列表/筛选/详情、知识列表/详情、收藏、本人动态、登录注册、个人资料、密码设置、平台政策、公开字段查询及 AI 会话。保留既有权限、生命周期、会话隔离与请求幂等规则。

表单优先使用 minHeight，支持文字缩放；分类和状态通过文字与选中状态共同表达。手机触控高度至少 44px，按钮不以纯颜色区别状态。导航保留原生路由与安全区，避免重复页面标题。底部标签的行高与不可压缩文本避免中文被裁切。

## SDK 58 Web 文档

`app/+html.tsx` 必须完整注入 `useServerDocumentContext` 提供的 headNodes、bodyNodes 和属性。缺少这些内容会导致 SSR 没有样式或无法水合；回归测试位于 `src/platform/navigation/html-document.test.tsx`。

界面优化不会自动更新已有 APK。原生三平台导出及 Expo Web 检查的证据、边界见 `docs/engineering/project-ui-system.md`。
