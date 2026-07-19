# Secret 管理规范

## 存放边界

- 本地开发把服务端密钥放在未追踪的 `.env`，以 `.env.example` 为字段说明，不复制真实值。
- GitHub Actions 的敏感值使用 Repository/Environment Secrets；公开测试值只能用于隔离 CI 数据库和沙箱 Provider。
- 生产密钥使用部署平台 Secret 管理器注入，不能写入镜像、构建日志、仓库变量或启动脚本。
- Expo 客户端包可被反编译。只有公开地址、公开应用标识等非秘密配置允许 `EXPO_PUBLIC_*`。

允许公开的示例：`EXPO_PUBLIC_API_BASE_URL`、`EXPO_PUBLIC_WS_BASE_URL`、`EXPO_PUBLIC_EAS_PROJECT_ID`。EAS Project ID 只是项目标识，不是认证凭据。

绝对不能公开：`DATABASE_URL`、`JWT_SECRET`、`FILE_SIGNING_SECRET`、`AI_API_KEY`、`EXPO_PUSH_ACCESS_TOKEN`、FCM Service Account、APNs 私钥、支付渠道密钥、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、短信/推送证书和任何身份证或银行数据。Expo Push Access Token 只能注入服务端运行环境，不能使用 `EXPO_PUBLIC_` 前缀，也不能写入 EAS 客户端构建变量。

## 轮换

1. 在 Secret 管理器生成新值，不覆盖旧值。
2. 对支持双密钥的 Provider 先部署兼容读取，再切换签发密钥。
3. 验证健康、就绪、鉴权、回调验签和文件下载。
4. 缩短旧 JWT/签名链接有效期，撤销旧凭据并检查审计日志。
5. 记录轮换人、时间、作用域和验证结果，不记录密钥本身。

## 泄露处理

1. 立即撤销或轮换，不等待代码修复或发布窗口。
2. 暂停受影响 Provider/账号，保存脱敏审计证据并确定泄露范围。
3. 清理当前文件及 Git 历史；如果已推送，按安全事件流程协调强制历史替换和所有克隆更新。
4. 使相关会话、签名链接、访问密钥失效，核查异常支付、下载和管理操作。
5. 完成复盘、通知和防复发控制。真实个人或资金数据事件必须按适用法规升级处理。
