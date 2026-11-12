# SDK58原生图片上传修复与验收

核对：2026-11-04。真实Android头像上传发现产品兼容缺陷：Expo SDK58默认将全局fetch安装为expo/fetch，原生FormData中的旧式{uri,name,type}对象在请求到达Backend前被拒绝。原页面安全地进入“上传结果待核对”状态；数据库没有生成资产，不能将这次尝试计为上传成功。

## 修复与职责

共享入口src/platform/api/image-upload-form由Metro解析平台实现。native版本使用expo-file-system File将picker URI转换为Blob兼容文件；普通/Web版本保留picker提供的Blob/File，无文件时拒绝preview URI。头像profile-screen与动态composer-session都调用该入口，移除两处as unknown as Blob旧对象。API transport继续维护Bearer、epoch、AbortSignal和响应核对，不手写multipart boundary，不改变业务协议或重试规则。

通过官方Expo SDK58安装器增加直接依赖expo-file-system ~58.0.13；该版本此前已是锁文件传递依赖，pnpm-lock只新增根importer三行，没有升级其他包。没有开启EXPO_PUBLIC_USE_RN_FETCH回退，AI继续使用当前流式fetch。原生包需要按正常发布流程重新构建；本轮实际运行是官方Expo Go58.0.5，不是独立签名App。

## 实际证据

| 场景 | 结果与核对                                                                                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01  | 原生UI注册并登录专用合成账号                                                                                                                                                        |
| M02  | Android系统Photo Picker选择合成PNG；正式POST /assets返回201，真实ClamAV测试规则/MinIO/PG完成ready资产；PATCH /account/profile返回200，AvatarAssetId引用该资产；原生个人中心显示图片 |
| M03  | 再次打开系统选图并取消，返回编辑页保持原头像；点击还原原头像，未新增资产或改变账号引用                                                                                              |

本轮三个场景通过。头像资产为PNG、1330字节，Sha256与账号外键、OperationLog均有专用库快照；实际上传对象只有一个。两张合成图片进入系统相册，多选数量1/2已观察，但动态发布/顺序/雪场/审核/公开点赞评论/编辑复审没有完成，不计通过。运行过程中Expo Go一次显示其他本地项目页面，相关脚本未进行业务写入；没有停止或修改其他项目服务。最终Windows出现页面文件不足WinError1455，停止本轮自有服务后收尾，不把自动化失败归为已通过场景。

完整失败记录保留于D:/linji-native-media/20261104：action-04为修复前真实上传失败；action-05为驱动早于Metro就绪读取状态文件；action-06首次bundle下载超时；action-09/10为原生目标页未出现；action-11为页面文件不足。驱动观察步骤的action passed仅代表该步代码执行，无业务断言的不计业务场景。初次空夹具服务在补充数据库观察器后正常停止，再创建新专用库，两个库证据均保留。

## 工程验证

新增4项测试核对Web文件字节/MIME/名称与无文件拒绝、原生URI通过File构造可读字节及已有Blob保留。File模块在单测中使用Blob替身，真实原生模块由M02补足验证。专项14项及类型检查通过；最终独立副本完整check包含1221业务测试、20源码工具、10产物工具、lint零警告、TypeScript及Doctor20/20，三平台导出/封存/迁移校验通过。

Backend独立冻结安装/check1462单测、20源码工具、177HTTP、build/OpenAPI及Web冻结安装/check3045业务、20源码/20发布工具、双无缓存构建与standalone通过。Backend原有6条lint警告保持。共25条最终有效工程命令；第一次App检查因Go类型lint无法分配内存退出，限制Go并行后的第二次仍报VirtualAlloc errno1455；停止专用模拟器、Metro和存储/PG后，在已冻结安装的同一副本完整复验通过。原始失败日志不可覆盖，检查没有关闭或跳过。

契约1.51.1/143操作与24迁移保持。完整数据库859项、真实存储51项和Kafka/RAG专项是此前独立证据，本轮没有重跑；本轮模型调用为零。

## 复现与收尾

在独立App仓库冻结安装后，以合成账号和Android系统选图执行头像保存、重新打开/取消、原头像还原，并由Backend维护者核对专用库Asset/头像外键及私有存储；不要让App直连数据库。脚本在上述D盘目录，仅绑定本轮独立模拟器和随机回环端口，不是通用业务库测试入口。

自有模拟器/Metro/Backend/PG/MinIO/ClamAV均已停止，端口关闭、桶清空，原用户AVD配置哈希保持；合成数据库保留供核验，其中资产元数据保留但对象桶已清空，不是可直接恢复继续业务的环境。测试扫描器仅有无害标记规则，不代表生产病毒库。没有启动Docker、Next生产或Expo Web，没有上传EAS、签名、提交或推送。

原始结果及摘要：[三仓同版报告](../validation/native-upload-20261104.json)。物理设备/iOS、相册权限拒绝、超过上限图片、弱网恢复、完整社区链、独立签名包和生产S3仍待验。

官方依据（2026-11-04）：[SDK58 Expo全局fetch](https://docs.expo.dev/versions/v58.0.0/sdk/expo/)、[File与FormData上传](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/)、[ImagePicker](https://docs.expo.dev/versions/v58.0.0/sdk/imagepicker/)。本地技能vercel-react-native-skills 1.0.0提供媒体/原生模块审查方向，具体兼容方案以上述SDK58官方资料及安装源码为准。
