# 生活帮 V3.1.2 收口说明

## 范围与基线

本版本仅以 `shenghuobang_phase3_1_1_source.zip` 为稳定基线，完成 V3.1 财务与投诉功能的收口修复。未开始 V3.2，未开发 S3、WebSocket 或物品生命周期，未更换技术栈，未进行无关重构。

## 投诉裁定状态一致性

- `full_refund`：项目进入 `refunded`，相关或仍为 `disputed` 的里程碑转 `cancelled`。
- `partial_refund + continuePerformance=true`：项目进入 `in_progress`，里程碑恢复投诉前快照；快照不适合继续履约时转 `revision_required`。
- `partial_refund + continuePerformance=false`：项目进入 `paused`，相关里程碑转 `cancelled`。
- `partial_release`：项目恢复 `in_progress`，里程碑恢复适合继续履约的快照状态。
- 所有 `resolved/rejected` 裁定路径最后执行项目和里程碑 `disputed` 兜底清理。
- 所有裁定结果处理 frozen settlements 和 frozen escrows，不允许投诉结束后永久冻结。

## 多托管记录处理

投诉创建时 `complaint_business_snapshots.escrowStates` 保存项目全部托管记录。裁定不再使用 `limit(1)`：恢复、重交、退款、全部释放和部分释放均遍历快照对应的全部托管记录。部分退款或释放按托管可用余额顺序分配，所有正数资金动作分别写入退款、释放、资金事件和投诉资金动作账本。

## 部分退款订单状态

订单状态枚举新增 `partially_refunded`。退款执行期间订单短暂进入 `refunding`；成功部分退款后进入 `partially_refunded`，失败后恢复本次执行前的履约状态。每次变化写入 `order_status_logs`。

迁移会把历史上 `payments.status=partially_refunded`、存在成功退款、但订单仍为 `refunding` 的记录改为 `partially_refunded`，同时补写订单状态日志。

## 失败退款重试

新增 `refund_attempts`，每次 Provider 调用保存：

- attempt 编号、创建和完成时间
- Provider、请求编号和 Provider 幂等键
- 操作人、订单执行前状态
- 请求数据、Provider 原始响应、失败原因和最终状态

`failed` 退款允许具有财务退款审核权限的管理员通过独立 `retryRefund` 操作重试，并继续要求资源级二次确认。明确失败后使用下一 attempt 的派生幂等键；结果未知的 pending attempt 复用原键。退款表、attempt 表、Provider 和最终资金事务共同保证不会重复入账。投诉裁定退款失败后保持案件 `under_review` 和资金冻结，再次提交相同裁定会复用原退款并创建新 attempt。

## 正金额校验

支付、退款和托管释放均要求金额大于 0，并继续执行 V3.1.1 的整元校验。0 元和负数在进入 Provider 或资金事务前被拒绝。

## 健康检查拆分

- `GET /api/health`：只检查进程是否响应，不访问数据库。
- `GET /api/ready`：检查 `DATABASE_URL`、`JWT_SECRET`，并对 MySQL 执行 `SELECT 1`。环境缺失或数据库不可用时返回 HTTP 503。

## 历史重复活动投诉迁移

新增迁移：

```text
drizzle/0006_steady_wild_child.sql
```

迁移使用项目维度排序保留一条有效活动投诉（优先已有锁，其次按创建时间和 ID），其余重复投诉转为 `closed` 并等待人工合并。每条被关闭投诉均写入 `complaint_status_logs` 和 `complaint_actions`；无有效项目映射的历史活动投诉也会安全关闭。迁移删除非活动投诉的锁并为全部保留活动投诉补锁，升级结束后不允许活动状态投诉缺失活动锁。

## 测试

原有 5 个测试文件和 22 项单元测试未删除、未跳过；新增 6 项正金额单元测试。原有 V3.1.1 真实 MySQL 10 组场景全部保留，新建 `scripts/test-v31-2-integration.ts` 增加 9 组：

1. full_refund 后里程碑不再 disputed
2. partial_refund 继续履约后的项目、里程碑和订单状态
3. partial_refund 停止履约后的状态
4. partial_release 后无 disputed/frozen 残留
5. 0 元和负数退款被拒绝
6. 普通退款及投诉裁定退款失败后安全重试
7. 数据库不可用时 `/api/ready` 返回非 200
8. 历史重复活动投诉升级处理
9. 多托管投诉裁定全部恢复或终结

## 验证结果

- `pnpm install --frozen-lockfile --reporter=append-only`：通过，按锁文件安装 1162 个包。
- `pnpm check`：通过，TypeScript 无错误。
- `pnpm lint`：通过，Expo ESLint 无错误。
- `pnpm test`：通过，6 个测试文件、28 项测试全部通过；原有 22 项全部保留，无删除、无 skip，新增 6 项正金额测试。
- `pnpm test:integration:mysql`：通过；V3.1.1 原有 10 组和 V3.1.2 新增 9 组真实 MySQL 场景全部通过，共 19 组。
- `pnpm build`：通过，生成 `dist/index.mjs`，大小 287.1 kB。
- `pnpm build:web`：通过，Expo Web 打包 1346 个模块并导出到 `web-dist`；仅提示 Browserslist 数据较旧，不影响导出。
- 空库迁移：通过，Drizzle 从 `0000` 到 `0006` 全部执行成功；迁移后 53 张表（含 Drizzle 迁移记录表），`refund_attempts` 存在。
- V3.1.1 升级：通过；3 条同项目活动投诉升级后为 1 条活动、2 条 closed、1 条活动锁、2 条关闭状态日志和 2 条系统动作，活动无锁计数为 0；历史部分退款订单由 `refunding` 改为 `partially_refunded` 并新增 1 条订单状态日志。
- 数据库可用：构建产物生产模式启动后，`GET /api/health` 返回 HTTP 200、进程检查成功；`GET /api/ready` 返回 HTTP 200，环境与数据库检查均为 true。
- 数据库不可用：同一构建产物连接不可用端口时，`GET /api/health` 仍返回 HTTP 200，`GET /api/ready` 返回 HTTP 503。

## 未完成事项

- 生产支付 Provider、异步回调验签、日终对账和真实出款
- 历史 INT 元金额向整数分或统一 DECIMAL 的全链路迁移
- 真实身份/企业登记第三方核验和短信验证码
- 云对象存储、病毒扫描和长期下载审计
- WebSocket 即时消息
- 物品生命周期与发布记录拆分
- 发票与税务能力
