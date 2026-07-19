Document Status: ACTIVE
Spec Version: 1.0.0
Updated At: 2026-07-19
Parent Stage: V3.3-A / A2.0

# V3.3-A / A2 备份、恢复与测试数据库计划

## 1. 目标与边界

本计划适用于 A2.1—A2.5。A2.0 只冻结设计，本轮未备份、未恢复、未创建数据库、未执行 DDL/DML。

核心事实：MySQL DDL 会隐式提交，普通事务不能回滚已经成功的 `CREATE/ALTER TABLE`。因此“当前批次事务回滚”只适用于 DML；DDL 失败必须停在 checkpoint，通过补偿迁移或整库备份恢复处理，不得声称自动回滚成功。

所有数据库工具使用独立的 `--defaults-extra-file` 或 secret store；命令、日志和报告不得出现 URL、用户名或口令。备份目录使用相对路径 `backups/v33-a2/<migrationRunId>/`，不得提交版本库。

## 2. 角色与权限

| 角色 | 权限 | 禁止 |
|---|---|---|
| preflight reader | SELECT、SHOW VIEW、PROCESS 的最小必要子集；information_schema 可读 | INSERT/UPDATE/DELETE/DDL/FILE |
| backup operator | 一致性导出、读取 metadata、必要锁权限 | 业务写、Schema 修改 |
| migration runner | 仅目标 schema 的冻结 DDL/DML；GET_LOCK | 全局权限、其他 schema、关闭 FK 检查 |
| recovery operator | 经双人确认执行指定 run/checkpoint 恢复 | 隐式“最近一次”目标、跨 run 删除 |
| verifier | SELECT/SHOW/DESCRIBE | 任意写入 |

生产 migration runner 与应用账号必须分离。生产执行 M08/M11 需要一名执行人和一名复核人共同确认备份 checksum、目标 schema、runId 和维护窗。

## 3. 迁移前备份包

### 3.1 目录结构

```text
backups/v33-a2/<migrationRunId>/
  manifest.json
  schema.sql
  full.sql.zst
  critical/
    users.sql.zst
    user_profiles.sql.zst
    engineer_profiles.sql.zst
    merchant_profiles.sql.zst
    projects.sql.zst
    milestones.sql.zst
    project_files.sql.zst
    project_acceptances.sql.zst
    identity_verifications.sql.zst
    engineer_verifications.sql.zst
    merchant_verifications.sql.zst
    verification_documents.sql.zst
    verification_actions.sql.zst
    migration_anomalies.sql.zst
  metadata/
    server.json
    tables.json
    columns.json
    indexes.json
    foreign_keys.json
    row_counts.json
    distributions.json
    orphan_checks.json
  source/
    migrations.sha256
    schema.sha256
    seed-manifest.json
```

`backups/` 必须在忽略规则内并由受控存储接管；本地临时副本完成上传和恢复校验后按保留策略清理。

### 3.2 必备导出

1. 结构导出：`mysqldump --no-data --routines --triggers --events --single-transaction`。
2. 完整逻辑备份：`mysqldump --single-transaction --quick --hex-blob --routines --triggers --events --set-gtid-purged=OFF`，随后压缩。
3. 关键表单独导出：上表清单；使用一致 snapshot，不得分别取得不同时点数据。
4. 若生产使用物理备份/PITR，还需记录 binlog file/position 或 GTID set；逻辑备份仍作为可审计兜底。
5. 每个文件记录 bytes、SHA-256、创建时间、server/database 标识摘要；完成一次隔离恢复验证后才视为有效备份。

命令模板不得内嵌凭证：

```bash
mysqldump --defaults-extra-file="$DB_CLIENT_CNF" --single-transaction --quick \
  --routines --triggers --events --set-gtid-purged=OFF "$DB_NAME" > schema-and-data.sql
```

实际完整备份与 schema-only 分开生成；示例只说明凭证边界，不是本轮执行结果。

### 3.3 源码和迁移基线

必须记录：

- `drizzle/schema.ts` SHA-256；A2.0 静态值为 `41a0d9856125bce7594c207d10923e5f13723238eef79dac9fe88d08522737f0`。
- 0000—0014 每文件 bytes/SHA-256 和聚合 sourceChecksum；A2.0 聚合值为 `ab799d4d12573da833d484492385425758f0f954a50c2dd1a9abeba7122b9952`。
- `drizzle/meta/_journal.json` 和实库 `__drizzle_migrations` 行数/hash 对账。
- A1.1 canonical seed manifest 及 `manifestChecksum`。
- package lock hash、Drizzle Kit/MySQL driver 版本；不以未锁定的全局 CLI 执行。

