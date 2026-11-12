# D-30 编辑本人资料

2026-10-30，消费 OpenAPI 1.36.0；后端协议见仓库内 `contracts/openapi.json`，客户端类型从本仓快照生成。

2026-11-04补充：[SDK58原生上传兼容修复](native-upload-validation.md)已将URI描述对象替换为File/Blob适配；头像原生真实链通过，多图社区完整链仍待验。下方原FormData描述及计数按历史日期阅读。

## 页面与状态

个人中心提供 `/profile/edit`，支持昵称、当前头像预览、相册选图、清除/还原头像、保存和刷新核对。游客显示登录入口；恢复会话时显示加载。个人中心展示签名头像，加载失败显示昵称首字；编辑页可刷新获取新签名地址。

使用 Expo SDK 58 ImagePicker，选择单张 JPEG/PNG/WebP，最大 10 MiB，客户端初检和后端扫描共同生效。Web 直接提交 picker 的 Blob/File；Native 使用 uri/name/type 的 FormData。统一 API transport 负责 multipart boundary、Bearer 和 401 refresh。App 不访问数据库或存储服务凭据。

`features/profile` 只负责本域 API 和提交流程。头像状态为 keep/clear/new：保持时省略 avatarAssetId，清除为 null，新图先上传 `/assets`，仅 ready 后提交后端 Asset ID。nickname trim 后按 Unicode 码点校验 1–50 字。后端独立执行同样的校验和权限检查。

同步 ref 锁防止重复点击；按 userId 重建编辑器，卸载/切换账号后不发后续写入或更新页面。成功只合并当前同一账号的昵称/头像，保留最新角色和权限，再刷新社区与本人动态缓存。

## 失败与恢复

保存请求失败时不自动重试。超时、网络、5xx 或无法确认的成功响应可能已经提交，因此禁用再次保存，提示先“刷新资料并重新编辑”核对。明确 4xx 显示错误；409 需要刷新。上传后不主动删除头像资产，避免在结果不明时误删已绑定图片；未引用上传仍可由既有资产管理流程处理。后端另以头像引用和外键保护删除。

刷新只读取 `/auth/me` 并合并同账号资料，不覆盖授权集合。操作中离开页面后迟到响应不更新新账号。选图取消保留原状态；相册拒绝、格式/大小错误可重选。

## 验证

资料提交生命周期、API transport 和会话资料合并测试覆盖保持/清除/上传、非 ready 拒绝、账号切换、迟到响应、结果不明和权限集合保留。lint/typecheck、Expo Doctor 与 iOS/Android/Web export 属于工程验证，不代表真实设备点击、照片权限或真实存储验收。

设备验收应覆盖登录后编辑昵称/头像、拒绝相册授权、选图取消、清除/还原、弱网保存后刷新核对、操作中切换账号，以及 15 分钟 URL 过期后的刷新。最新执行结果在本仓 README 中记录。

## 2026-10-30 执行结果

本阶段最终验证：三仓独立 frozen install 通过；Backend lint/typecheck、114 文件/680 单测、3 文件/84 HTTP 测试、19 文件/265 真实数据库测试（D-30 为 29 项）、build/OpenAPI 通过；Web 完整 check 164 项及官网/Admin production build 通过；App 完整 check 87 项、Doctor 20/20 及 iOS/Android/Web export 通过。专用验证库增量升级至 20 迁移、两次 seed、测试前后 db:verify、重复 deploy 无 pending；头像 bigint 可空、索引及 RESTRICT 外键已核验。

OpenAPI 1.36.0，三仓 SHA-256：`b4c2635a9e2d16e8e6cc90e30448eb5620918530ef8eb60730d0fb54b2521062`。存储使用替身的验收不代表真实 S3/MinIO。
