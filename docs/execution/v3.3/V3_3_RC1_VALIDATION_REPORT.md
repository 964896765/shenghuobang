# V3.3 RC1 Validation Report

## Git 基线
- 起始分支：`codex/v3.3-b3-acceptance-intent`
- 起始业务提交：`31650a9b7c92e1f48a23709d7be45a7ced60c936`
- 文档补记提交：`0198d5b78712ea363e4675d0dc010e3fa76c198a`
- RC 验证分支：`codex/v3.3-rc1-validation`
- PR：未创建
- Tag：未创建

## MySQL 环境
- 结果：`FAIL`
- 环境选择：使用项目专用 Docker MySQL，而不是连接未知本机实例或共享库。
- 服务版本：MySQL `8.0.45`
- 宿主访问：`127.0.0.1:3307`
- 隔离数据库：
  - 主库：`shenghuobang_v33_rc1`
  - 恢复库：`shenghuobang_v33_rc1_restore`
- 独立账号：已创建，仅用于 RC1 本地验证。
- 密码：仅保存在本地 `artifacts/v3.3-rc1/rc1-db.env`，未写入 Git、日志摘要或报告正文。

## 迁移 0000—0032
- 结果：`FAIL`
- 执行命令：`pnpm db:migrate`
- 失败点：`0015_v33_a2_migration_runs_checkpoints.sql`
- 真实错误：`migration_runs.updatedAt timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP`
- MySQL 返回：`ER_INVALID_ON_UPDATE`
- 结论：冻结迁移 SQL 与 MySQL 8.0.45 不兼容，未能完成从 `0000` 到 `0032` 的空库迁移。
- 证据：`artifacts/v3.3-rc1/db-migrate.log`

## 空库迁移
- 结果：`FAIL`
- 主库为空后直接执行迁移，仍在 `0015` 失败。
- 未能进入完整表结构验证、冻结种子和业务真链路验证。

## 重复迁移
- 结果：`BLOCKED`
- 原因：首次迁移未完成，无法进行“重复迁移零增量”验证。

## Journal 一致性
- 结果：`BLOCKED`
- 原因：迁移未完成，不能对比完整 `__drizzle_migrations` 与 `drizzle/meta/_journal.json` 的最终落库状态。
- 补充发现：`pnpm check:v33-a2-business-schema` 额外失败，报错“Expected 30 journal entries, found 31”，说明冻结检查脚本自身也存在基线漂移。

## 表 / 索引 / 唯一键 / 外键
- 结果：`BLOCKED`
- 原因：迁移未完成，无法对最终结构执行可靠验收。

## 冻结种子
- 通用 `db:seed`：`PASS`
- A2 冻结种子契约：`PASS`
- 但由于迁移未完整完成，`db:seed` 的结果不能视为完整 RC 数据库验收结论。

## 备份与恢复
- 结果：`BLOCKED`
- 原因：主库迁移未成功，不满足最小备份与恢复前提，因此未执行 dump / restore 对比。

## A / B1 / B2 / B3 数据库集成
- 结果：`FAIL/BLOCKED`
- A2 空库脚本：`FAIL`
  - `pnpm test:v33-a2-empty-db` 的安全数据库名校验拒绝 `shenghuobang_v33_rc1`
  - 报错：`Unsafe A2 database name: shenghuobang_v33_rc1`
- 历史 MySQL 集成脚本：`FAIL`
  - `pnpm test:integration:mysql`
  - `pnpm test:integration:v32`
  - `pnpm test:location:mysql`
  - `pnpm test:migrations:empty`
  - 统一失败原因：脚本硬编码 `root:password@localhost:3306`，与当前可用的项目 Docker MySQL `127.0.0.1:3307` 不兼容，并且本机 `MySQL80` 未提供该组凭据。
- B1 / B2 / B3 真实 MySQL 业务主链：`BLOCKED`
  - 原因：冻结迁移未通过，无法在完整结构上进行真实链路回归。

