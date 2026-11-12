# 社区排版编辑与 Markdown 阅读

2026-11-06，本地源码完成，没有新APK或线上更新。

## 使用方式

短动态默认直接输入，长故事可点击开启排版，显式转换后预览。主要关联雪场仍在原选择区管理，不由正文提及决定。

- Expo Web：Tiptap3.33.0、表格、工具栏、MD导入导出、源文及链接；图片选择后先点“上传以插入正文”，再点编辑器对应图片按钮。
- Android/iOS：原生TextInput/工具栏，不运行DOM或WebView。支持标题、强调、列表、引用、链接、已上传图片插入和预览；复杂表格编排请使用Web。首期无原生文件导入导出。
- 三平台读端：unified+remark-parse+remark-gfm AST，渲染为RN组件。正文图片使用授权Asset URL映射，article:ID/resort:ID使用Expo Router；外链仅HTTP(S)。
- 图片最多9张，正文10000字符；正文图片必须仍在相册ID列表。移除正在使用的图片前先删除正文引用。
- 新稿和改稿沿用原审核规则，版本冲突/断网使用原核对流程；没有自动保存与服务端故事草稿。

## 内容协议与独立仓库

plain_text旧内容保持原样；markdown_v1是显式版本。持久化asset:ID，不保存短期签名URL；读取过期需刷新详情。逻辑链接是手动稳定ID引用，没有实现#搜索、提及关系表或自动卡片。

依赖通过expo install安装；Tiptap与remark系包为MIT；锁文件/本仓OpenAPI1.53.0及生成类型已同步。Web-only Tiptap组件通过.web.tsx隔离，原生导出不包含其DOM实现。独立仓库不直接引用web或backend源码。

## 验证与待验

lint零警告、typecheck、1254测试、Android/iOS/Web导出通过。新增协议/组件替身/ExpoWeb编辑Schema往返测试，不是原生设备操作证明。

Expo Web开发服务启动受到本轮执行策略阻止，没有用其他命令绕过；社区浏览器点击未完成。Android/iOS中文输入法、选择/撤销、上传、深链和表格触控必须分别真机验收，APK也需另外构建；本轮export不能当作安装包。

[记录](../validation/markdown-20261106.json)。运行 `pnpm lint; pnpm typecheck; pnpm test; pnpm openapi:verify`；通过已验证SDK58导出命令 `pnpm exec expo export --platform all --max-workers 2 --output-dir dist-markdown-validation` 检查打包。首次本轮曾因并发改文件导致Metro快照缺文件，清缓存并重导成功。
