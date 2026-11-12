# Expo 知识目录的分页与会话隔离

日期：2026-10-31。对应 APP-06/07、API-K01/D-36，沿用 OpenAPI 1.41.0。Expo ~58.0.21、React Native 0.88.1；查阅 [SDK 58](https://docs.expo.dev/versions/v58.0.0/) 和 [TextInput](https://reactnative.dev/docs/textinput)，无新增原生模块或依赖。

## 页面与状态

`article-query.ts` 统一编码关键词、分类和 page/pageSize=12，拒绝超长筛选、非法页码和 int4 偏移溢出。搜索框 maxLength=100，应用有效参数形成 InfiniteQuery 缓存键，账号/关键词/分类分别隔离；原有 articleKeys.list(userId) 前缀保留，供收藏失效全部本人文章查询。

分类请求与文章请求独立。分类失败仍显示“全部”及清除分类入口，不让用户困在失效分类中。文章列表增加服务端总数；加载更多或刷新失败后保留已加载卡片，并在对应区域显示重试。加载更多失败暂停自动触底重试，由用户主动重试；首次加载失败继续展示独立错误页。

## 凭证与取消

article-api 继续在个人化读取前核对 /auth/me；游客收藏态强制 false，列表和详情使用生成 VO。增加读取前、身份响应后及文章响应后的 AbortSignal 复核，即使替身或迟到响应忽略信号也不返回已关闭页面的数据。详情在请求前拒绝非正 int4 ID。账号或页面改变后的缓存管理仍由会话/Query 生命周期负责，以上检查不等于声明所有在途撤权竞争已经解决。

## 验证范围

知识模块共 30 项纯逻辑/transport 测试，较上阶段新增 21 项，覆盖编码/边界、缓存前缀与账号/条件隔离、取消/迟到响应、详情 ID 和原收藏核对流程。测试不加载 Expo SecureStore 原生运行时；测试替换 API transport，而不模拟凭证存储为业务实现。

没有 React Native 组件、原生设备、键盘/读屏或真实 API 页面成功工作流证据。导出成功和 transport 测试不能代替上述验收；后端公开性及查询语义另由真实 HTTP/PostgreSQL 套件验证。
