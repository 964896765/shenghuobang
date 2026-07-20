# V3.3 RC1.1 Database Remediation Report

## Git 基线
- 分支：`codex/v3.3-rc1-validation`
- 起始 HEAD：`0e0838caf74955b92901a8c8bfbbd8852a0b92c3`
- 任务范围：仅修复 MySQL 迁移兼容、数据库验证基础设施与相关回归，不开发新业务功能，不执行 Android 真机任务。
- PR / main / tag：均未创建、未合并、未打标签。

## MySQL 环境
- 结果：`PASS`
- 数据库引擎：MySQL `8.0.45`
- 隔离地址：`127.0.0.1:3307`
- 主库：`shenghuobang_v33_rc1`
- 恢复库：`shenghuobang_v33_rc1_restore`
- 凭据：仅保存在本地 `artifacts/v3.3-rc1/rc1-db.env`，未写入 Git、报告正文或命令输出。

## 0015 根因
- 结果：`PASS`
- 失败迁移：`drizzle/0015_v33_a2_migration_runs_checkpoints.sql`
- 真实失败表达式：

```sql
`updatedAt` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
```

- MySQL 8.0.45 返回：`ER_INVALID_ON_UPDATE`
- 根因结论：
  - `updatedAt` 的目标类型应保持 `timestamp(3)`；
  - 该列需要毫秒精度；
  - 默认值和 `ON UPDATE` 精度必须一致；
  - 原 SQL 的 `DEFAULT (now())` 与秒级 `ON UPDATE CURRENT_TIMESTAMP` 组合不满足 MySQL 8.0.45 对 `timestamp(3)` 的兼容要求。
- 最终 SQL：

```sql
`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
`updatedAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
```

- 同步修正：
  - `drizzle/schema.ts` 语义保持 `timestamp(3)` 毫秒精度；
  - `drizzle/meta/0015_snapshot.json` 改为同语义的 `CURRENT_TIMESTAMP(3)`；
  - 真实 MySQL 校验 `createdAt` 更新不变、`updatedAt` 更新递增。

## 历史迁移修改策略
- 结果：`PASS`
- 检索范围：
  - `docs/execution/`
  - 当前仓库所有 Markdown 报告
  - RC1 失败报告与 A2 实施报告
- 检索结论：
  - 找到 `A2_1_IMPLEMENTATION_REPORT.md` 中对 `0015` 的设计说明；
  - 找到 `V3_3_RC1_VALIDATION_REPORT.md` 中对 `0015` 失败的记录；
  - 未发现任何可信的正式发布、共享数据库或生产数据库已经成功应用“原始 0015 SQL”的记录。
- 处理结论：
  - 允许对 `0015` 做最小兼容修正；
  - 不改动 `0000—0014` 与 `0016—0032` 的业务语义；
  - 额外修复仅限 MySQL 兼容层与测试基础设施，包括外键名长度、journal 缺项、连接策略与恢复对账。

## 修改前后 SQL
- `0015` 修复前：

```sql
`createdAt` timestamp(3) NOT NULL DEFAULT (now()),
`updatedAt` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
```

- `0015` 修复后：

