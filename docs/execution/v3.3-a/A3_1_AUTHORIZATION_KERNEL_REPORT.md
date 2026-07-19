# V3.3-A / A3.1 统一授权内核实施报告

日期：2026-07-19  
状态：授权内核与单元测试完成；未批量迁移业务路由，未进入 A3.2。

## 1. 新增文件

- `server/authorization/types.ts`
- `server/authorization/reason-codes.ts`
- `server/authorization/context-resolver.ts`
- `server/authorization/capability-resolver.ts`
- `server/authorization/resource-resolver.ts`
- `server/authorization/field-mask.ts`
- `server/authorization/audit-writer.ts`
- `server/authorization/legacy-adapter.ts`
- `server/authorization/authorization-service.ts`
- `server/authorization/procedure.ts`
- `server/authorization/index.ts`
- `scripts/test-v33-a3-authorization.ts`

同步窄修正 `server/migration/v33-a2/runner.ts`、`scripts/run-v33-a2-backfill.ts` 和 `scripts/test-v33-a2-backfill.ts`；未修改 `0000—0029`、Schema、API 路由或页面。

## 2. 授权判定流程

`AuthorizationService` 按账号 → capability → identity → certification → organization membership → project membership → capability source → data scope → resource relation → resource state/version → confidentiality → NDA → segregation of duties → field mask → permission audit 顺序执行，任一步失败默认拒绝。

客户端提交的 identity/organization/project/staff/resource 上下文只作为查找条件；最终事实来自 `AuthorizationDataSource`。拒绝结果清空 resolved identity/organization/project/staff IDs，不返回资源内容或资源存在细节。

能力来源支持账号 SELF、组织岗位、项目角色、冻结平台职务、显式 grant 和 owner/member/assignee 资源关系。grant 在认证与 membership 门禁之后求值，不能绕过状态、保密、NDA 或职责分离。

## 3. Reason codes

统一导出 **18 个**稳定代码：`ALLOWED` 加 17 个拒绝代码。拒绝代码覆盖账号/身份/认证/成员/职务失效、能力缺失、scope/关系/资源状态、保密/NDA、grant、职责分离、自验收、字段访问和并发版本冲突。

## 4. 字段掩码

服务端序列化前裁剪覆盖 12 类字段组：phone、email、身份材料、企业注册号、银行/结算、精确地址、坐标、供应商报价、文件名/storageKey/永久 URL、BOM 成本、工艺正文、设计源文件。

列表视图固定比详情视图更少；`applyFieldMask` 在返回对象形成前删除禁止字段。字段掩码与审计仅记录字段名，不记录原值。

## 5. Legacy adapter

- `user_profiles.currentRole` 仅记录为工作台偏好观测，永不产生 allow。
- `users.role`、旧 `ROLE_PERMISSIONS`、`adminProcedure`/`permissionProcedure` 仅产生 compatibility observation。
- 新模型事实始终优先；缺少有效新职务时高风险后台默认拒绝。
- compatibility 命中写审计事件，但其 `grantsAuthorization` 恒为 false。

## 6. A2.3 窄修正

- certification 的 `pending`、`additional_info_required`、`approved` 使用 `cert|identity:<id>|<certificationTypeId>` 或组织等价格式占用 key；终态返回 `NULL`。
- recovery 在任何删除前校验目标 run 的 migrationVersion、sourceBaseline、sourceChecksum、manifestChecksum、configurationChecksum；指定 checkpoint 必须显式给出匹配 checksum。

## 7. 测试结果

| 命令 | 结果 |
|---|---|
| `pnpm check` | PASS |
| `pnpm lint` | PASS，0 warning |
| `pnpm check:money:v330` | PASS，30/30 |
| `pnpm test:v33-a2-backfill` | PASS |
| `pnpm test:v33-a3-authorization` | PASS，18 类安全用例 |

A3.1 测试覆盖普通账号后台拒绝、currentRole 伪造、跨组织/项目、成员即时失权、认证撤销、grant 不绕认证、保密/NDA、自验收、四类职责分离、列表/详情字段差异、审计脱敏和 legacy role 不直接授权。

## 8. 环境阻断

没有配置安全 `DATABASE_URL`；本阶段使用 memory data source 和 memory audit writer，不声称数据库集成成功。未连接生产数据库。源码包缺少 `.git`，未创建临时仓库，未提交或推送。

## 9. A3.2 条件

A3.2 已具备代码开工条件：内核接口、reasonCode、字段裁剪、审计、legacy adapter 与基础 `capabilityProcedure` 均可复用。下一阶段应逐个接入高风险路由并实现数据库事实 adapter；本任务按停止条件不自动进入 A3.2。
