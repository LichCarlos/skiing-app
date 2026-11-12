# Expo 导出产物归档与独立校验

2026-11-03 项目知识与事件运维联调：配套复验见[本仓摘要](../validation/content-events-http-20261103.json)，D:/linji-content-http/20261103/app-export的88文件已封存并迁移核对，保持契约1.51.1；不包含签名原生包或自包含Web运行环境。

2026-11-03 RAG来源真实HTTP续验：本轮保持契约1.51.1，在D:/linji-rag-http/20261103/app-export重新导出、封存并迁移校验88文件通过；见[本轮摘要](../validation/rag-source-http-20261103.json)。没有App业务改动，签名原生包和自包含Web服务器不在产物范围。

2026-11-03 RAG来源读取与命令核对续验配套：当前D-52同步后的契约为1.51.1，三平台导出、88文件封存与迁移后核对通过，见[最新验证](../validation/rag-source-lifecycle-20261103.json)。以下1.50.2/1.51.0摘要保留为历史阶段。此产物仍不包含签名原生包或独立Web服务器。

负责人：App。状态：工具、CI归档配置与本地验证结果见[首轮摘要（契约1.50.2）](../validation/export-artifact-20261103.json)；D-51后的最新1.51.0产物见[后续验证](../validation/login-limit-20261103.json)。这是iOS/Android bundle及Web导出文件的交付，不是APK、AAB或IPA签名包，也不包含Web服务器运行环境。

## 当前交付结构

独立App CI在冻结安装、完整check、原生发布配置检查和OpenAPI生成核对后执行三平台export。新增 `artifact:seal` 生成逐文件字节数/SHA-256、库存摘要、OpenAPI版本/摘要、依赖锁文件摘要、实际Expo与Node版本，并附上无第三方依赖的 `verify-export.ts`。`artifact:verify` 完成核对后，CI通过upload-artifact保存 `linji-expo-bundle-export`，保留7天；启用include-hidden-files以保持完整文件集合。远程runner尚未执行，本地配置和导出验证不计为CI远程绿灯。

产物包含原始metadata、原生Hermes bundle与资源、Web client/server及两份交付文件。工具验证原生平台和资源引用、SSR渲染文件、Web全局/页面JS与CSS、可选favicon。Windows元数据的反斜线引用转换为清单使用的正斜线。仅支持当前SDK58、Metro metadata版本0、server输出且无Web API路由的项目结构；以后改变这些配置时需一起更新验证器。

## 独立操作

在本仓根目录，按README完成环境配置和冻结安装；导出到新的绝对目录：

```powershell
pnpm exec expo export --platform all --output-dir D:/linji-artifact/export
pnpm artifact:seal D:/linji-artifact/export
pnpm artifact:verify D:/linji-artifact/export <可信Backend发布的OpenAPI-SHA256>
```

seal拒绝覆盖已有清单或校验器；导出内容变化时重新生成一个新目录，不能对已封存目录重复seal。seal读取本仓安装的Expo版本、锁文件及OpenAPI快照/lock，先核对引用与契约一致性，再写交付清单。

下载或复制后只需要Node 22.16.0，无需原源码、Expo、pnpm、node_modules或其他两个仓库。进入产物目录后运行：

```powershell
node --experimental-strip-types ./verify-export.ts verify D:/download/linji-export <可信Backend发布的OpenAPI-SHA256>
```

verify为只读，检查文件集合、字节数、摘要及元数据中的显式引用，拒绝新增、缺失、损坏、重复/越界路径和符号链接。拒绝根node_modules、.git及.env文件；允许Expo静态资源路径中的client/assets/node_modules/.pnpm，它们是导出资源。工具不解析所有JS/CSS的传递依赖，也不验证运行环境。可选的契约摘要参数必须来自可信发布记录；未传时只核对产物自身记录。摘要提供完整性校验，不提供发布者签名。校验通过也不等于实际运行成功。

原生安装与商店发布继续使用[独立EAS流程](native-release.md)，需要真实项目身份和签名；当前工具不调用EAS、不上传源码、不发布应用。Web server导出仍需匹配的Expo托管/服务器适配器和运行环境，不能将整个目录当作纯静态站点。

## 验证与依据

`pnpm test:export-artifact` 为10项独立Node CLI黑盒测试，已加入check：验证二进制和Windows引用、无源码/依赖的迁移校验、篡改/缺失/额外文件、可信契约不匹配、禁止覆盖、原生/SSR/Web资源缺失、跨平台/路径穿越、源目录/环境/依赖混入、链接、伪造清单及SDK/契约不匹配。测试仅清理经路径校验的自建临时夹具。本轮还将Node CLI测试加入EAS忽略规则，由现有上传排除测试核对。

查阅日期2026-11-03：已读取本仓Expo `~58.0.22`，核对[SDK58版本文档](https://docs.expo.dev/versions/v58.0.0/)、[Expo文档索引](https://docs.expo.dev/llms.txt)、[Expo CLI导出说明](https://docs.expo.dev/more/expo-cli.md)与[Web发布说明](https://docs.expo.dev/deploy/web.md)。具体metadata/routes形状还以本仓Expo58.0.22实际导出结果验证；未把内部文件格式视为跨SDK稳定API。没有新增运行时依赖或修改Expo业务/原生API。