```sql
`createdAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
`updatedAt` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
```

- 相关 MySQL 兼容窄修：
  - 历史迁移中过长的外键名缩短到 MySQL 64 字符限制以内；
  - `0031` 中 capability seed 的 `ON DUPLICATE KEY UPDATE` 语法改为 MySQL 8 可执行且语义等价的列更新形式；
  - `drizzle/meta/_journal.json` 补齐 `0031`、`0032` 条目，确保 journal 与 SQL 文件一致。

## 数据库连接策略
- 结果：`PASS`
- 新增公共解析器：`scripts/lib/mysql-test-config.mjs`
- 统一规则：
  - 首选 `DATABASE_URL`
  - 可显式接受完整的 `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE`
  - 管理员连接优先支持 `MYSQL_INTEGRATION_URL`
  - 不再保留 `root/password@localhost:3306` 默认回退
  - 未提供完整安全连接信息时 fail closed
  - 不自动连接未知、共享或生产数据库
  - 日志只输出脱敏后的 host / port / database 摘要
- 已改造脚本：
  - `pnpm test:v33-a2-empty-db`
  - `pnpm test:integration:mysql`
  - `pnpm test:integration:v32`
  - `pnpm test:location:mysql`
  - `pnpm test:migrations:empty`
  - `pnpm check:v33-a2-business-schema`
  - 以及其余仍依赖旧默认凭据的 MySQL 测试/种子脚本

## 安全库名规则
- 结果：`PASS`
- 安全校验保留，未删除。
- 允许的本地隔离库示例：
  - `shenghuobang_v33_rc1`
  - `shenghuobang_v33_rc1_restore`
  - 含 `test` / `rc` / `empty` / `restore` 明确标识的本地测试库
- 仍然拒绝：
  - 非本地 / 非容器测试主机
  - 含 `production` / `prod` / `main` / `live` 的库名
  - 未显式提供 `DATABASE_URL` 的 destructive 测试
- `pnpm test:v33-a2-empty-db` 现在会先输出脱敏的安全检查摘要，再执行 destructive 操作。

## Journal 与业务 Schema 检查
- 结果：`PASS`
- `drizzle/meta/_journal.json` 当前真实条目数：`33`
- `0000—0032` SQL 文件、journal 与 snapshot 已重新核对：
  - 无缺失条目
  - 无重复 tag
  - 无顺序错误
  - 无孤立 SQL
- `pnpm check:v33-a2-business-schema` 已改为基于 journal 事实动态计算迁移数量，不再硬编码固定条目数。
- 新增防漂移策略：
  - SQL 文件与 journal tag 双向对账
  - schema 表定义与 snapshot 表数动态比对

## 空库迁移与重复迁移
- 结果：`PASS`
- 主库空库迁移：
  - `0000—0032` 全部在 MySQL 8.0.45 执行成功
  - `__drizzle_migrations` 记录数：`33`
  - 应用表数量：`107`
- A2 空库回归：
  - `pnpm test:v33-a2-empty-db`：`PASS`
  - 基线 `0000—0014` 表数与 `0014_snapshot.json` 对齐
  - 全量迁移后表数与 `drizzle/schema.ts` 对齐
- 重复迁移：
  - `pnpm test:v33-a2-empty-db` 第二次 migrate 零增量：`PASS`
  - `pnpm test:migrations:empty`：`PASS`

## 表结构验收
- 结果：`PASS`
- 验收内容：
  - 表、列、索引、唯一键、外键可完整创建
  - `migration_runs` / `migration_checkpoints` 的 `createdAt` / `updatedAt` 保持 `timestamp(3)` 毫秒精度
  - `updatedAt` 的 `DEFAULT` 与 `ON UPDATE` 精度一致
  - `migration_anomalies` 新约束已在空库迁移后落地
- 真实 MySQL 回归：
  - `pnpm test:v33-rc11:mysql-remediation`：`PASS`
  - 校验项：DDL、列精度、journal 数量、`createdAt` 稳定、`updatedAt` 递增

## 备份恢复
- 结果：`PASS`
- 执行步骤：
  - 从主库 `shenghuobang_v33_rc1` 导出最小备份
  - 重建恢复库 `shenghuobang_v33_rc1_restore`
  - 导入恢复库后进行结构与关键种子对账
- 对账结果：
  - 表数：主库 `107` / 恢复库 `107`
  - `__drizzle_migrations`：主库 `33` / 恢复库 `33`
  - 关键表计数一致：
    - `users`: `6`
    - `capabilities`: `98`
    - `identity_types`: `10`
    - `certification_types`: `3`
    - `project_roles`: `9`
    - `migration_runs`: `1`
    - `migration_checkpoints`: `0`
  - 关键表 DDL 归一化后完全一致：
    - `capabilities`
    - `identity_types`
    - `certification_types`
    - `project_roles`
    - `migration_runs`
    - `migration_checkpoints`
- 专项脚本：`node scripts/test-v33-rc11-restore-reconcile.mjs`

## A / B 真实 MySQL 测试
- 结果：`PASS`
- 真实 MySQL 8.0.45 已通过：
  - `pnpm test:v33-a2-empty-db`
  - `pnpm test:v33-rc11:mysql-remediation`
  - `pnpm test:migrations:empty`
  - `pnpm test:integration:mysql`
  - `pnpm test:integration:v32`
  - `pnpm test:location:mysql`
  - `pnpm db:seed`
  - `pnpm test:v33-a2-seeds`
  - `pnpm check:v33-a2-business-schema`
  - `pnpm exec vitest run tests/v321-security.test.ts`
- 真实 MySQL 覆盖到的核心链路：
  - 身份与组织基础迁移、升级与修复
  - 位置与基础目录数据
  - 设计版本 / 原型里程碑相关迁移、升级与运行时链路
  - 文件签名访问、撤权后拒绝、错误数据库启动失败、WebSocket 访问控制
  - `requestId` / 修复记录 / 重复迁移零增量
- 阶段专项脚本状态：
  - `A4/A5/B1/B2/B3` 现有阶段脚本继续 `PASS`
  - 其中部分脚本本身仍以 synthetic / contract 断言为主；本次 RC1.1 的真实 MySQL 结论以空库迁移、v31/v32 集成、位置集成、运行时安全链路、恢复对账与专项 remediation 脚本为准，未将 synthetic PASS 冒充为数据库实测。

## 全量非真机门禁
- 结果：`PASS`
- `pnpm check`：`PASS`
- `pnpm lint`：`PASS`
- `pnpm check:money:v330`：`PASS`
- `pnpm build`：`PASS`
- `pnpm build:web`：`PASS`
- 本轮未执行 Android SDK 安装、EAS Build 或真机验收，符合 RC1.1 任务边界。

## 未解决问题
- `Android`：`BLOCKED_BY_SCOPE`
  - RC1.1 明确禁止执行 Android 真机任务；
  - 真机验收留待 RC1.2。
- 当前未发现阻断 RC1.1 数据库门禁关闭的 P0 / P1 数据库问题。

## 结论
- 是否完成 RC1.1 数据库修复：`是`
- 是否满足“空库迁移 / 重复迁移 / journal 对账 / 备份恢复 / 非真机门禁”要求：`是`
- 是否允许进入 RC1.2 Android 验收：`是`
- 是否允许在 RC1.1 阶段创建 PR / 合并 main / 打标签：`否`
