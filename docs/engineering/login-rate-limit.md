# 登录限流反馈

2026-11-03，契约1.51.0/143操作。后端POST /auth/login按账号5次/60秒、可信IP30次/60秒计数，全部有效尝试（包括成功）计数；超限统一429、Login rate limit exceeded与整数Retry-After，不返回账号存在性或命中维度，不签发/清除认证Cookie或Token。

AuthFormRun在登录429时展示“登录过于频繁，请稍后手动重试。”，保留traceId便于核对，沿用单次提交和清理密码输入的既有流程，不自动重试。新增回归核对该提示和仅一次signIn调用。注册429维持原有通用处理，本轮未增加注册限流协议。503继续提示结果未确认，不尝试密码探测或自动登录。

原生SecureStore流程和Expo Web的Cookie/CSRF平台适配保持；本轮只调整纯TS反馈和生成契约，没有新增Expo/React Native API。UI不提供倒计时、解锁或阈值编辑。后端阈值和代理规则不由客户端传入。

快照与lock在本仓contracts，生成类型在src/platform/api/openapi.ts；本轮冻结安装、check、三平台导出及产物封存/校验见[验证摘要](../validation/login-limit-20261103.json)。导出bundle不是签名安装包，也不证明真机或浏览器交互通过。
