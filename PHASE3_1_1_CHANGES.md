# 生活帮 V3.1.1 修复说明

## 范围

本版本以 `shenghuobang_phase3_1_source.zip` 为唯一基线，仅修复 V3.1 的资金事务和投诉裁定问题。未开始 V3.2，未开发物品生命周期、S3 或 WebSocket，未更换技术栈或进行无关重构。

## 支付和退款失败持久化

支付确认和退款执行改为：准备短事务 → 事务外 Provider 调用 → 结果短事务。

支付失败保存 `payment_attempts.status/failedReason`、`payments.status/failedReason` 和 `payment_events.payment_failed`。退款失败保存 `refunds.status/failedReason` 和 `payment_events.refund_failed`，并将原支付恢复为 `success` 或 `partially_refunded`。失败结果提交后才向上抛错，不再被事务回滚。

Provider 幂等键稳定绑定支付单。并发确认只生成一笔支付成功账本、一条托管记录和一个成功资金事件。

## PaymentProviderRegistry

新增 `server/payments/provider-registry.ts`，默认使用：

```env
PAYMENT_PROVIDER=sandbox
```

finance service 只通过 Registry 获取 `PaymentProvider`，不再直接导入沙箱实例。

## 投诉业务快照与状态恢复

新增 `complaint_business_snapshots`，创建投诉时在同一事务记录项目、里程碑、托管和结算原状态。

- `dismiss`：恢复全部快照状态
- `continue_performance`：项目恢复 `in_progress`，结算恢复原状态
- `redeliver`：项目 `revision`，相关里程碑 `revision_required`，相关结算 `rejected`
- `full_refund`：项目 `refunded`，冻结结算 `rejected`
- `partial_refund`：必须明确是否继续履约；继续则项目 `in_progress` 并恢复结算，否则项目 `paused`、结算 `rejected`
- `release_all`：项目完成、相关里程碑验收、冻结结算 `settled`
- `partial_release`：项目继续履约、剩余冻结结算 `pending`

所有裁定路径均处理 frozen settlements，禁止投诉结束后结算永久冻结。

## 活动投诉防重

新增 `complaint_active_locks`，对 `projectId` 和 `milestoneId` 设置唯一约束。创建投诉时锁定项目、检查活动投诉并写活动锁；裁定完成删除锁。解冻前再次检查不存在其他活动投诉。

## 数据库迁移

新增：

```text
drizzle/0005_silky_squadron_supreme.sql
```

迁移仅新增表、外键、索引、唯一约束，并为 V3.1 已有活动投诉回填保守业务快照和活动锁，不删除 V3.1 数据。

## 真实 MySQL 集成测试

新增 `scripts/test-v31-1-integration.ts` 和命令：

```bash
pnpm test:integration:mysql
```

脚本自动创建、迁移并删除隔离数据库，真实调用 finance service 和 complaint service，覆盖：

1. 支付成功三表同步
2. 支付失败记录保留
3. 并发重复支付只成功一次
4. 退款失败记录保留
5. 部分退款
6. 同一退款不能重复执行
7. 投诉冻结
8. 投诉驳回后项目恢复
9. 投诉退款后结算不残留 `frozen`
10. 同一项目不能创建两个活动投诉

原有 5 个测试文件和 22 项测试全部保留，没有 skip。

## 金额策略

V3.1.1 保留历史 INT 元字段并明确只支持整元：历史订单/项目/报价金额为 `INT` 元；新账本为 `DECIMAL(14,2)`，但只允许 `.00`。支付、退款和投诉资金裁定统一执行整元校验，小数金额直接拒绝。

将全链路迁移为整数分或统一 DECIMAL 属于后续独立迁移，不在本修复版本范围。

## 验证结果

- `pnpm install --reporter=append-only`：通过，依赖安装完成。
- `pnpm check`：通过，TypeScript 无错误。
- `pnpm lint`：通过，Expo ESLint 无错误。
- `pnpm test`：通过，原有 5 个测试文件、22 项测试全部通过，无删除、无跳过。
- `pnpm test:integration:mysql`：通过，真实 MySQL 隔离库中的 10 项 V3.1.1 集成场景全部通过。
- `pnpm build`：通过，生成 `dist/index.mjs`，大小 273.8 kB。
- `pnpm build:web`：通过，Expo Web 共打包 1346 个模块并导出到 `web-dist`；仅有 Browserslist 数据较旧提示，不影响构建。
- 空库迁移：通过，从 `0000` 到 `0005` 全部执行成功；迁移后共 52 张表（含 Drizzle 迁移记录表）。
- V3.1 数据库升级：通过；先执行 `0000` 至 `0004` 并写入 V3.1 活动投诉样例，再执行 `0005`，得到 1 条业务快照和 1 条活动锁，项目/里程碑/结算原状态分别回填为 `in_progress`、`waiting_acceptance`、`pending`。
- 实际健康检查：以生产模式启动构建产物，连接已迁移 MySQL，`GET /api/health` 返回 HTTP 200、`ok: true`。

## 未完成事项

- 真实微信、支付宝、Stripe 等生产 Provider
- 支付回调验签、日终对账、真实出款和税务
- 历史 INT 金额向整数分或统一 DECIMAL 的全链路迁移
- 真实身份第三方核验
- 云对象存储、病毒扫描、WebSocket
- 物品生命周期拆分
