Document Status: ACTIVE
Spec Version: 2.1.0
Updated At: 2026-07-19
Parent Stage: V3.3-A / A1.1
Source Baseline: V3.2.4 source package; package version 3.2.4; migrations 0000-0014

# V3.3-A / A1.1 迁移契约与关系一致性修正报告

## 1. 审查结论

**PASS_WITH_ACTIONS**。

A1.1 已关闭迁移契约和关系一致性阻断项，冻结为 **24 张业务基础表、3 张迁移基础设施表、6 张现有表追加字段**，并保持 68 个首批能力、97 条路由迁移条目、16 项敏感字段规则和 9 个状态机。安全测试扩展为 48 项。A2 的规范输入已经具备开工条件；本轮没有创建迁移、修改 Schema、业务 API、页面或产品测试代码。

“WITH_ACTIONS”只保留执行期事实：当前源码包没有 `.git` 元数据，无法执行 `git diff --check` 或证明相对某个 Git commit 的工作树差异；商家资料是否升级组织、旧高权角色拆分等继续按冻结 anomaly/minimum-privilege 规则在 A2 输出人工复核清单，不再是规范缺口。

## 2. 实际检查范围

### 2.1 九份原稿

完整读取 `C:\Users\chejun\Downloads` 下：

`DATA_DICTIONARY.md`、`LEGACY_MIGRATION_MATRIX.md`、`CAPABILITY_CATALOG.md`、`AUTHORIZATION_DECISION_MATRIX.md`、`FIELD_MASKING_MATRIX.md`、`ROUTE_MIGRATION_INVENTORY.md`、`STATE_MACHINES.md`、`SECURITY_TEST_MATRIX.md`、`A1_EXECUTION_REPORT.md`。

原稿作为证据保留未改；修订版落入仓库约定目录 `docs/execution/v3.3-a-a1/`，该目录是后续 A2 的唯一输入。

### 2.2 战略、架构、执行与冻结规范

- `AGENTS.md`、`README.md`、`todo.md`、`design.md`、`package.json`。
- `docs/strategy/SHENGHUOBANG_FINAL_PRODUCT_FORM.md`、`END_STATE_APP_INFORMATION_ARCHITECTURE.md`。
- `docs/architecture/IDENTITY_ORGANIZATION_PERMISSION_ARCHITECTURE.md`、`CORE_DOMAIN_INTEGRATION_BLUEPRINT.md`。
- `docs/execution/DEVELOPMENT_EXECUTION_INDEX.md`、`SHENGHUOBANG_MASTER_DEVELOPMENT_BLUEPRINT.md`、`V3_3_TO_V4_SYSTEMATIC_DEVELOPMENT_PLAN.md`、`MASTER_STAGE_DELIVERY_MATRIX.md`。
- `docs/execution/stages/V3_3_A_IDENTITY_ORG_PERMISSION_FOUNDATION.md`、`V3_3_A_BATCH1_CODEX_TASK.md`。
- V3.2.4 冻结证据：`ROLE_PERMISSION_MATRIX.md`、`PROCEDURE_INVENTORY.md`、`DOMAIN_STATE_MACHINES.md`、`ROUTE_API_TRACEABILITY.md`、`V3_2_4_ACCEPTANCE_BASELINE.md`、相关审查清单。
- 历史事实：`PHASE3_1_CHANGES.md`、`PHASE3_1_1_CHANGES.md`、`PHASE3_1_2_CHANGES.md`、`PHASE3_2_CHANGES.md`。

### 2.3 源码、Schema、迁移和测试

- `drizzle/schema.ts`：扫描到 69 张现有表。
- `drizzle/0000_elite_eternals.sql` 至 `0014_tense_luckman.sql`：15 个迁移；逐文件记录长度、SHA-256 和 DDL/DML 摘要，未修改。
- `server/routers.ts`、`server/routers/admin-router.ts`、`complaint-router.ts`、`finance-router.ts`、`verification-router.ts`。
- `server/auth/permissions.ts`、`server/_core/trpc.ts`、`fileRoutes.ts`、`projectFileAccess.ts`、`verificationFileAccess.ts`、`sdk.ts`、`auth.ts`。
- `server/services/verification-service.ts`、`finance-service.ts`、`complaint-service.ts`、`server/domain/finance-policy.ts`。
- `lib/role-context.tsx` 及相关 profile/project/need/recycling/admin 页面。
- `tests/*.ts` 和 MySQL 集成脚本中对 user/engineer/merchant/admin、owner/engineer 双方项目和旧 permission 的假设。