## 后端全量测试
- `pnpm check`：`PASS`
- `pnpm lint`：`PASS`
- `pnpm check:money:v330`：`PASS`
- `pnpm test:v33-a2-infrastructure`：`PASS`
- `pnpm test:v33-a2-seeds`：`PASS`
- `pnpm check:v33-a2-schema`：`PASS`
- `pnpm check:v33-a2-business-schema`：`FAIL`
- `pnpm test:v33-a2-backfill`：`PASS`，但数据库集成为 `BLOCKED_BY_ENVIRONMENT`
- `pnpm test:v33-a3-authorization`：`PASS`
- `pnpm test:v33-a3-routes`：`PASS`
- `pnpm test:v33-a3-integration-fixes`：`PASS`
- `pnpm test:v33-a4-identity-organization`：`PASS`，但数据库集成为 `BLOCKED_BY_ENVIRONMENT`
- `pnpm test:v33-a5-workspace-mobile`：`PASS`，但数据库集成为 `BLOCKED_BY_ENVIRONMENT`
- `pnpm test:v33-b1-idea-service`：`PASS`，但数据库集成为 `BLOCKED_BY_ENVIRONMENT`
- `pnpm test:v33-b1-idea-routes`：`PASS`，但数据库集成为 `BLOCKED_BY_ENVIRONMENT`
- `pnpm test:v33-b1-idea-app`：`PASS`
- `pnpm test:v33-b1-1-collaborator-search`：`PASS`
- `pnpm test:v33-b2-1-design-prototype-backend`：`PASS`
- `pnpm test:v33-b2-2-design-prototype-app`：`PASS`
- `pnpm test:v33-b3-1-acceptance-intent-backend`：`PASS`
- `pnpm test:v33-b3-2-acceptance-intent-app`：`PASS`

## Web Build
- `pnpm build`：`PASS`
- `pnpm build:web`：`PASS`

## Android 设备和系统版本
- 结果：`BLOCKED`
- 本机状态：`adb` 不存在于 PATH，常见 Android SDK 目录下也未发现 `adb.exe`
- 设备信息：不可获取
- 系统版本：不可获取

## 真机业务链路
- 结果：`BLOCKED`
- 原因：
  - 无可用 `adb`
  - 无已连接 Android 设备
  - 未执行真机安装、登录、创意、项目、验收、返工、意向等链路
- 证据目录：`artifacts/v3.3-rc1/`

## 安全验证
- `PASS`：`currentRole` 修改不能增权（A3/B2/B3 合成与契约测试覆盖通过）
- `PASS`：客户端 `accountId/membershipId/status/versionNo` 不被信任（A3/B2/B3 路由与 service 契约覆盖通过）
- `PASS`：协作者搜索不返回内部 ID（B1.1 通过）
- `PASS`：项目意向不泄露私密项目（B3.2 合成测试通过）
- `PASS`：购买意向不创建订单 / 支付 / 库存锁定（B3.1/B3.2 通过）
- `PASS`：合作意向不自动创建 membership（B3.1/B3.2 通过）
- `BLOCKED`：private/NDA 枚举阻断、token 过期拒绝、policyVersion 变化撤权、成员退出后立即失权等真实 MySQL 与真机验证

## 修复项
- 已完成：
  - 补记 `docs/execution/v3.3-b/V3_3_B3_2_APP_REPORT.md` 的业务提交 SHA
  - 单独提交：`docs(v3.3-b3): record app delivery commit`
- 本轮未实施新的业务修复。

## 未解决问题
- P0：`0015_v33_a2_migration_runs_checkpoints.sql` 在 MySQL 8.0.45 上真实迁移失败。
- P1：旧 MySQL 集成脚本硬编码 `localhost:3306 root/password`，无法复用当前安全隔离 Docker 实例。
- P1：`pnpm check:v33-a2-business-schema` 与当前迁移/journal 基线不一致。
- P1：Android SDK / `adb` 与真机设备均缺失，无法完成真机业务闭环。

## 是否允许创建 PR
- 结论：`不允许`
- 原因：满足停止条件
  - MySQL 迁移失败
  - Android 核心链路未验证
  - 全量冻结门禁未全部通过

## 是否允许打 V3.3 标签
- 结论：`不允许`

## 建议下一步
- 先处理冻结迁移 `0015` 的 MySQL 兼容问题，再重新执行空库迁移、重复迁移、备份恢复与 B1/B2/B3 真 MySQL 链路。
- 统一历史 MySQL 集成脚本的连接策略，避免继续硬编码 `localhost:3306 root/password`。
- 安装 Android SDK `platform-tools` 并接入真机后，补做 `artifacts/v3.3-rc1/` 下的业务证据采集。
