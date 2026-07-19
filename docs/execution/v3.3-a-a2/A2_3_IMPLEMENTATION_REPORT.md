# V3.3-A / A2.3 存量迁移执行器实施报告

日期：2026-07-19  
结论：A2.3 代码与合成验收完成；真实 MySQL 集成实跑因未显式配置安全 `DATABASE_URL` 标记为 `BLOCKED_BY_ENVIRONMENT`，未尝试任何数据库连接。

## 1. 实际修改文件

- `server/migration/v33-a2/contract.ts`：确定性版本、runId、checkpoint key、异常目录、canonical JSON、SHA-256、detail 脱敏和数据库安全门。
- `server/migration/v33-a2/planner.ts`：旧账号、身份资料、认证、项目成员、后台职务、工作台偏好和 reviewer anomaly 的纯确定性规划。
- `server/migration/v33-a2/runner.ts`：run/checkpoint 状态机、固定 500 行批次、MySQL store、memory store、resume/rerun/recovery、旧数据读取和目标行 provenance。
- `server/migration/v33-a2/reporter.ts`：共享计数模型的 JSON/Markdown 报告与报告 SHA-256。
- `scripts/run-v33-a2-backfill.ts`：安全 CLI、基线 checksum、MySQL 版本门禁、迁移/恢复参数和环境阻断报告。
- `scripts/test-v33-a2-backfill.ts`：合成 fixture 与 runner/reporter 专项测试。
- `package.json`：新增 `migrate:v33-a2-backfill`、`test:v33-a2-backfill`，未升级依赖。
- `docs/execution/v3.3-a-a2/A2_3_IMPLEMENTATION_REPORT.md`：本报告。

本轮未修改 `drizzle/schema.ts`、`drizzle/meta/_journal.json` 或 `0000—0029` 任一迁移。

## 2. 实现范围

- 每个旧用户幂等创建一个 consumer identity。
- 按档案、状态或认证事实创建 engineer/merchant identity；复制个人身份 profile，不创建 organization，也不把商家档案升级为组织。
- 迁移 identity/engineer/merchant 三套认证、文件映射和旧审核动作；无 `stored_files` 事实的材料产生 BLOCKING `MIG-ORPHAN-DOCUMENT`。
- `projects.ownerId`/`engineerId` 创建稳定 membership 与 initiator/engineer role；二者相同时一条 membership、两条 role。
- 旧后台 role 采用最小职务映射；未知 role 只产生 `MIG-UNMAPPED-LEGACY-ROLE`，不授职务。
- `currentRole` 只生成 workspace preference，不参与授权。
- `project_acceptances.submittedBy` 从不写入 `reviewerProjectMembershipId`；历史 reviewer 保持 `NULL` 并产生 `MIG-REVIEWER-UNKNOWN`。
- resume 复核同 run 的版本、基线、source/manifest/configuration checksum；rerun 必须显式引用终态 parent run；recovery 必须显式给出 runId，可选 checkpointKey，并且只处理 checkpoint 中记录的本 run 新增 target id。
- BLOCKING anomaly 在任何业务批次前形成 failed checkpoint 和 failed run，不能进入 completed。

## 3. 可运行命令

```bash
pnpm test:v33-a2-backfill
pnpm migrate:v33-a2-backfill -- --report-dir artifacts/v33-a2-migration
pnpm migrate:v33-a2-backfill -- --resume <migrationRunId>
pnpm migrate:v33-a2-backfill -- --rerun <parentMigrationRunId>
pnpm migrate:v33-a2-backfill -- --recovery <targetMigrationRunId> [--checkpoint <checkpointKey>]
```

CLI 仅接受 `localhost`/`127.0.0.1`/`::1` 且库名包含 `v33a2_empty`、`v33_a2_empty` 或 `test_v33a2` 的显式 `DATABASE_URL`。未设置时零连接退出并生成环境阻断报告。

## 4. 测试结果

| 门禁 | 结果 |
|---|---|
| `pnpm check` | PASS |
| `pnpm lint` | PASS，0 warning |
| `pnpm check:money:v330` | PASS，30 discovered / 30 registered |
| `pnpm test:v33-a2-backfill` | PASS |
| CLI 无数据库安全分支 | PASS，生成 JSON/Markdown `BLOCKED_BY_ENVIRONMENT` 报告 |
| MySQL DB-EMPTY 集成实跑 | BLOCKED_BY_ENVIRONMENT：未设置 `DATABASE_URL` |

专项测试覆盖 consumer 幂等、engineer/merchant profile、认证/材料/动作、状态冲突最小权限、owner=engineer、未知后台角色、reviewer 禁止映射、detail 敏感键拒绝、BLOCKING 失败、checkpoint resume、failed run rerun、显式 checkpoint recovery、501 行拆为 500+1 两批，以及 JSON/Markdown 计数一致。

## 5. 已知问题与后续门禁

- MySQL store 已完成静态编译，但尚未在安全 DB-EMPTY 上执行，因此数据库字段驱动兼容、事务锁、FK 下游引用失败路径和真实 affectedRows 仍需统一环境验收。
- 当前源码包没有 `.git`；本轮未创建临时仓库，也未提交或推送。
- 本报告不声称生产或共享数据库迁移成功；未连接生产数据库。

## 6. 阶段结论

A2.3 已具备代码级开工交付：runner、CLI、报告器和合成测试可运行。进入 A3 的代码前置条件已具备，但数据库集成验收仍是 A6/统一环境的待办；按本任务停止条件，本轮不进入 A3。