## 3. 当前事实、目标与批次归属

| 当前事实 | 目标模型 | 差距 | A2 | 后续批次 |
|---|---|---|---|---|
| `users` 同时存 account 和后台 `role` | users 只作为 Account；后台用独立职务 | 登录与职务混合 | 建职务表并最小回填 | A3 停止 role 最终授权；A5 管理服务；A6 绕过测试 |
| `user_profiles.currentRole` 三选一 | `workspace_preferences` UI 偏好 | 客户端工作台与授权混合 | 回填偏好 | A3/A5 切换；旧字段仅镜像 |
| engineer/merchant 状态混合身份与认证 | business identity 与 certification 分离 | 状态冲突可抬权 | 新表、最小回填、异常清单 | A3 适配；A4 新服务 |
| engineer/merchant profile 一账号一档案 | identity profile | 无多身份承载 | 回填新 profile | A3 双读；A5 UI |
| 三套 verification + 多态文件/动作 | 通用 certification/文档/审核动作 | 状态、主体、初复审不统一 | 迁移保留 legacy source | A3/A4 统一 API；A6 SoD |
| `projects.ownerId/engineerId` 仅双方 | project memberships + roles | 无多成员、任务/clearance | 回填成员/角色，追加里程碑/文件字段 | A3 权限；A5 成员 UI |
| `project_files` 无保密级别/NDA/撤权版本 | 资源状态+保密级别+实时授权 | 旧签名仅双方 ID | 追加字段/索引 | A3 内容端点复核；A6 撤权测试 |
| `adminProcedure` 仅 `role!=user` | 稳定平台 capability | 任意后台角色可过入口 | 目录/职务/授权表 | A3 capability procedure |
| 旧 finance permission 同时审核与执行 | `platform.finance.review` 与 `platform.funds.execute` | 违反职责分离 | 分离能力和职务种子 | A3 强制 actor 不同；A6 测试 |
| complaint operate/decide 可同角色 | 调查与裁定分离 | 无案件级 actor 隔离 | 分离职务/能力 | A3/A6 |
| certification review 单能力 | 初审/复审分离 | 可同人完成 | review stage/action 表 | A4/A6 |
| 通用文件 owner/public；项目文件 owner/engineer | 统一资源关系、scope、clearance、NDA | 撤权与字段级保护不足 | policy version/保密列 | A3/A6 |
| messages.start 只需登录 | 必须有 ref resource 关系 | 可绕过资源关系建会话 | 现有会话追加状态/版本 | A3 验证 refType/refId |
| 前端 role-context 使用 currentRole | 服务端可用工作台 + 偏好 | 改本地参数可能误导入口 | 仅建偏好表 | A5 UI；A6 绕过测试 |
| 既有测试固定 owner/engineer/admin | 多成员、多职务、撤权与 SoD | 缺安全夹具 | A2 迁移夹具/测试 | A3-A6 分层实现 |

## 4. 修复的原稿冲突与缺失

