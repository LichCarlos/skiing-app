# D-36 文章收藏

2026-11-02更新：旧重复写帮助函数已移除，文章详情现在使用共享FavoriteRun及焦点生命周期，个人读取增加前后身份核对；13项展示测试、完整519项/Doctor20/20和三平台导出通过。现行OpenAPI1.50.0；详见[本轮实现与限制](article-lifecycle.md)，下文为2026-10-30历史记录。

2026-10-30；OpenAPI 1.37.0，新增必填 favoriteByMe 的本仓生成类型，无新依赖。

知识列表显示已收藏标记；详情提供收藏、取消、游客登录入口与未知状态刷新。列表、详情、本人收藏分页的 Query key 均包含 userId；详情在账号/文章变化时重建局部状态，进入页面时刷新。本人收藏页取消后，无论写入结果是否正常结束，均失效当前账号文章列表/详情及本人收藏缓存。

个人文章读取先使用 /auth/me 校验当前账号；共享 API transport 可以续期过期 access。游客投影固定 false，恢复会话期间不发出文章查询。页面层不读取数据库，不下载全部收藏推算状态，收藏写入沿用 PUT /me/favorites 与 DELETE /me/favorites/article/:id。

提交使用同步 ref 锁和页面生命周期 AbortSignal。提交前再次确认账号；成功或写入响应丢失后读取真实详情，更新当前账号缓存并失效列表/本人收藏。无法核对则显示未知，禁止继续翻转，允许刷新或重新登录。账号变化/卸载后取消请求并丢弃迟到结果。详情路由 ID 限数据库正 int4。

`src/features/knowledge/article-api.test.ts` 的 9 项测试覆盖账号缓存键、游客投影、个人读取、账号错配、既有写路由、结果不明核对及页面取消；不属于设备交互测试。完整验收运行 `pnpm check` 和 `pnpm exec expo export --platform all`，构建导出使用忽略的默认 dist。

已查阅 Expo SDK 58 版本入口及 Expo Router 文档；真实设备上的导航、登录切换、网络中断、SecureStore 和后端联调仍待验。native 凭证继续按既有协议保存在 SecureStore/内存，不新增持久化副本。
