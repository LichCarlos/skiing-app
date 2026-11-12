# App 本地开发与联调教程

## 环境与依赖

使用 Node 22.16.0、pnpm 11.25.0，按 README 独立 clone 和冻结安装。本仓 Expo SDK 58 与 React Native 0.88；已有 Android SDK/NDK/JDK 位于开发机外部工具目录，依赖声明和锁文件保留在 Git，不提交工具安装目录或二进制。

```bash
pnpm install --frozen-lockfile
pnpm exec expo-doctor
```

复制 `.env.example` 为 `.env`，只配置公开 API 地址。新增 Expo 模块运行 `pnpm exec expo install <包>` 并查 SDK 58 文档，不能直接升级到别的 SDK 所用版本。原生插件/模块变化要重建合适的开发客户端。

## 选择运行平台

| 平台       | 启动方式       | 前提                                                |
| ---------- | -------------- | --------------------------------------------------- |
| Expo Web   | `pnpm web`     | 支持 Web Locks、站点存储的 localhost / HTTPS 浏览器 |
| Android    | `pnpm android` | 已启动模拟器或连接设备，运行环境兼容 SDK 58         |
| iOS        | `pnpm ios`     | macOS + Xcode 模拟器，或配置好的云构建/真机方案     |
| 平台选择器 | `pnpm start`   | 根据终端提示选择可用平台                            |

Expo Go 的支持范围与版本有关，未包含的自定义原生模块需要 development build。不要把 JS bundle export 当作已生成安装包。

## API 网络与登录

- 浏览器与本机 Backend：`http://localhost:8080/api/v1`，后端 WEB_ORIGINS 增加浏览器实际 Origin（含端口）。
- Android 官方模拟器访问宿主：通常 `http://10.0.2.2:8080/api/v1`。
- 局域网真机：使用宿主可达的局域网地址，核对监听、防火墙和网络；手机 localhost 不是电脑。
- 连接已部署环境：使用正确的公开 HTTPS API，例如 `https://lichcarlos.top/snow-api/api/v1`。不要在生产数据上执行写入型测试。

修改公开地址后重启打包器；已发布 bundle 需要重构建。登录必须使用对应环境账号，管理员密码不放入 App。原生 refresh 存 SecureStore，access 仅内存；Web 经 Cookie/CSRF 与跨标签协调，不能通过手工复制 token 绕过会话问题。

## 阅读与修改功能

路由位于 `app/`；业务放 `src/features`，平台请求/认证/配置放 `src/platform`。先查附近 model、API 适配、screen 和测试，观察 Query key、账号切换、请求取消和重试如何隔离。

做列表页面时处理加载、空态、错误、刷新和分页；做写入时处理重复提交、权限变化、会话过期及成功后重读。多图写作没有固定张数上限，系统选择器单次能力和内存仍有实际边界，可分批添加；服务端继续校验资产归属和文件规则。

AI 使用后端流式通道，不直接接入供应商 Key。取消、失败恢复、引用与历史查询有各自状态，不能将“请求发出”等同于“回答持久化成功”。

## 验证流程

```bash
pnpm openapi:verify
pnpm lint
pnpm typecheck
pnpm test
pnpm exec expo-doctor
pnpm exec expo export --platform all
```

完整 `pnpm check` 还覆盖源码/产物工具。真实 HTTP 测试用专用夹具与隔离数据，先阅读对应 config；不要默认连接生产。跨仓契约变更按[技术路线](learning-roadmap.md)同步 OpenAPI 与锁，不能手改生成文件。

UI 或原生行为变化需在相应模拟器/真机验证：安全区、键盘、返回、后台恢复、冷启动、弱网、账号切换、相册授权和上传。Web 测试不能证明 iOS/Android SecureStore、签名或系统权限行为。

## 常见问题

| 现象                     | 检查与处理                                                                  |
| ------------------------ | --------------------------------------------------------------------------- |
| 手机请求 localhost 失败  | 改为模拟器宿主/局域网/HTTPS 可达地址                                        |
| 浏览器登录恢复失败       | 检查 Origin、Cookie/CSRF、安全上下文、Web Locks、站点存储及前后端 host 一致 |
| Native module missing    | 运行环境是否包含该模块，必要时构建新 development build                      |
| Expo 依赖版本不匹配      | expo-doctor、expo install 对齐 SDK，不盲目升级大版本                        |
| release:check 提示缺身份 | preview/production 需要真实应用 ID、owner、EAS UUID 和 HTTPS API            |
| 更新代码后旧 APK 没变化  | 源码提交不会自动改变已安装包；重构建、签名、安装并核对版本                  |
| Android 构建路径太长     | 用受控短路径构建副本，不移动已运行 SDK/模型或删除未知目录                   |
| 类型/契约失败            | 确认三端快照和摘要一致，重新生成；不要用类型断言掩盖 API 差异               |

发布见[构建教程](deployment.md)，Git/SDK 排除见[安全管理](repository-security.md)。
