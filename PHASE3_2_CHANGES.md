# 生活帮 V3.2 变更说明

## 范围

本版本以 V3.1.2 为稳定基线，完成物品生命周期拆分、统一文件存储与访问审计、WebSocket 实时消息、消息回执、站内通知投递基础和最小管理审计页面。未接入真实病毒扫描、正式手机推送证书或生产支付渠道。

## 物品生命周期

新增 `items`、`item_media`、`item_defects`、`item_accessories`、`item_ownership_history`、`item_service_history`、`item_status_logs` 和 `listing_modes`。

- 现实物品与某次发布记录正式分离。
- 历史 `listings` 由迁移自动生成对应物品并回填 `itemId`。
- 历史流转方式拆入 `listing_modes`。
- 一口价购买、接受报价和赠送选择均在事务中锁定发布与物品。
- 取消未支付订单会释放物品和发布。
- 确认收货会记录所有权变化及物品状态日志。
- 新增“我的物品”和物品生命周期详情页面。

## 文件存储与审计

新增统一 `StorageProvider`：

- `LocalStorageProvider`
- `S3CompatibleStorageProvider`

新增 `stored_files` 与 `file_access_logs`，记录文件提供商、存储键、SHA-256、MIME、大小、隐私等级、安全状态和访问行为。

项目文件现在同时写入统一文件元数据和上传审计；项目成员下载时写入下载审计。开发环境扫描器会拒绝可执行文件和双重扩展名欺骗，普通文件明确标记为 `unavailable`，表示尚未连接真实病毒扫描服务。

## WebSocket 和消息回执

新增 `/api/ws`：

- JWT 鉴权
- 会话成员校验
- 会话订阅/退出
- 心跳与自动重连
- WebSocket 为主、轮询降级
- `message.created`、`message.delivered`、`message.read` 以及项目、订单、投诉、支付等业务事件

新增 `message_receipts`，消息界面显示已发送、已送达和已读。

## 通知基础

新增：

- `notification_deliveries`
- `device_push_tokens`
- Push Provider 接口
- 开发环境 `LogPushProvider`

当前已完成站内通知和可替换推送 Provider 底座；没有真实推送证书时不会声称已完成生产手机推送。

## 管理能力

新增平台运行审计页面，可查看：

- 文件访问日志
- 通知发送失败记录
- WebSocket 在线连接统计

## 数据库迁移

新增：

```text
drizzle/0007_purple_prowler.sql
```

迁移包含 V3.2 新表、索引、外键和历史发布回填。新增可重复执行的 MySQL 集成脚本：

```bash
pnpm test:integration:v32
```

覆盖历史发布迁移、并发购买、订单取消释放、所有权变化、物品生命周期、文件审计和消息回执。

## 验证结果

- `pnpm check`：通过
- `pnpm lint`：通过，0 错误/0 警告
- `pnpm test`：7 个测试文件、32 项测试全部通过
- `pnpm build`：通过，生成 `dist/index.mjs`
- `pnpm build:web`：通过，Expo Web 打包 1350 个模块
- 实际进程健康检查：`/api/health` 返回 HTTP 200
- 数据库不可用时：`/api/ready` 返回 HTTP 503

当前执行环境没有 MySQL/Docker，因此本次未再次执行真实 MySQL 集成脚本；脚本已纳入源码并可在本地 MySQL 环境重复运行。

## 明确未完成

- 真实 ClamAV 或商业病毒扫描服务
- 正式 APNs/FCM/Expo Push 证书与生产投递
- 生产支付渠道、回调验签和对账
- 历史金额全链路迁移
- 真实身份第三方核验
