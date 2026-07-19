Document Status: IMPLEMENTED_WITH_ENVIRONMENT_BLOCK
Spec Version: 1.0.0
Updated At: 2026-07-19
Parent Stage: V3.3-A / A2.1

# V3.3-A / A2.1 实施报告

## 1. 审查结论

A2-M01、A2-M02、A2-M09 的 Schema、0015—0020 追加迁移、冻结目录数据、执行脚本和专项静态测试已完成。0000—0014 的字节数与 SHA-256 保持 A2.0 基线，`pnpm-lock.yaml` 未改变，未修改业务表、API、权限中间件、页面、金额逻辑或历史回填。

当前没有显式 `DATABASE_URL`，因此脚本按安全门禁拒绝连接名称不明的本机 MySQL。DB-EMPTY 实测状态为 `BLOCKED_BY_ENVIRONMENT`，不能将本轮标记为数据库迁移已通过，也暂不放行 A2.2。

## 2. 实际修改文件

- Schema 与迁移元数据：[schema.ts](../../../drizzle/schema.ts)、[_journal.json](../../../drizzle/meta/_journal.json)、`0015_snapshot.json`—`0020_snapshot.json`。
- 追加迁移：[0015](../../../drizzle/0015_v33_a2_migration_runs_checkpoints.sql)、[0016](../../../drizzle/0016_v33_a2_anomalies_additive.sql)、[0017](../../../drizzle/0017_v33_a2_anomalies_backfill_constraints.sql)、[0018](../../../drizzle/0018_v33_a2_identity_certification_directories.sql)、[0019](../../../drizzle/0019_v33_a2_capability_project_role_directories.sql)、[0020](../../../drizzle/0020_v33_a2_frozen_directory_seeds.sql)。
- 冻结数据：[manifest](../../../drizzle/seeds/v33-a2-directory-manifest.json)、[manifest SHA](../../../drizzle/seeds/v33-a2-directory-manifest.sha256)、[seed data](../../../drizzle/seeds/v33-a2-directory-seeds.json)、[seed data SHA](../../../drizzle/seeds/v33-a2-directory-seeds.sha256)。
- 实现与测试：[共享契约](../../../scripts/lib/v33-a2-contract.mjs)、[目录种子](../../../scripts/seed-v33-a2-directories.mjs)、[Schema 检查](../../../scripts/check-v33-a2-schema.mjs)、[基础设施测试](../../../scripts/test-v33-a2-infrastructure.mjs)、[种子测试](../../../scripts/test-v33-a2-seeds.mjs)、[空库测试](../../../scripts/test-v33-a2-empty-db.mjs)。
- 执行命令：[package.json](../../../package.json) 仅增加 A2.1 检查、测试和种子脚本。

## 3. 新增迁移文件及顺序

| 顺序 | 文件 | 停止点 |
|---|---|---|
| 0015 | `v33_a2_migration_runs_checkpoints` | 先建 `migration_runs`，再建 `migration_checkpoints`，随后添加 FK/索引/CHECK |
| 0016 | `v33_a2_anomalies_additive` | 只给原 `migration_anomalies` 增加 9 个可空列，不删表、不重建、不收紧 |
| 0017 | `v33_a2_anomalies_backfill_constraints` | 建专用 legacy import run、回填、校验、条件终态，再收紧 NOT NULL/FK/CHECK/UNIQUE |
| 0018 | `v33_a2_identity_certification_directories` | 建 `identity_types`、`certification_types` |
| 0019 | `v33_a2_capability_project_role_directories` | 建 `capabilities`、`project_roles` |
| 0020 | `v33_a2_frozen_directory_seeds` | 写入冻结目录，执行定义漂移和数量守卫 |

Drizzle journal 从 idx 0—14 连续追加到 15—20；实际采用 6 个文件，与规范建议的停止点完全一致。

## 4. Schema 新增表

本批新增 6 张表：2 张迁移基础设施表和 4 张目录表。

- `migration_runs`：25 列、4 个索引/唯一约束、2 个 FK，并包含父 run、计数恒等式和终态时间 CHECK。
- `migration_checkpoints`：24 列、3 个索引/唯一约束、1 个 FK，并包含批次范围与计数 CHECK。
- `identity_types`：10 列；`UNIQUE(code)` 和状态/软删除索引。
- `certification_types`：12 列；`UNIQUE(code)` 和主体/状态索引。
- `capabilities`：11 列；code 主键、自引用 replacement FK 和领域/状态索引。
- `project_roles`：8 列；code 主键、状态和软删除字段。

最终 Schema 表数为 75：69 张基线应用表 + 6 张 A2.1 新表。`migration_anomalies` 只做原表升级，不重复计表。

## 5. anomaly 升级步骤

1. 0016 给原表追加 `migrationRunId`、`checkpointKey`、`severity`、`fingerprint`、`handling`、`status`、`detailChecksum`、`resolvedByAccountId`、`resolutionNote`，全部先允许空值。
2. 0017 建立符合 A1.1 格式的专用 run：`v33a2-20260719T000000000Z-8eb607c9930b`；`migrationVersion=v3.3-a2.0.0`，`sourceBaseline=v3.2.4+migrations-0000-0014`。
3. 冻结旧代码映射：`orphan_user` 和 `missing_item` 为 `BLOCKING/ABORT_RUN`；`cancelled_default_idle` 为 `INFO/CONTINUE/resolved`；`missing_valid_mode` 为 `WARNING/MIN_PRIVILEGE`；未登记代码为 `BLOCKING/ABORT_RUN`。
4. `detailChecksum` 和 fingerprint 以确定性 SHA-256 回填；原 id、migrationVersion、entityType/entityId、code、detail、resolvedAt、createdAt 不改写。
5. 临时 CHECK guard 验证必填值与 fingerprint 唯一性。存在 BLOCKING 时专用 run 进入 `failed` 并写冻结 failure code，绝不进入 `completed`；零 BLOCKING 时才完成。
6. 最后收紧 6 个 NOT NULL、2 个 FK、1 个唯一约束、2 个新增索引和 BLOCKING/ABORT_RUN CHECK。

