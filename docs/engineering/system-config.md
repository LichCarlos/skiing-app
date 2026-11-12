# 平台介绍、隐私政策与用户协议

2026-11-03；Expo SDK58.0.22 / Router58.0.29、OpenAPI1.50.0 / 143操作。现行维护说明，对应APP-16/API-M11；路由为 `/about`、`/privacy`、`/terms`，个人页与设置页提供入口。平台名称、标语和政策文本均来自既有 `GET /public/config`，没有新增业务接口、依赖、环境变量或迁移。

## 启动与认证边界

根路由组合移入 `src/platform/navigation/root-navigator.tsx`，字体与原生启动屏仍由 `app/_layout.tsx` 管理。根导航在会话恢复期间继续挂载，避免整个页面树返回null；公开平台信息和认证页面可以显示各自状态。雪场、动态等带本人投影的页面仍等待身份确认，私有页面仍执行原有认证/权限门禁，本次没有把恢复中的请求当成游客凭证请求。

QueryClient在根导航实例内保留，继续在会话边界通知时clear，避免账号变更残留私人缓存。此变更不修改SecureStore、浏览器Cookie/CSRF、刷新轮换或注册行为，也不新增“取消服务端登录”协议。

## 公开配置与焦点读取

独立API模块使用no-store、skipAuthRefresh及AbortSignal。传输前后检查取消，验证固定公开投影：名称1–50、标语1–200、介绍最多10000、联系邮箱最多254、政策/协议各最多30000个Unicode码点；四个可空字段必须为null或非空文本，revision必须为SHA-256十六进制值。限值来自已确认配置目录，邮箱格式仍由后端管理写入校验。客户端仅提取这七个公开字段进入缓存，不透传未知字段；正文不进行HTML解释。

`useSiteConfig`使用TanStack Query保存服务端状态，组件useId、当前auth状态与storage epoch隔离读取归属，每次focus生成新的读取代次，避免展示旧代次正文。恢复登录或凭证边界清空Query缓存后重新建立当前观察者；旧归属在新焦点生效前保持禁用。失焦只取消本人页面实例的请求，不取消其他公开页面；取消后的迟到成功体不能进入当前读取。无人观察的缓存gcTime为0，失败后不展示先前成功数据。首次聚焦前不查询，读取期间政策页显示加载，失败提供显式重试；不自动重试，也不在窗口聚焦/联网恢复时悄悄刷新政策。

手动重试校验当前归属、焦点对象与实时storage epoch，并使用Query的cancelRefetch:false合并在途读取。凭证已变化但React尚未重渲染时也同步拒绝旧重试；上一焦点清理不能操作后续焦点。焦点状态和局部读取状态不持久化为账号授权，公开配置无需额外角色/grant。公开数据revision用于内容投影，不宣称是权限版本或服务器实时推送。页面只执行HTTP请求，继续由Backend独占数据库与模型服务。

正文由 React Native Text 纯文本显示，保留多段换行并可选中复制；联系邮箱展示为可选中文本，不执行 HTML。未配置介绍/邮箱和未发布正式政策分别显示明确文案，不虚构运营主体或法律条款。页面使用系统导航返回，移动布局可滚动长正文。

## 验证证据与限制

先复现13项失败：恢复期间根路由不挂载、无效公开配置被当作成功、非公开字段未剔除以及取消边界缺失；续查又复现3项会话/同步重试失败。最终专项5文件44项均通过，较原有3项净增41项（协议13、根导航3、焦点接线11、真实Query6、页面8）。覆盖固定投影/Unicode上限、取消与异常响应；真实QueryClient/QueryObserver测试覆盖独立页面取消、代次、同轮单飞、无效体不缓存、退出观察后回收和窗口聚焦；hook与页面测试分别使用可控React状态/焦点、原生组件替身，检查三类正文、联系邮箱、纯文本、加载/失败/重试及路由入口。根导航测试模拟原生Stack与会话状态，不等同真实启动、路由点击或设备验收。

初次页面测试漏隔离原生api-client导入，Node触发Expo的__DEV__运行时错误，补充明确HTTP替身后通过；首轮完整lint发现四处测试未处理Promise，修正后通过。最终独立冻结安装、完整check（65文件1151项）、lint零警告、TypeScript、Doctor20/20及iOS/Android/Web导出全部通过，产物 `D:/linji-public-info/20261103/app-export-session-final`，进程退出0；初版1147/1150项与导出证据保留，配套三仓结果见共享阶段记录，日志前缀public-info-。真实设备滚动/返回、读屏、字体/启动屏、Cookie和SecureStore、当前数据库与Docker容器继续待验；不重启Docker、不重试被拒绝的服务启动，也没有提交/推送/部署。

独立验证命令：

```powershell
pnpm install --frozen-lockfile
pnpm exec vitest run src/platform/navigation/root-navigator.test.tsx src/features/site-config
pnpm check
pnpm exec expo export --platform all --output-dir D:/linji-public-info/20261103/app-export-session-final
```

2026-11-03实际查阅匹配[SDK58](https://docs.expo.dev/versions/v58.0.0/)、[文档索引](https://docs.expo.dev/llms.txt)及[焦点处理](https://docs.expo.dev/router/reference/focus-handling.md)，均HTTP200；焦点文档修改日期2026-10-12。落地为useCallback/useFocusEffect清理、组件级焦点代次及根导航保留，没有新增Skill、原生模块或跨仓源码依赖。