任何一项变化都创建新的 run，不复用旧 migrationRunId。

### 3.4 数据库元数据

备份前以只读查询记录：

- `VERSION()`、version comment；精确 patch 版本必须为 8.0.34 或更高受测 8.0.x。
- database/server character set、collation、sql_mode、time_zone、InnoDB default row format。
- 表/列/索引/FK/CHECK/engine 清单；SHOW CREATE TABLE 摘要 hash。
- 应用表数、journal 表、关键表实际行数、data_length/index_length。
- metadata lock、长事务、复制延迟、可用磁盘和备份耗时。

### 3.5 关键计数和分布

只输出聚合值，不输出 actor ID 或明文内容：

- users 总数与 role/accountStatus 分布；currentRole/engineerStatus/merchantStatus 分布。
- engineer/merchant profile 数量及 user orphan 数。
- 三套 verification 状态分布、profile/verification 状态冲突数。
- verification document/action 数量与多态 orphan 数。
- projects 总数、状态分布、owner/engineer orphan、owner=engineer 数量。
- milestones/project_files/project_acceptances 数量和状态/结果分布。
- project file uploader 不属于旧 owner/engineer 的数量。
- acceptance submittedBy 与 owner/engineer/other/orphan 的聚合关系。
- migration anomaly 行数、version/code/resolution 分布；不读取 detail 值。

## 4. 迁移前一致性和孤儿检查

所有检查必须保存查询版本、执行时间、行数和结果 checksum：

| 检查 | 允许值 | 非零处理 |
|---|---:|---|
| users 主键/唯一冲突 | 0 | BLOCKING |
| profile -> users orphan | 0 | BLOCKING |
| verification -> users/reviewer orphan | 0 | BLOCKING |
| verification document/action 多态 orphan | 0 | BLOCKING |
| projects owner/engineer orphan | 0 | BLOCKING |
| project_files project/uploader orphan | project orphan=0；非旧参与者单列复核 | orphan BLOCKING；参与者差异 WARNING |
| acceptance project/milestone/submittedBy orphan | 0 | BLOCKING；reviewer 仍不推断 |
| migration journal count/hash | 15 且全部匹配 | BLOCKING |
| source/manifest checksum | 精确匹配 | BLOCKING |
| 旧 anomaly 未登记代码 | 0 | 映射前 BLOCKING |

## 5. 恢复触发条件

出现任一项立即停止当前 run：

1. source baseline、Schema 或 journal checksum 不一致；
2. seed manifest/checksum 不一致；
3. 任一 BLOCKING anomaly；
4. 检出跨组织/跨项目关系；
5. consumer 身份缺失或重复；
6. project owner/engineer 无法唯一映射；
7. 认证材料/动作孤儿；
8. 任一组合 unique/FK/CHECK 无法建立或未 enforced；
9. processed 与 succeeded+failed+skipped 不闭合；
10. checkpoint checksum/cursor 不一致；
11. lock timeout/deadlock 重试 3 次耗尽；
12. backup restore、resume、rerun、checkpoint recovery 或整库恢复演练失败；
13. 迁移 detail/日志发现敏感明文；
14. MySQL 静默把期望 INSTANT/INPLACE 降为 COPY，或维护窗不足。

BLOCKING 后当前 checkpoint=failed、run=failed、failedAt/code 写入；不得继续 mutation，不得标 completed。

## 6. 五级恢复模型

### Level 1：当前批次事务回滚

适用：M09/M10/M12 的单个 DML 批次，在事务提交前失败。

- 回滚整个最多 500 行事务；checkpoint cursor 不推进。
- anomaly 与业务写必须同事务，或采用能证明一致性的 outbox 顺序。
- DDL 不适用此级；已提交 DDL 不得宣称已回滚。

### Level 2：同 run resume

适用：run 仍为 running、heartbeat 超过 120 秒、没有 BLOCKING，进程崩溃或连接中断。

1. 取得 run/checkpoint 行锁和 migration named lock。
2. 验证 migrationVersion/source/manifest/configuration checksum。
3. 从最后 completed checkpoint 后继续；running 批次按旧 cursor 整批重放。
4. failed/aborted/completed run 禁止 resume。

