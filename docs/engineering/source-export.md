# 独立源码导出与冷安装

2026-11-03 已在 `D:/linji-source-export/20261103/run-01/app` 完成264文件快照的全新store冻结安装、完整check（66文件1162业务测试及8项导出测试）、Doctor20/20、iOS/Android/Web导出及导出后typecheck。[本仓验证摘要](../validation/source-export-20261103.json)绑定源码清单、模块实际路径与日志摘要；产物保留于 `D:/linji-source-export/20261103/run-01/app-export`，不计作原生安装或浏览器认证验收。

`pnpm source:export <新建绝对目录>` 生成本仓当前源码副本，只需 Node 22 与 Git。目标父目录必须已存在，目标本身不得存在。它不启动 Expo、不访问 Backend 或其他仓库。

```powershell
pnpm test:source-export
pnpm source:export D:/linji-source-validation/app
```

通过 Git 收集本仓跟踪及未忽略的未跟踪文件，保留未提交改动/新增源码，不恢复已删除项。排除 .git、依赖、.expo、dist、原生生成目录、构建/测试产物、日志、环境凭证和本机 Agent 设置；保留 .env.example，拒绝非模板环境文件、私钥及源文件链接。该筛选不是文件内容密钥扫描，也不会保存 Git 历史。

Windows 长路径与目标父目录 junction 在校验前解析，拒绝目标覆盖、源码目录嵌套及链接写回源码。不会删除源文件或失败副本。复制后核对目标字节、重读源文件及文件集合，变化则失败；重试另选新目录。这不能保证并发写入下的原子文件系统快照。

.source-export.json 包含路径、大小、逐文件 SHA-256、包管理器及 OpenAPI 摘要；sourceSha256 为按路径排序后 `sha256<TAB>bytes<TAB>path<LF>` 串的 SHA-256，不记录本机源码绝对路径。按清单可以核对交付副本所含源码，后续安装/导出的额外产物不计入源码摘要。

在副本自身目录，首次使用全新 store 运行：

```powershell
Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue
$env:NODE_OPTIONS='--max-old-space-size=1536'
$env:VITEST_MAX_WORKERS='1'
$env:EXPO_NO_TELEMETRY='1'
pnpm install --frozen-lockfile --store-dir D:/linji-source-validation/stores/app
pnpm check
pnpm exec expo export --platform all --output-dir D:/linji-source-validation/app-export
pnpm typecheck
```

check 已包含八项 Node CLI 黑盒测试，校验字节/清单、未提交文件与删除、过滤、拒绝覆盖/越界、junction 与凭证。测试只删除经路径校验的自建临时 Git 夹具。本轮导出工具只涉及 Node 文件/进程 API，不更改 Expo/React Native 运行时或认证流程。

副本不携带 .expo 类型或原 node_modules；验收记录需核对 Expo/React Native/TypeScript realpath 均位于自身依赖树、store 初始不存在、工具版本和命令退出码。API 地址及 EAS 身份仍按 [README](../../README.md) 配置，不能用虚构验收身份发布。三平台导出不等于原生签名安装包、启动屏、SecureStore、浏览器 Cookie 或设备验收，范围另见 [原生发布准备](native-release.md) 与 [Expo Web 认证](expo-web-auth.md)。

## 接收源码前的独立完整性校验

2026-11-04新增 `pnpm source:verify <源码副本绝对路径> <外部可信SHA-256>`。校验器只使用Node内置模块，不需要Git、依赖、原目录或其他仓库；三个仓库各自维护入口。请先校验完整、尚未安装依赖或写入.env的源码副本，之后再冻结安装。

```powershell
# 在可信的本仓目录执行；摘要从交付方的独立可信渠道取得。
pnpm source:verify D:/delivery/app <sourceSha256>

# 已信任此校验器代码时，可直接用Node运行，无需pnpm安装依赖。
node --experimental-strip-types scripts/export-source.ts --verify D:/delivery/app <sourceSha256>
```

