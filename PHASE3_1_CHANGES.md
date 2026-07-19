# 生活帮 V3.1 变更说明

## 基线与范围

- 唯一代码基线：`shenghuobang_phase2_project_collaboration(1).zip`
- 基线 SHA-256：`0CEC531A728F854CF13095594AFEFD439CC8C5A035C13023256C3FEB1F1CE7B6`
- 保持 React Native + Expo、TypeScript、Express、tRPC、MySQL、Drizzle ORM、pnpm
- 未开发物品生命周期拆分或 WebSocket

## 模块 A：支付、退款、托管与阶段结算

新增数据表：

- `payments`
- `payment_attempts`
- `payment_events`
- `refunds`
- `escrow_records`
- `escrow_releases`
- `settlements`
- `settlement_items`

新增 `PaymentProvider` 接口和 `SandboxPaymentProvider`。订单/项目原有“直接改状态即支付成功”接口已停用，支付流程现在为：创建支付单 → 沙箱提供商确认 → 支付事件 → 创建托管 → 同步订单/项目。

资金金额在新增账本中使用 MySQL `DECIMAL(14,2)`，应用层统一转换为整数分后比较和运算。支付、退款、结算、释放均有幂等键和数据库唯一约束。支付确认、托管创建、退款审批/执行、阶段结算、托管释放和投诉资金处理使用数据库事务。

里程碑验收后在同一事务创建唯一阶段结算及明细；财务审核后才能释放托管。退款成功同步支付、托管、订单，项目全额退款时同步项目状态。所有资金变化写入 `payment_events` 或独立资金业务表，不提供删除接口。

新增用户端沙箱支付页和退款申请入口；沙箱页明确显示“沙箱支付，仅用于开发测试，不产生真实资金交易。”

## 模块 B：实名认证、工程师和商家认证

新增：

- `identity_verifications`
- `engineer_verifications`
- `merchant_verifications`
- `verification_documents`
- `verification_actions`

工程师/商家申请不再自动通过。支持提交、补充资料、重新提交、查看状态和退回原因；管理员支持待审核列表、详情、证明文件、通过、退回补充、拒绝和撤销。

证件完整号码不入库：仅保存 SHA-256 摘要与末四位。证明文件不返回永久地址，用户或有权限审核员只能申请短时签名访问；管理员访问会写敏感操作审计日志。

正式工程师报价和商家回收报价会查询最新有效的 `approved` 认证记录。认证撤销会关闭接单并禁止新业务，但不删除历史订单或项目。

## 模块 C：投诉后台裁定

新增：

- `complaint_actions`
- `complaint_decisions`
- `complaint_status_logs`
- `complaint_fund_actions`
- `complaint_credit_actions`

投诉创建在事务中冻结项目托管和未完成结算，并写资金事件。用户端可查看状态时间线、回应、补证、裁定及资金/信用处理记录。

管理员受控接口支持要求补证、协商、裁定和关闭。裁定支持驳回、继续履约、重新交付、全额/部分退款、全部/部分释放，以及警告、信用扣减、限制接单、暂停账号。退款、释放和信用处罚均为独立业务记录，不写在备注中代替状态机。

## 模块 D：管理员权限与审计

管理员角色：

- `admin`
- `verification_reviewer`
- `complaint_operator`
- `finance_operator`
- `customer_service`

后端实现菜单和操作权限映射，每个管理员 tRPC 写接口再次校验权限、资源和当前状态。退款、资金释放、投诉裁定、认证撤销、权限变更等高风险操作必须提交与资源匹配的二次确认值。

`audit_logs` 覆盖认证审核/撤销、退款审核/执行、结算审核、托管释放、投诉裁定、敏感文件访问和管理员权限变更。审计写入前递归脱敏密码、Token、密钥、证件号、银行字段和私密存储地址。

管理页面：

- `/admin`
- `/admin/verifications`
- `/admin/complaints`
- `/admin/finance`
- `/admin/audit-logs`

## tRPC 路由

- `payments`
- `refunds`
- `escrow`
- `settlements`
- `verifications`
- `adminVerifications`
- `adminComplaints`
- `adminFinance`
- `auditLogs`
- `admin`

## 数据库迁移

新增：`drizzle/0004_yummy_storm.sql`

迁移只新增表、索引、外键、唯一约束，并扩展现有枚举，不删除第二阶段表或字段。兼容回填包括历史认证、项目订单、已验收里程碑结算和投诉状态日志。

实际迁移验证：

- 临时 MySQL 8 空库执行 `0000` 至 `0004`：通过，49 张表
- 临时 MySQL 8 第二阶段库执行 `0000` 至 `0003`、写入种子数据、再执行 `0004`：通过
- 第二阶段升级回填：工程师认证 2 条、商家认证 2 条

## 自动化测试

新增 `tests/v31-workflows.test.ts`，覆盖任务要求的 13 项：支付确认幂等、支付创建幂等、金额匹配、退款重复审批、退款上限、里程碑结算唯一、投诉冻结、裁定退款状态一致、工程师/商家认证门禁、管理员退款权限、高风险审计、项目资金成员权限。

本次实际结果：

| 检查 | 结果 |
|---|---|
| `pnpm install` | 通过 |
| `pnpm check` | 通过 |
| `pnpm lint` | 通过 |
| `pnpm test` | 通过：5 个文件，22 项测试 |
| `pnpm build` | 通过：`dist/index.mjs` 256.9 KB（最终包不包含 dist） |
| `pnpm build:web` | 通过：1346 个模块（最终包不包含 web-dist） |
| 空库迁移 | 通过 |
| 第二阶段升级迁移 | 通过 |
| 后端实际启动 | 通过：端口 31371 |
| `GET /api/health` | 通过：返回 `{ "ok": true, ... }` |

另外在临时 MySQL 8 中实际执行了一次资金集成流程：

- 创建 ¥100.00 支付单并确认：`payment=success`、`escrow=funded`、`order=pending_delivery`
- 对同一支付单重复确认：第二次返回 `alreadyConfirmed=true`，未重复入账
- 提交、批准并执行 ¥40.00 部分退款：`refund=success`、`payment=partially_refunded`、`order=refunding`
- 对同一退款重复批准：被状态机拒绝

## 本地启动与管理员

按 README 执行 `pnpm install`、配置 `.env`、启动 MySQL、`pnpm db:migrate`、`pnpm db:seed`、`pnpm dev`。

管理员不使用硬编码账号。设置 `ADMIN_PHONE`、`ADMIN_PASSWORD`（至少 12 位）和可选 `ADMIN_ROLE` 后执行：

```bash
pnpm admin:create
```

## 尚未完成或明确不在 V3.1 范围

- 未接入真实微信、支付宝、Stripe 或银行出款；仅实现可替换沙箱提供商
- 未接入真实身份证/企业登记第三方核验；采用人工审核
- 未实现生产支付异步回调验签、渠道日终对账、发票和税务
- 未实现云对象存储、病毒扫描和长期下载审计
- 未实现 WebSocket；现有消息轮询保持不变
- 未提前开发物品生命周期拆分
