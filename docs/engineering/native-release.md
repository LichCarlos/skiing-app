# Expo 原生构建与发布配置

核对日期：2026-11-02；Expo SDK 58，Node 22.16.0，pnpm 11.25.0。本仓库独立安装、导出和构建，仍只通过 Backend API 获取业务数据。原生 refresh 由 SecureStore 保存，access 仅在内存；Expo Web 沿用 Cookie/CSRF 平台适配。

2026-11-04补充：[Android原生模拟器11项验收](android-emulator-validation.md)已通过SecureStore冷恢复/退出与真实AI等流程；本文后部2026-11-02的“设备未验”为历史状态。真机、iOS、备份恢复和独立签名包仍待验。

## 配置与构建档位

`app.json` 保存基础配置与插件；`app.config.ts` 按环境绑定项目身份及 API 地址；`eas.json` 定义原生构建档位。未生成或手改 `android/`、`ios/` 工程。配置和脚本均使用 TypeScript，无新增依赖。

| 档位       | 环境             | Android              | iOS                                 | 版本管理                  |
| ---------- | ---------------- | -------------------- | ----------------------------------- | ------------------------- |
| 本地开发   | 默认 development | Expo Go/现有开发方式 | Expo Go/现有开发方式                | app.json                  |
| preview    | preview          | internal APK         | internal 分发，需有效签名及设备配置 | EAS remote                |
| production | production       | store AAB            | store 构建，需有效签名              | EAS remote，autoIncrement |

没有配置 developmentClient、OTA update 或自动商店提交；当前未安装 expo-dev-client、expo-updates。三平台 bundle export 与签名安装包是不同验收项。

## 环境绑定

preview/production 都必须提供以下配置。真实值由项目所有者绑定，仓库不预设注册应用或 EAS 项目；缺失值直接阻断配置解析，避免 Expo 使用 placeholder 标识构建。

| 环境变量                    | 含义与要求                                                                        |
| --------------------------- | --------------------------------------------------------------------------------- |
| LINJI_APP_ENV               | development / preview / production；EAS 档位固定对应值                            |
| LINJI_ANDROID_PACKAGE       | Android application ID，多段包名                                                  |
| LINJI_IOS_BUNDLE_IDENTIFIER | iOS bundle identifier，与签名及商店登记一致                                       |
| LINJI_EAS_PROJECT_ID        | 真实 EAS 项目 UUID                                                                |
| LINJI_EXPO_OWNER            | 拥有该项目的 Expo 账号或组织                                                      |
| EXPO_PUBLIC_API_BASE_URL    | 设备可达的 HTTPS Backend API 地址，不含账号密码、query、fragment，不使用 loopback |

应用身份是公开配置，应在 EAS 对应 environment 中使用配置解析阶段可读的环境变量，不能放在仅云构建时可读的 secret 可见性中。`EXPO_PUBLIC_API_BASE_URL` 编译进入 bundle；修改后需要重新构建。签名、平台账号、供应商密钥单独管理，模型凭证和数据库凭证只在 Backend。

本地 development 保留局域网 HTTP 调试能力，可不设置原生身份。若主动提供身份变量，则同样校验格式。预览/生产地址的域名可达性、证书、Backend CORS 与完整登录流程仍需目标环境验收。

## SecureStore 原生配置

补充官方 `expo-secure-store` config plugin，显式启用 `configureAndroidBackup: true`。配置内省生成 Android `fullBackupContent` 和 `dataExtractionRules` 引用；安装依赖中的对应 XML 都排除 `sharedpref/SecureStore`，避免将无法恢复解密的 refresh 凭证随备份还原。

当前登录不使用生物识别，`faceIDPermission: false`，发布检查同时拒绝意外增加的 NSFaceIDUsageDescription。今后引入生物识别时需一起修改产品流程、插件配置与检查规则。配置检查不等同于 Android 真机备份/恢复或 iOS Keychain 行为验收。

## 本地检查与 CI

在 app 仓库根目录设置上述真实环境变量后运行：

```powershell
pnpm install --frozen-lockfile
pnpm check
$env:LINJI_APP_ENV = 'preview'
pnpm release:check
$env:LINJI_APP_ENV = 'production'
pnpm release:check
```

`release:check` 只在本地调用已安装的 Expo CLI，执行 `expo config --type introspect --json`，验证身份、原生备份引用、SecureStore XML、Face ID 权限和 OpenAPI 哈希。不执行 prebuild，不创建原生工程，不登录 EAS，不上传源码。`eas-build-post-install` 在依赖安装后再次执行同一检查。

30 项配置测试覆盖缺失/非法身份、开发环境兼容、发布 URL、备份规则、权限及上传忽略规则。CI 增加 preview/production 检查，使用明确的虚构身份和 `.example` 域名，仅验证配置解析，不发起远程 API 请求；远程 runner 尚未执行。

`.easignore` 独立维护完整排除清单，因为存在该文件时 EAS 不再沿用 `.gitignore`。排除依赖、环境文件、签名、日志、产物、文档、测试及生成原生目录，保留源码、assets、安装策略、锁文件、配置、发布检查脚本与 OpenAPI 快照。Git ignore 语义已用临时夹具检查；真实 EAS 源码归档尚未检查。

完成项目绑定和签名配置后，可在独立发布工作中使用官方命令（本轮未执行）：

```powershell
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile production --platform all
```

## 验收边界

最终本仓 frozen install、完整 check（57 文件 / 1028 项）、lint 零警告、TypeScript 与 Doctor 20/20 通过；iOS/Android/Web bundle export 退出码 0，产物保留于 `D:/linji-native-release/20261102/app-export`。日志 `native-release-install.log`、`native-release-check-final.log`、`native-release-export.log` 与两份 preflight 日志保留；初轮夹具类型失败保留于 `native-release-check.log`，修正后完整重跑通过。

本轮本地实际 preview/production Expo 配置内省均通过；补丁前内省确认 Android Manifest 缺少 SecureStore 备份排除引用，补丁后两项引用均正确。测试使用虚构身份，不证明真实 Expo 项目所有权或应用登记有效。

尚未完成：真实 EAS 项目绑定、源码归档核对、云构建、签名、APK/AAB/IPA 安装与启动、真机凭证备份恢复、商店提交和生产 API 联调。Docker 按用户要求保持原状，后端容器验收仍为待办。项目整体尚未验收完成。

## 官方依据

- [SDK 58 文档](https://docs.expo.dev/versions/v58.0.0/)
- [SecureStore 与 Android 备份](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/)
- [EAS build 配置](https://docs.expo.dev/build/eas-json/)
- [eas.json 配置项](https://docs.expo.dev/eas/json/)
- [源码上传忽略规则](https://docs.expo.dev/build-reference/easignore/)
- [动态应用配置](https://docs.expo.dev/workflow/configuration/)
- [EAS 环境变量使用](https://docs.expo.dev/eas/environment-variables/usage/)