## 6. 种子数量与 checksum

| 项目 | 冻结值 |
|---|---|
| manifestVersion | `v3.3-a2-seed-1` |
| migrationVersion | `v3.3-a2.0.0` |
| canonical manifest SHA-256 | `95d0178c6e304247b4ba9d7370f21831026e7b6e08e93aaec7bebd9ecb2fb983` |
| seed data SHA-256 | `bcf102f7d379424bba5e8dd025c3e5563531111489097c162716c6b3b4a348bb` |
| identity types | 10 |
| certification types | 3 |
| capabilities | 68 |
| project roles | 9 |

manifest 保持 A1.1 的 canonical JSON 和两个规范源文件 SHA；90 条实现定义独立冻结并另有 checksum。0020 与运行时种子都只接受语义字段逐字节一致的重复 code；定义变化会产生 BLOCKING/ABORT_RUN，而不是覆盖。manifest、seed data 或规范源 SHA 任一不匹配也产生 BLOCKING 结果。manifest 计算不使用随机值、当前时间或 requestId。

## 7. DB-EMPTY MySQL 版本与迁移结果

- 本机仅确认 MySQL 客户端为 `8.0.41`；这不是 DB-EMPTY 服务器版本证据。
- 因未设置显式安全 `DATABASE_URL`，DB-EMPTY 服务器精确版本：`BLOCKED_BY_ENVIRONMENT / 未取得`。
- 第一次空库迁移（0000—0014 得到 69 表，再应用 0015—0020）：`BLOCKED_BY_ENVIRONMENT / 未执行`。
- 第二次 migrate 与无重复验证：`BLOCKED_BY_ENVIRONMENT / 未执行`。
- 脚本只接受本机 host，且数据库名必须包含 `v33a2_empty`、`v33_a2_empty` 或 `test_v33a2`；空库名、production/prod/main/shenghuobang、远程 host 和未设置 URL 均被拒绝。脚本不会自动清空非空库。

## 8. 测试结果

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile` | PASS；lock SHA 前后均为 `5ac4ee467bc7ab7f8e243c3fa24d4048a5165b6e2462bd699c1e022f1854fd54` |
| `node scripts/check-v33-a1-specs.mjs` | PASS；9 assertions，0 issues |
| `pnpm validate:product-specs` | PASS |
| `pnpm check:markdown-links` | PASS；99 文件、108 条本地链接 |
| `pnpm check:money:v330` | PASS；30/30 |
| `pnpm check:v33-a2-schema` | PASS；75 表、0015—0020、journal 21、A2.0 基线 hash、快照列/索引/FK |
| `pnpm test:v33-a2-infrastructure` | PASS；5 类旧代码、8 个保留字段、幂等 fingerprint、BLOCKING run 失败 |
| `pnpm test:v33-a2-seeds` | PASS；10/3/68/9、hash mutation、第二次零增量、定义漂移阻断、安全 URL 门禁 |
| `pnpm test:v33-a2-empty-db` | `BLOCKED_BY_ENVIRONMENT`；未连接任何数据库 |
| `pnpm check` | PASS |
| `pnpm lint` | PASS，0 warning |
| `pnpm test` | 79 PASS、1 环境失败；唯一失败为源码包无 `.git` 时 `source-archive.test.ts` 调用 `git ls-tree` |

## 9. 未执行项

- 未连接生产库、共享开发库或名称不明数据库。
- 未执行 DB-EMPTY 的第一次和第二次 migrate，也未伪造 MySQL 服务器版本或迁移成功。
- 未执行历史身份/认证/项目回填，未创建 consumer 身份，未修改 6 张现有业务表或添加 13 条组合 FK。
- 未修改 API、权限中间件、客户端页面、金额逻辑，未进入 A2.2，未提交或推送 GitHub。

## 10. A2.2 放行结论

**暂不具备进入 A2.2 的完整条件。** 代码与静态契约已具备，但必须先提供一个显式、隔离、可写、初始为空且名称通过门禁的 MySQL 8.0.34+ 8.0.x `DATABASE_URL`，完成 0000—0014 的 69 表验证、A2.1 第一次迁移、第二次 migrate 零增量和目录数量检查。完成后应更新本报告的环境阻断项，再接受审查；本轮不会自动进入 A2.2。

## 11. 当前工作区状态

- 源码包没有 `.git`，无法提供可靠的 `git status` 或 diff；未创建仓库、未提交、未推送。
- 0000—0014 与 A2.0 字节/hash 基线一致；`pnpm-lock.yaml` 未改变。
- 依赖已按 frozen lockfile 恢复；当前工作区包含本报告第 2 节列出的 A2.1 代码、迁移、快照、种子和测试文件。
- A2.1 状态：`IMPLEMENTED_STATICALLY / DB_EMPTY_BLOCKED_BY_ENVIRONMENT / STOPPED_BEFORE_A2.2`。
