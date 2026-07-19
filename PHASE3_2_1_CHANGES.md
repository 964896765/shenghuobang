# 生活帮 V3.2.1 稳定性收口变更

## 范围

本版本以 `v3.2.0` 为唯一基线，只修复 V3.2 的可构建性、迁移安全、物品并发、消息/通知可靠性、WebSocket 权限、文件安全、Health/Ready 与 CI；未开始正式支付、金额迁移、短信、实名外部核验、新品共创或供应链模块。

## 主要修复

- 生产配置集中校验：数据库、JWT、CORS、文件签名和当前 Storage Provider 缺失时拒绝启动。
- `/api/health` 只报告进程存活；`/api/ready` 检查配置、数据库、Schema 版本和存储，失败响应不暴露内部细节。
- WebSocket 在 HTTP Upgrade 前校验 Origin、JWT 和账号；订阅再校验会话成员，并增加单用户连接、IP 建连频率、订阅数、消息大小、心跳和慢消费者限制。
- 客户端改为共享 WebSocket 连接，支持指数退避、前后台/网络/Token 变化恢复、重新订阅和 `sync.required` 补拉。
- 消息新增 `clientMessageId`，以 `senderId + clientMessageId` 唯一；创建消息和更新会话摘要在同一事务，排序使用 `conversationId + createdAt + id`。
- 通知新增业务 `dedupeKey`；投递保存尝试次数、最后错误、下次重试、发送/送达时间。Log Push 明确记录为 `skipped`，不伪装成真实移动推送。
- 关闭 `/uploads/*` 永久静态公开入口。通用、项目和认证文件下载均绑定实际登录用户、过期时间、purpose、nonce、版本和 HMAC，并在读取前复核当前权限与安全状态。
- 上传新增文件名、数量、实际文件头、MIME/扩展名、脚本/双扩展名、大小、SHA-256 和重复内容校验；Storage Key 始终随机。
- 正式交付/验收依据文件只能保留或由新版本替代；停用只改变数据库状态并保留审计，不物理删除。
- 修复种子数据未创建 item 导致 V3.2 Schema 下 `db:seed` 失败的问题。
- 立即购买、接受报价、选择赠送、取消订单和确认流转增加 item 行锁/状态/所有者检查；回收询价关联 item，完成时写 `recycled`、所有权与状态历史。

## 数据库变化

新增 Drizzle 迁移：

- `0008_confused_orphan.sql`：消息/通知/投递/文件审计字段、Schema 版本与迁移异常表、约束和高频索引。
- `0009_vengeful_sentinel.sql`：历史回收询价关联 item、安全回填所有权/状态并记录异常。
- `0010_boring_groot.sql`：回收 item 索引。
- `0011_melted_mac_gargan.sql`：Push 投递目标关联与最终 V3.2.1 Schema 标记，支持每次重试独立留痕。

新增约束/索引包括：消息发送方幂等唯一键、通知接收方去重唯一键、消息稳定排序、通知重试、通知已读、订单关联实体/状态、文件所有者/访问、Push Token 用户和回收 item 索引。迁移异常写入 `migration_anomalies`，`scripts/repair-v32-data.ts` 可重复执行且不会重复创建 item、所有权或 listing mode。

## 测试与实际结果

- `pnpm check`：通过。
- `pnpm lint`：通过。
- `pnpm test`：8 个文件、44 项通过，无 skip。
- `pnpm test:integration:mysql`：V3.1.1 10 组 + V3.1.2 9 组通过。
- `pnpm test:integration:v32`：V3.2 13 组、9 类历史升级、WebSocket 安全 6 项、文件安全 7 项及 Health/Ready 3 项通过。
- `pnpm test:migrations:empty`：空库 0000—0011 共 12 条迁移通过，第二次执行保持幂等。
- `pnpm build`：通过，`dist/index.mjs` 352.1 kB。
- `pnpm build:web`：通过，1350 个 Metro 模块、2 个 Web bundle、19 个资产。
- 生产构建实际启动：`/api/health` 200 且精确返回 alive；`/api/ready` 200，configuration/database/storage 均为 ok。
- 数据库不可用：health 仍为 200，ready 为 503；缺少生产 CORS/文件签名配置时进程以非 0 拒绝启动。
- Web 开发服务实际请求：首页、登录、消息、我的物品、项目文件和管理入口均返回 200 并引用已编译 bundle。

## CI 与仓库维护

新增 GitHub Actions Node 20 / pnpm 9.12 / MySQL 8 CI，任何 TypeScript、Lint、测试、迁移或构建失败都会使 Job 失败。新增 npm/Actions Dependabot、PR 模板、Bug/Feature 表单和 `docs/security/SECRET_MANAGEMENT.md`。

## 已知限制

- 支付仍为 sandbox，不处理真实资金；金额仍为历史 INT 整元 + DECIMAL 账本边界，未做全链路迁移。
- DevelopmentFileScanner 不是真实病毒扫描；干净文件会明确标记 `unavailable`。
- Push Provider 仍为 Log 模拟，没有正式 APNs/FCM/Expo 证书和独立后台队列。
- S3 兼容实现完成了配置/可用性与私有读取底座，但未使用生产账号进行权限、生命周期和灾备验证。
- Expo CLI 报告部分 Expo 54 patch 版本可升级；为避免稳定性任务引入无关依赖变化，本版本未升级。

## 回滚

代码可回退到 `v3.2.0`，但不得删除已执行迁移。0008—0011 仅增加表、列、索引和回填关联；回滚应用前应保留这些字段，旧应用会忽略它们。`clientMessageId` 和回收 item 回填属于不可逆数据补全，如必须物理回退，先备份并由 DBA 在维护窗口评估约束/索引删除，不能直接在生产执行 `DROP`。