它核对formatVersion、必需文件、严格排序且唯一的相对路径、文件大小/摘要、源清单总摘要、packageName/packageManager及OpenAPI元数据，拒绝链接、越界路径、缺失、增加或修改的文件。校验不执行被校验目录中的产品代码，也不写入或删除文件。所有文件都须列入清单；安装后生成的node_modules、构建产物或.env会导致文件集合检查失败，不能用该命令校验已配置的运行目录。

摘要必须另行保存，不能从收到的待校验清单自动取值；重新计算被篡改清单不能通过原外部摘要。自带脚本不是信任根：收到不可信交付时应先用已信任的本仓校验器，不能先执行对方脚本。该方式校验已知摘要下的完整性，不提供数字签名、发布者认证、内容密钥扫描、原子文件系统快照或实际启动证明。导出快照不含Git历史，交付后是否初始化新Git仓库由接收方决定。

新增12项CLI回归与既有8项导出回归一起纳入 `pnpm test:source-export`/`pnpm check`。CI在本地完成导出、外部记录的摘要核对与tar归档后，配置上传源码及独立摘要元数据；尚未运行远程CI，配置不是已发布证据。

## 2026-11-04 实际源码包与冷安装复验

源码工具现为20项CLI黑盒回归，其中新增12项独立校验；只依赖Node/Git的导出和只依赖Node的校验均通过，包管理器脚本可选使用pnpm。实际源码归档为 `D:/linji-source-verify/20261104/app-source.tar.gz`，独立摘要元数据为同目录 `app-source-metadata.json`。

本仓冻结点：314文件，sourceSha256=`82f7b6b0438359480a5c334b29e0d991ad7beecce8b84924d3bfc21042b78019`，tar.gz SHA-256=`04981d7b031da5c0f778fa1e266f71c26dcbe9b2fdb4638a0693687c67a04f59`。压缩包先验证、解包后再验证，在 `D:/linji-source-verify/20261104/cold/app` 使用首次不存在的独立store冻结安装。模块实际路径与源文件摘要均有记录；未借用父目录或其他仓库代码。归档是本轮代码及预先说明文档的冻结快照，最终README/结果报告在校验后增加，不会回写已封存压缩包。

冷副本完整验证：Backend1271单测+20源码工具、173HTTP框架、build/编译后OpenAPI；Web3045业务+20源码工具+20发布工具、官网/Admin双强制构建（0缓存）及独立包校验；App1217业务+20源码工具+10产物工具、Doctor20/20、三平台导出/导出后类型及88文件封存迁移校验，均通过。外部验收编排首次在Web成功冷安装后从workspace根误定位Next，实际应从apps/web解析；修正后只从模块核对续跑，未重复已通过命令，原记录保留。Web下载警告随日志保留；App首次新store冻结安装因依赖下载超时以1退出，随后在同一专用部分store降低并发为4、下载超时延长至180秒仍反复超时/连接重置，经核对进程身份后中止本次安装；最后以npmmirror、并发2及原锁完整性校验续装通过。未更改锁文件/源码或借用其他依赖；首轮失败、中止及恢复日志均保留，不将前两次安装记为通过。详见[本仓冷验报告](../validation/source-verify-20261104.json)。源码压缩包是验收冻结点的不可变快照，最终结果README/报告在其后归档；已逐文件核对冻结内容与原仓/冷副本匹配，产品源码、依赖和契约一致。三仓OpenAPI1.51.1/143操作和24迁移保持；本轮未修改业务API/数据库，未重跑上一轮845数据库测试。只验证独立安装/构建/导出，不计生产监听、浏览器/设备、真实模型/存储、Kafka/容器或远程CI；CI源码归档/上传仅本地配置。Windows Kafka AccessDenied未解决，35秒用例未运行；D-49/D-50/D-09待决，父目录遗留依赖清理与先前服务启动拒绝未重试，Docker未启动/重启/借用WSL，整体目标未完成。