1. 将 `Qualification/Verification/Certification` 收敛为业务术语 **Certification（认证）**；旧表仍称 verification，迁移文档明确来源；新物理表统一 `certification*`。
2. 将 `org.*` 能力统一为 `organization.*`，平台能力统一为 `platform.*`，数据范围统一使用完整枚举。
3. 原数据字典缺项目角色能力、显式授权、项目邀请、所有者转让、职责分离证据和并发字段；补齐为 24 张新表与 6 张现有表追加列。
4. 原 `workspace_preferences.workspaceId` 多态无 FK；改为分列外键并加互斥 `CHECK`。
5. 原认证 `UNIQUE(target,type)` 会抹掉重申历史；改为 applicationNo + 可空 activeDedupeKey，终态后新建申请。
6. 原组织成员把 `invited` 混入 membership 且拒绝/过期删除；拆分 invitation 和 membership，历史终态不删除。
7. 原项目只有 member/role 字符串；补齐项目邀请、角色目录、成员角色和角色能力。
8. 原后台角色仍包含 `admin` 大包权限；拆成初审/复审、调查/裁定、财务审核/资金执行、安全只读、权限管理等独立职务。
9. 原授权矩阵缺资源关系、业务状态、保密级别、数据范围、拒绝代码和审计列；补成 35 个完整场景和 28 个稳定 reasonCode。
10. 原字段矩阵允许审核员查看“完整身份证号”；修正为系统不存完整号码，审核视图只见末四位/水印原件。
11. 原字段矩阵未覆盖供应商隔离、设计源文件、BOM、工艺、质检备注、历史所有者、回收隐私和安全审计；补齐 16 项规则。
12. 原路由清单存在与源码不一致名称（如 listPending/reviewIdentity）；改为真实 `pending/review` 等入口并补状态、scope、上下文、敏感、阶段和测试。
13. 原状态机仅 5 类且会删除拒绝邀请；重写为 9 类、终态保留、CAS、幂等、审计和非法迁移测试。
14. 原安全矩阵不足且把完整证件可见当预期；扩展至 38 项，覆盖全部指定越权、缓存、并发、SoD、字段泄露和非法迁移。
15. 原执行报告提前声称 A1 完成、14 张表和“近 30 能力”；纠正为实际计数与有条件结论。
16. 增加 `migration_runs`、`migration_checkpoints`，并把现有简版 `migration_anomalies` 冻结为增量升级；基础设施与 24 张业务表分开统计。
17. 为认证、组织/项目邀请、owner transfer、平台职务和 grant 冻结 6 条确定性 activeDedupeKey；补齐缺失物理字段和唯一索引。
18. 六张稳定关系表统一采用模式 A，允许仅凭新邀请/新分配命令受控重新激活，并强制 requestId/version/追加审计；消除终态与唯一约束冲突。
19. 禁止从 `project_acceptances.submittedBy` 推断 reviewer；当前基线 reviewer 全部 NULL，提交者只可映射 `lastSubmittedByProjectMembershipId`，未知验收者写 anomaly。
20. 冻结 13 条组合 FK，覆盖邀请人、邀请来源、组织岗位/能力/owner transfer、项目角色、milestone 和 acceptance；多态 grant 采用唯一获批的替代约束。
21. 冻结 migrationVersion/runId/manifest SHA-256、500 行批次、checkpoint、5 秒锁、3 次重试、BLOCKING 语义、resume/rerun/recovery、MySQL 8.0.34 和分步循环 FK。

## 5. 冻结规模

| 指标 | 数量 | 统计口径 |
|---|---:|---|
| 业务基础表 | 24 | 数据字典业务编号表；不含迁移基础设施 |
| 迁移基础设施表 | 3 | migration_runs/migration_checkpoints/migration_anomalies；后者为现有表增量升级 |
| 现有表追加字段涉及表 | 6 | projects/milestones/project_files/project_acceptances/stored_files/conversations |
| 首批能力代码 | 68 | capability catalog 能力行 |
| 路由迁移条目 | 97 | 74 个现有/兼容/废弃条目 + 23 个新增条目；组合动作按一条实现单元计 |
| 敏感字段规则 | 16 | field masking 编号行 |
| 状态机 | 9 | 身份、认证、组织、组织成员、组织邀请、项目邀请、项目成员、平台职务、grant |
| activeDedupeKey 规则 | 6 | ADK-01—ADK-06 |
| 模式 A 冲突修复 | 6 | 两类 membership、两类 assignment、两类 capability mapping |
| 组合外键 | 13 | CFK-01—CFK-13 |
| 安全测试 | 48 | `SEC-001`—`SEC-048` |

