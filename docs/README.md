# App 文档索引

## 当前教程入口（2026-11-12）

- [三仓协作与技术学习路线](guide/learning-roadmap.md)
- [本地开发教程](guide/development.md)
- [部署与发布教程](guide/deployment.md)
- [公开仓库与 SDK / 凭证边界](guide/repository-security.md)
- [文章图片不设固定数量上限](engineering/article-images-20261112.md)
- [SDK 58 补丁与首次公开仓库 CI](engineering/sdk58-maintenance-20261112.md)

以下为历次工程与验收记录，状态按各自日期理解。


- [2026-11-06 原生按压与键盘焦点反馈](engineering/community-ui-feedback-20261106.md)：1260项测试通过，未打新APK，真机待验。

- [2026-11-06 最新APK1.0.2与富文本交付](engineering/markdown-release-20261106.md)、[报告](validation/markdown-release-20261106.json)：已签名，公网下载哈希核验通过，连接更新后线上API，同证书可覆盖旧包，真机仍待验。

- [2026-11-06 Tiptap / Markdown](engineering/markdown-editor.md) - local scope and [validation](validation/markdown-20261106.json).

- [最新蓝色与红黄橙主题 APK 交付](engineering/dopamine-release.md)：1.0.1 / versionCode 2，签名与公开下载哈希通过；物理真机待验。
- [本轮主题、构建及下载验证报告](validation/dopamine-release-20261105.json)
- [此前冰蓝/白主题验证](validation/ice-theme-20261105.json)：历史阶段记录，已由上述版本替代。

- [2026-11-05 UI 验证结果](validation/project-ui-20261105.json)
- [App UI 规范](../DESIGN.md)
- [App UI 优化与验证](engineering/project-ui-system.md)

- [2026-11-05线上API与APK构建](engineering/server-apk-delivery.md)：连接线上HTTPS API的独立arm64测试APK已签名、校验并交付，物理真机安装尚未验收。

2026-11-05 收尾：五项闭环实现已交付。Backend1494单测/177框架HTTP/865真实DB、8项真实服务场景通过；Web3062业务测试及双生产构建通过；App1238测试、三平台导出及4项Android实操通过。完整浏览器、iOS/真机与新增依赖真实Kafka仍待验；构建和API测试不代替完整三端点击验收。 详见[本轮报告](validation/business-closure-20261105.json)。

- [2026-11-05 业务闭环工程说明](engineering/business-closure.md)
- [本轮验收报告](validation/business-closure-20261105.json)

维护：本仓库维护者。核对：2026-11-04。[独立启动与检查](../README.md)。工程说明通常记录指定日期的专项，旧版本/计数适用于当时范围；当前产品结果以README和对应验收报告为准。

## 工程与专项

- [AI 对话生命周期与确认消息](engineering/ai-conversation-lifecycle.md)
- [AI 会话列表工作流](engineering/ai-conversation-list.md)
- [AI 会话接入](engineering/ai-conversations.md)
- [AI 会话列表跨页面核对恢复](engineering/ai-list-recovery.md)
- [AI 原请求跨页面恢复](engineering/ai-runtime-recovery.md)
- [AI 会话、焦点与流式回答边界](engineering/ai-session-lifecycle.md)
- [D-36 文章收藏](engineering/article-favorites.md)
- [文章详情收藏生命周期](engineering/article-lifecycle.md)
- [登录与注册页面生命周期](engineering/auth-form-lifecycle.md)
- [社区阅读、账号隔离与操作核对](engineering/community-recovery.md)
- [社区动态的会话与焦点隔离](engineering/community-session-lifecycle.md)
- [工作台契约同步与本轮依赖验证](engineering/dashboard-contract-sync.md)
- [动态发布、雪场关联与预览](engineering/dynamic-composer.md)
- [Expo Web Cookie/CSRF 认证适配](engineering/expo-web-auth.md)
- [Expo 导出产物归档与独立校验](engineering/export-artifact.md)
- [收藏跨页面恢复](engineering/favorite-runtime-recovery.md)
- [收藏与账号设置](engineering/favorites-and-settings.md)
- [收藏列表与雪场详情的状态核对](engineering/favorites-lifecycle.md)
- [独立安装与三平台导出](engineering/independent-start-validation.md)
- [知识列表会话隔离与真实 HTTP 验收](engineering/knowledge-list-lifecycle.md)
- [登录限流反馈](engineering/login-rate-limit.md)
- [Expo 原生构建与发布配置](engineering/native-release.md)
- [本人动态页面生命周期与删除恢复](engineering/own-dynamics-lifecycle.md)
- [我的动态（D-03）](engineering/own-dynamics.md)
- [D-30 编辑本人资料](engineering/own-profile.md)
- [个人中心入口与资料刷新](engineering/profile-home-lifecycle.md)
- [本人资料编辑生命周期](engineering/profile-lifecycle.md)
- [Expo 知识目录的分页与会话隔离](engineering/public-knowledge-directory.md)
- [Expo 雪场组合筛选](engineering/resort-directory.md)
- [雪场列表与收藏状态核对](engineering/resort-list-lifecycle.md)
- [App 路由错误与未找到页面恢复](engineering/route-error-recovery.md)
- [SDK 58 兼容版本维护](engineering/sdk58-maintenance-20261104.md)
- [App 认证并发与账号隔离](engineering/session-isolation.md)
- [账号设置与自助改密生命周期](engineering/settings-lifecycle.md)
- [App 工程实践来源](engineering/skills-practices.md)
- [独立源码导出与冷安装](engineering/source-export.md)
- [平台介绍、隐私政策与用户协议](engineering/system-config.md)

## 历史快照

- [历史快照：app/README.md](history/README-20261104.md)

## RAG回填专项

- [真实回填与三仓工程报告](validation/rag-backfill-cli-20261104.json)

## Android原生模拟器专项

- [11项真实原生流程及三仓工程报告](validation/android-emulator-20261104.json)

- [Android模拟器复现、失败记录与边界](engineering/android-emulator-validation.md)

## SDK58原生图片上传修复

- [真实头像上传与三仓复验](validation/native-upload-20261104.json)

- [原生multipart缺陷、修复与未验范围](engineering/native-upload-validation.md)

## 当前验收入口

- [五类公开来源真实消息/模型与三仓工程报告](validation/five-source-kafka-rag-20261104.json)

- [最近产品验收报告](validation/admin-asset-read-authorization-20261104.json)
- [本轮文档整理核对](validation/document-lifecycle-20261104.json)

validation中的其他日期报告和外部冻结目录是原始阶段证据；不得覆盖旧报告冒充复验。发布、上传及远程CI状态见独立README。
