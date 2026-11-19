# App 构建、签名、交付与回滚

本仓包含原生构建配置与 JS bundle 导出工具。空白电脑先按[工具下载、真实 EAS 项目绑定、环境变量与 APK 构建](from-zero.md)操作，不需要作者私有 runtime 脚本。2026-11-19 已构建 1.0.4 / versionCode 5 ARM64 APK，模拟器检查通过，实体手机由用户安装测试；2026-11-12“仅源码”说明只属于历史批次。当前没有商店发布结论。

## 1. 区分交付物

| 交付物                 | 命令/方式               | 能证明什么                                   |
| ---------------------- | ----------------------- | -------------------------------------------- |
| JS/assets bundle       | expo export             | 打包资源与 JS 可生成，不包含原生签名安装验证 |
| Android preview APK    | EAS preview             | 可安装包，仍需真实设备安装与业务验收         |
| Android production AAB | EAS production          | 商店上传材料，需审核与分发                   |
| iOS build              | EAS production/internal | 需 Apple 身份、签名/设备或商店渠道           |

当前没有 OTA/自动商店提交配置；不能用一次源码 push 代替原生发布。

## 2. 绑定真实应用身份

由应用所有者准备 Expo 账号/组织、EAS 项目、Android application ID、iOS bundle identifier、HTTPS API 与签名。preview/production 环境均需提供：

| 变量                        | 含义                                       |
| --------------------------- | ------------------------------------------ |
| LINJI_APP_ENV               | preview 或 production；eas.json 按档位设置 |
| LINJI_ANDROID_PACKAGE       | 已登记的多段 Android 包名                  |
| LINJI_IOS_BUNDLE_IDENTIFIER | 与 Apple 签名/登记一致的标识               |
| LINJI_EAS_PROJECT_ID        | 当前应用真实 EAS UUID                      |
| LINJI_EXPO_OWNER            | 项目所属 Expo 用户/组织                    |
| EXPO_PUBLIC_API_BASE_URL    | 设备可达 HTTPS API，不能是 localhost       |

应用身份是可公开配置，放在对应 EAS environment 且须能在动态配置解析时读取。签名、平台登录、后端 Key 是另一类私密材料；不放进 EXPO_PUBLIC_* 或 Git。eas.json 的 `environment` 选择对应环境，先确认账号对实际项目有权限，不要把 CI 里的虚构身份当生产配置。

## 3. 本地预检查与源码上传边界

```bash
pnpm install --frozen-lockfile
pnpm check
# 在已提供真实身份变量的环境设置 LINJI_APP_ENV 后运行
pnpm release:check
```

PowerShell 可用 `$env:LINJI_APP_ENV='preview'`；Bash 用 `export LINJI_APP_ENV=preview`，production 同理。release:check 本身不读取 .env，全部身份变量都须进入当前进程，完整赋值示例见从零手册。检查器调用 Expo config introspect 验证身份、HTTPS URL、SecureStore 备份规则和契约；不会构建、上传或替用户创建 EAS 项目。

`.easignore` 存在时不再自动使用 `.gitignore`，两处需同步维护 SDK/签名/私有文件排除。上传前检查 EAS 源码 archive 内容，确保没有 SDK、node_modules、.env、keystore、模型、日志和历史构建产物；必要业务资源、配置、发布检查脚本和锁文件必须保留。

## 4. 云构建

先通过官方 EAS CLI 完成账号登录与项目归属核对，在本仓根执行：

```bash
npx eas-cli@27.10.0 build --profile preview --platform android
npx eas-cli@27.10.0 build --profile production --platform all
```

preview 为 internal，Android 输出 APK；production 为 store，Android 输出 AAB。production 使用 remote app version 与 autoIncrement，构建前核对当前版本，不能覆盖身份/签名。iOS 构建需要正确 Apple 签名与渠道配置。云构建可能消耗账号额度/产生费用，按自己的发布授权执行。

当前 `eas-build-post-install` 会再次运行 release:check，配置不完整会阻断。不要通过写占位值绕过发布校验。所有原生行为改动应使用匹配依赖的原生包，不能把旧安装包与新 JS 任意组合。

## 5. 签名与安装包保管

Android 的更新必须保持应用 ID 和签名连续，versionCode 按发布规则递增；iOS 同样需匹配 Bundle ID、团队和签名。Android keystore/密码、Apple 私钥/证书/描述文件保存到受控凭证管理与安全备份，仓库仅保留配置结构。

交付记录应包括源码提交号、契约版本/SHA、构建环境/档位、应用 ID、版本/versionCode、包摘要、签名证书公开指纹、分发 URL 和验收设备。不公开签名私钥或密码。APK/AAB/IPA 存专门分发/制品系统，不放 Git 源码历史。

## 6. 设备与上线验收

1. 在目标 Android/iOS 安装包核对身份、签名、版本和 HTTPS API。
2. 测冷启动、登录恢复、退出/切号、后台恢复及失效凭证，确保跨账号数据隔离。
3. 测雪场/知识详情、收藏、资料与头像、相册授权、多图上传、编辑/再次进入。
4. 测 AI SSE、取消/重试、历史、引用与弱网，记录是否真实模型/是否产生写入。
5. 测键盘、安全区、返回、权限拒绝、低内存及支持的系统版本。
6. 验证 Android SecureStore 备份排除与 iOS Keychain 行为；Web 不代替原生验证。

确认结果后按渠道灰度/测试分发，再执行独立的商店提交流程。当前 CI 只导出 bundle 与配置检查，不登录 EAS、自动签名或提交商店。

## 7. 更新与回退

API 先保持旧客户端兼容，再发布新包；用户不会同时升级。破坏性契约需过渡期，不能部署 API 后只在最新模拟器上验证。保留上个可用安装包、签名连续性和版本记录。

商店通常要求更高构建号的修复版；回退代码也要遵守平台版本和签名规则，不能假定设备允许直接降级。后端与数据库回滚是另一套流程。未来若引入 OTA，需先设计原生 runtime 兼容、签名、渠道、灰度与回滚，当前不宣称支持。

## 8. JS 导出归档

```bash
pnpm exec expo export --platform all
pnpm artifact:seal <新导出目录>
pnpm artifact:verify <新导出目录>
```

目录占位符替换为真实导出路径（默认 dist）。封装清单核对文件摘要与契约，导出不含原生安装包；源码另用 `pnpm source:export <新目录>`，两类归档不能混淆。工具和原生配置细节见[既有原生发布说明](../engineering/native-release.md)与[SDK58维护](../engineering/sdk58-maintenance-20261104.md)。

## 2026-11-19 本机目录约定

本机安装包位于 app/outputs/apk/（相对三仓父目录）。构建副本、专属缓存和新日志统一放父目录 runtime/builds/app/，新入口为该目录的 build-apk.ps1，可先用 -Plan 查看路径。通过临时盘符映射缩短 Windows 编译路径，结束后自动解除，禁止在 D 盘根创建实体构建目录。迁移后的旧原生缓存只作归档；新入口已用于 1.0.4 release 全量构建。Windows 原生项目、代码生成及 Hermes 路径统一、编译并发限制与验收说明见[圆角导航更新](../engineering/rounded-tabbar-20261119.md)。