## 6. A2 唯一实施边界与顺序

A2 只做：24 张业务基础表、2 张新迁移基础设施表、1 张现有迁移基础设施表增量升级、6 张现有业务表追加列/索引/FK、目录种子、旧数据幂等回填、异常报告、恢复脚本和迁移测试。A2 不改路由授权结果、不开发服务/UI、不删除旧字段、不进入 V3.3-B。

顺序：migration run/checkpoint/anomaly upgrade → 目录 → 身份 → 组织 → 组织关系 → 项目关系 → 平台职务 → 认证 → grant/偏好/审计 → 追加循环/组合 FK → 回填/对账 → 空库/升级/resume/rerun/recovery 测试。

## 7. A2 风险和前置动作

| 前置动作 | 是否阻断开始 | 关闭标准 |
|---|---|---|
| 实现冻结的 `migrationRunId`、checkpoint、anomaly 和计数报告 | 是（A2 实现门禁） | A2 代码与 A1.1 契约一致且迁移测试通过 |
| MySQL 8.0.34 `CHECK`、组合 FK 与循环 FK 分步 DDL | 是（A2 验收门禁） | 空库/升级实跑通过；`FOREIGN_KEY_CHECKS` 未关闭 |
| 商家 profile 个人/组织归属不明 | 否 | 不自动建组织；输出候选人工确认清单 |
| 旧 `users.role` 高权拆分 | 否 | 按最小职务回填；高风险账号列人工复核 |
| profile 状态与 verification 矛盾 | 否 | 最小权限 + `migration_anomalies`，不得造 approved |
| 历史 milestone assignee/reviewer 不确定 | 否 | reviewer 保持 NULL + `MIG-REVIEWER-UNKNOWN`；submittedBy 仅可映射提交者 |
| 当前源码包缺 `.git` | 不阻断本地 A2，但阻断 Git 差异证明 | 用户提供带 `.git` 工作树或继续以源码包清单/hash 追踪 |

## 8. A2 验收门禁

- 0000-0014 未改，A2 只新增迁移。
- 空库与 V3.2.4 升级通过；重复执行计数不变；失败点 resume、新 run rerun、指定批次 recovery 均通过。
- 每个账号恰有一个 consumer；开放申请、成员、职务和 grant 无重复。
- 项目 owner/engineer 回填可对账；owner=engineer 只建一个成员、两个角色。
- 所有冲突可导出且以最小权限处理；无静默丢弃。
- 旧金额列和金额语义完全不变；`check:money:v330` 继续通过。
- 24+3 张 A2 契约表全部同时出现在数据字典、迁移矩阵和建表顺序；Schema/SQL 与冻结字段、索引、约束一致。

## 9. 校验结果

| 命令/检查 | 结果 |
|---|---|
| `pnpm validate:product-specs` | PASS：144 features、149 audits、54 frozen routes、141 procedures、18 frozen states、11 frozen roles；0 mismatch |
| `pnpm check:markdown-links` | PASS：最终扫描 96 个 Markdown、87 条本地链接，0 断链 |
| `pnpm check:money:v330` | PASS：30 discovered/30 registered，missing/stale/duplicate 均 0 |
| `git diff --check` | NOT RUN：源码包不含 `.git`，命令返回“Not a git repository” |
| A1.1 静态空白/冲突标记/EOF 检查 | PASS：9 份 A1 规范 + 1 个专项脚本，0 个尾随空白、冲突标记或缺少末尾换行 |
| `node scripts/check-v33-a1-specs.mjs` | PASS：24 业务表、3 迁移基础设施表、6 现有表、6 ADK、6 Mode A、13 CFK、9 状态机、48 安全测试、14 anomaly codes；9 组自动断言，0 issue |
| A1.1 修改范围检查 | PASS：本批只有 5 份 A1 规范和 1 个专项脚本发生修改；`drizzle/schema.ts`、SQL、业务/API/页面、依赖与金额体系未改 |

## 10. 停止点

A2 具备开工条件，但未自动启动。完成本报告和最终静态校验后立即停止，等待用户审查。