### Level 3：新 run rerun

适用：源 run 已 failed/aborted/completed，问题已解决或需要全量再验证。

- 创建新 migrationRunId，runMode=rerun，parent 指向源 run。
- 新建独立 checkpoints；原 run/anomaly 不修改、不删除。
- 通过 legacy keys、模式 A 稳定键和 activeDedupeKey 跳过成功事实。
- 未解决 BLOCKING 不得让新 run completed。

### Level 4：指定 checkpoint recovery

适用：需要撤销某个 run 的一个已提交 DML 范围。

- 必须同时给出目标 migrationRunId、唯一 checkpointKey 和 checksum。
- 仅处理 `(rangeStartExclusive,rangeEndInclusive]` 且 `migrationRunId=target` 的回填记录。
- 按依赖逆序锁行；有下游业务引用时写 `MIG-DOWNSTREAM-REFERENCE-PRESENT`，只终结、不硬删。
- 目录种子不删除；只验证 manifest。旧表事实不反向覆盖。
- DDL 不通过此级删除；用补偿迁移或 Level 5。

### Level 5：整库备份恢复

触发：DDL 错误/部分成功无法安全补偿、广泛数据污染、FK/CHECK 添加造成不可接受影响，或恢复演练要求。

1. 停止应用写入和 migration job，记录失败 run/最后 binlog 点。
2. 在隔离实例验证备份 SHA-256 并恢复；不要直接覆盖唯一副本。
3. 恢复 schema、数据、routines/triggers/events；核对 journal、表数、关键计数和分布。
4. 如使用 PITR，回放到 migration 前已批准位置；不回放失败 A2 DDL/DML。
5. 运行只读 preflight 和业务只读烟测；双人批准后切换。

## 7. DDL 失败矩阵

| 失败位置 | 可保留 | 必须处理 |
|---|---|---|
| M01 新 runs/checkpoints 创建中 | 已成功空表可由补偿迁移处理 | 不得重复执行原 SQL；确认 journal/SHOW CREATE |
| anomaly nullable 列已加、回填未完 | 保持 nullable，run failed | resume/rerun 回填；未验证前不收紧 |
| anomaly NOT NULL/FK/unique 添加失败 | 已成功约束保留 | 修数据后新迁移补余下约束；必要时 Level 5 |
| M02—M07 新表中断 | 已成功空表保留 | journal 不得误记整个单元完成；补偿/后续文件 |
| M08 已加列、index 失败 | 列保留 | 不删列；新迁移加 index；超过窗口则 Level 5 |
| M11 部分 CFK 成功 | 已成功 CFK 保留 | 记录每条 checkpoint；修复后仅补未完成项 |

## 8. 恢复验收

每一级恢复都必须验证：

- 0000—0014 SHA-256 未变化，journal 顺序未伪造；
- 69 张基线应用表和预期 A2 表/列数量与目标恢复点一致；
- 关键计数闭合，无新 orphan/跨范围关系；
- 旧金额列和值、状态和时间事实未改变；
- reviewer 未由 submittedBy 自动生成；
- anomaly detail 无敏感明文；
- 应用只读查询、文件授权和资金只读 smoke test 通过；
- 恢复报告包含 runId/checkpoint、操作者角色、起止时间、checksum 和决策，不含凭证/敏感字段。

## 9. 保留与销毁

- 备份保留周期由生产数据保留政策决定；A2 不自行缩短。
- manifest、checksum、迁移/恢复报告和 anomaly 永久审计保留。
- 临时解压副本、client config 和测试恢复库在验收后按批准流程销毁；先确认目标路径和数据库 allowlist。
- 删除动作必须可审计；不得使用未解析变量、宽目录或默认 schema。

## 10. A2.1 前置清单

- [ ] 可认证的只读基线连接，preflight JSON/Markdown 已归档。
- [ ] 隔离 DB-EMPTY，精确 MySQL patch/charset/collation/sql_mode 已记录。
- [ ] package lock 对应依赖已恢复，未改版本。
- [ ] 备份包已生成、SHA-256 已验证、隔离恢复成功。
- [ ] source/schema/manifest checksum 一致。
- [ ] legacy anomaly code 映射覆盖实库全部代码。
- [ ] M01 SQL 已独立审查，未修改 0000—0014。
- [ ] DDL 维护窗、lock wait、磁盘与责任人已批准。

任一项未完成，不启动 A2.1。
