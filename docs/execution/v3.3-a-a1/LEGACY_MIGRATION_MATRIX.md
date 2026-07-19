Document Status: ACTIVE
Spec Version: 2.1.0
Updated At: 2026-07-19
Parent Stage: V3.3-A / A1.1
Source Baseline: V3.2.4 schema and migrations 0000-0014

# V3.3-A / A1.1 旧模型迁移矩阵

## 1. 原则与批次边界

- A1 只冻结规则；A2 才新增 Schema、SQL、回填、冲突报告和恢复脚本。
- A2 采用追加迁移；`users`、`user_profiles`、工程师/商家档案、三套认证表、`projects.ownerId/engineerId` 和 `users.role` 均保留。
- 所有回填写 `legacySourceType/legacySourceId` 或确定性 `requestId`，以数据库唯一约束保证幂等。
- 回滚只删除/终结本次回填生成的新表记录，不反向覆盖 A2 后产生的新业务数据；先备份并输出计数与 SHA-256。
- 兼容读取优先新表；新表缺失时读取旧表并写 `permission_audit_events` 的兼容命中事件。旧字段绝不覆盖已存在的新模型事实。
- `user_profiles.currentRole` 只映射工作台偏好，不参与 allow/deny。

## 2. 旧模型逐项迁移

| 当前位置 | 当前用途/事实 | 目标模型 | A2 回填与兼容读取 | 历史回填 | 旧字段保留/降级 | 回滚 | 风险与验证 |
|---|---|---|---|---|---|---|---|
| `users` | 账号、登录、安全状态及后台角色同表 | Account 继续使用 `users` | 不复制账号；为每个账号生成一个 `consumer` 身份 | 是，账号数=consumer 身份数 | 永久保留 Account 字段 | 删除 `source=legacy_backfill` 的 consumer 身份（无下游引用时） | 验证 0 个重复账号、0 个缺失 consumer |
| `users.role` | `user/admin/verification_reviewer/complaint_operator/finance_operator/customer_service` | `platform_staff_positions` | 非 `user` 按映射生成职务；A3 双读时新职务优先 | 是 | A3 标记只读兼容；A6 门禁通过后不再授权；删除另立批次 | 终结回填职务，旧字段未改 | 一个旧角色可能同时含复审/执行能力；必须拆分并输出高风险冲突 |
| `user_profiles.currentRole` | 三选一界面/部分前端业务判断 | `workspace_preferences` | `user->personal`; `engineer/merchant->identity`，仅目标身份有效时选择，否则 personal | 是 | 永久可暂留为 UI 兼容镜像；A3 起禁止授权读取 | 删除偏好后客户端回落 personal | 验证伪造 currentRole 不改变 API 权限 |
| `user_profiles.engineerStatus` | 身份存在和认证结果混合 | `business_identities` + `certifications` | 非 `none` 创建 engineer 身份；认证以最新旧认证记录为准，不以 profile 状态覆盖 | 是 | A3 双读显示；A4 停写；A6 后仅兼容展示 | 删除确定性回填身份/认证 | profile 与认证表矛盾时写冲突，不猜测通过状态 |
| `user_profiles.merchantStatus` | 商家身份和认证结果混合 | `business_identities` + `certifications` | 同上，创建 merchant 身份；营业主体归属由旧资料规则判定 | 是 | 同上 | 同上 | `active` 但无认证记录不得回填 approved |
| `engineer_profiles` | 一账号一工程师档案 | engineer `identity_profiles` | 逐字段复制；金额 `startingPrice` 保持当前整元语义，不在 A2 改金额 | 是 | A3 适配器双读；A5 后新档案优先 | 删除 `legacySource` 对应 profile | `skills` 非数组、重复 userId、孤儿 userId 写异常 |
| `merchant_profiles` | 个人商家、门店/回收商信息混在账号档案 | merchant `identity_profiles`；必要时候选 `organizations` | A2 只回填个人 merchant identity/profile；不自动创建组织；输出“建议组织化”清单由 A4 用户确认 | 是 | 旧表保留，A3 双读 | 删除回填 profile/identity | 不能凭名称自动把个人资料升级公司；地址按高敏处理 |
| `identity_verifications` | 实名认证 | `certifications(real_name)` | 每条生成独立申请；保留状态历史和旧 ID | 是 | A3 兼容读取；A4 新申请只写新表；A6 后旧表只读 | 删除对应新申请/动作/材料映射 | 旧 `reviewedBy` 不等于初审+复审；标记 legacy_single_stage |
| `engineer_verifications` | 工程师认证 | `certifications(engineer_basic)` | 绑定 engineer 身份；状态按下表映射 | 是 | 同上 | 同上 | 用户无 engineer 身份时先补身份；不能由 profile 状态抬升 |
| `merchant_verifications` | 商家营业认证 | `certifications(merchant_business_license)` | 默认绑定 merchant 身份；可能属于组织的记录写待确认，不自动换主体 | 是 | 同上 | 同上 | 注册号仅摘要/后四位，不得重建明文 |
| `verification_documents` | 三套认证的多态材料 | `certification_documents` | 通过旧 type+id 映射 certification；复用 `stored_files`，不复制文件 | 是 | A3 旧入口返回新短签名；旧表只读 | 删除映射，不删文件 | 孤儿、多态错误、缺 stored_file 写异常并阻断该申请迁移通过 |
| `verification_actions` | 旧审核动作 | `certification_review_actions` | 保留 actor/from/to/reason；`review` 标为 `initial_review` + legacy 单阶段 | 是 | 旧动作永久只读 | 删除回填动作 | 不能伪造 final_review；职责分离仅对新动作强制 |
| `projects.ownerId` | 固定需求方/发起人 | `project_memberships` + role `initiator` | 每项目生成 owner 成员与角色 | 是 | 至少保留至 V3.3-B 稳定；A3 双读新优先 | 删除回填成员/角色 | owner=engineer 时同一成员可有两角色，不能插入两成员 |
| `projects.engineerId` | 固定工程师 | `project_memberships` + role `engineer` | 同上 | 是 | 同上 | 同上 | 孤儿用户阻断该项目 A3 切换并记录异常 |
| `project_files.uploadedBy` | 文件上传者 | 项目成员资源关系 | 校验上传者存在于回填成员；不复制文件 | 是（验证/补异常） | 字段永久保留事实 | 无数据写入则无需回滚 | 非成员历史上传保留历史但默认不授当前访问权 |
| `milestones` + `project_acceptances.submittedBy` | 只有交付提交者事实，不是验收者事实 | `lastSubmittedByProjectMembershipId` + 可空 `reviewerProjectMembershipId` | `submittedBy` 只可在同项目唯一映射后回填交付提交者；`submittedBy -> reviewerProjectMembershipId = FORBIDDEN` | 是（仅提交者）；reviewer 否 | 永久保留旧事实 | 清空本次提交者 FK；reviewer 原本即 NULL | 无明确 reviewer/acceptedBy/approvedBy 时 reviewer 保持 NULL 并写 `MIG-REVIEWER-UNKNOWN` |
| `audit_logs.actorRole` | 旧角色快照 | `permission_audit_events` 的上下文快照 | 不回写旧审计；A3 新事件写 positionId/capability/policyVersion | 否 | 旧审计永久保留 | 无 | 不把旧 actorRole 当当前授权来源 |
| `adminProcedure` | `role !== user` 即后台 | capability procedure | A3 兼容入口内部解析平台职务；无有效职务默认拒绝 | 否 | A3 标记 deprecated；A6 后删除调用点 | 适配器 feature flag 回切旧读，仅限紧急恢复 | 回切不允许越过职责分离 |
| `permissionProcedure` / `ROLE_PERMISSIONS` | 固定角色到权限映射 | `platform_staff_positions` + capabilities/grants | A3 将旧 permission 映射稳定 capability；每次校验状态、有效期、案件范围 | 否 | A3 兼容；A6 后不作为最终判定 | 同上 | 现状 `finance.refund.review` 同时审核和执行，必须拆分 |
| `server/_core/sdk.ts` 角色降级 | JWT 只保留 admin/user | 会话仅含 account，服务端实时解析职务 | A3 不信任 token 内角色；每次高风险请求查有效职务 | 否 | 旧 claim 仅兼容显示 | feature flag | 旧 token 不得在撤权后继续授权 |
| 客户端 `lib/role-context.tsx` | `currentRole` 驱动工作台和部分按钮 | 工作台偏好 + 服务端可用工作台 | A5 替换；A1/A2 不改代码 | 否 | A5 前保留 | UI 回滚 | 客户端隐藏不是安全边界 |
| 页面 `role === engineer`/`merchantStatus` | 报价/回收按钮假设 | 服务端 capability + certification | A5 仅用于入口提示；提交仍由服务端授权 | 否 | A5 降级为 UI hint | UI 回滚 | 修改本地参数必须无法绕过服务端 |
| 现有测试的 owner/engineer/admin 假设 | 双方项目与固定后台角色 | 多成员/多职务夹具 | A2 增迁移测试，A3-A6 增授权安全测试，旧回归保留 | 是（测试数据） | 旧测试不删除 | 移除新增夹具 | 防止为通过新测试破坏 V3.2.4 回归 |

## 3. 状态映射

| 旧值 | 新认证状态 | 新身份状态 | 规则 |
|---|---|---|---|
| profile `none` | 无认证或 `not_applied` | consumer 之外不自动创建（有档案/申请除外） | 认证表事实优先 |
| profile `pending` | `pending`（仅有申请时） | `active` | 身份可存在但认证能力不可用 |
| profile `active` | 取最新认证；无记录则冲突，不得造 `approved` | `active` | 防止错误抬权 |
| profile `rejected` | `rejected`（仅有对应申请时） | `active` | 拒绝认证不删除身份 |
| verification `draft` | `not_applied` | 不变 | 仅历史兼容 |
| verification `submitted`/`under_review` | `pending` | 不变 | 统一审核中 |
| verification `additional_info_required` | 同名 | 不变 | - |
| verification `approved/rejected/revoked/expired` | 同名 | 不变 | 认证撤销只撤依赖能力 |

## 4. 后台职务确定性映射

| `users.role` | A2 回填职务 | 说明 |
|---|---|---|
| `admin` | `super_administrator` | 必须列入高风险复核；不得据此自动绕过职责分离 |
| `verification_reviewer` | `certification_initial_reviewer` | 不自动赋 final reviewer；避免旧单人审核延续 |
| `complaint_operator` | `complaint_investigator` | 不自动赋 complaint decider |
| `finance_operator` | `finance_reviewer` | 不自动赋 funds executor |
| `customer_service` | `customer_service` | 仅分配案件范围 |

若业务必须让旧账号继续执行复审、裁定或资金执行，需由另一名有 `platform.permission.manage` 的人员在 A4 显式追加职务并写审计。

## 5. A2 新表覆盖与来源

| 新表 | 来源/种子 | A2 动作 | 回填验收 |
|---|---|---|---|
| `identity_types` | 规格种子 | INSERT IGNORE/校验定义 | 10 个首批代码一致 |
| `business_identities` | users/profile/档案/认证 | 幂等回填 | consumer 全覆盖，无重复 |
| `identity_profiles` | engineer/merchant profiles | 幂等复制 | 字段计数与异常清单 |
| `certification_types` | 规格种子 | 写 3 个首批类型 | 代码/审核模式一致 |
| `certifications` | 三套 verification | 逐记录回填 | 状态/主体/旧 ID 可追踪 |
| `certification_documents` | verification_documents | 建映射 | 无孤儿才通过 |
| `certification_review_actions` | verification_actions | 仅追加映射 | 动作数一致 |
| `capabilities` | 能力目录 | 写 68 个首批能力 | hash/数量一致 |
| `organizations` | 无可靠自动来源 | 仅建表，不猜测创建 | 0 条允许；商家候选另报 |
| `organization_memberships` | 新组织创建事务 | 仅建表 | 组织创建时 owner 原子生成（A4） |
| `organization_invitations` | 无 | 仅建表 | 空表 |
| `organization_positions` | 每个新组织模板 | A4 创建组织时种子 | A2 不为候选组织创建 |
| `organization_member_positions` | 无 | 仅建表 | 空表 |
| `position_capabilities` | 岗位模板 | A4 创建时写 | A2 空表 |
| `organization_owner_transfers` | 无 | 仅建表 | 空表 |
| `project_memberships` | projects owner/engineer | 幂等回填 | 每项目 1-2 个唯一成员 |
| `project_invitations` | 无 | 仅建表 | 空表 |
| `project_roles` | 规格种子 | 写 9 个角色 | hash/数量一致 |
| `project_membership_roles` | owner/engineer | 分配 initiator/engineer | 角色数可对账 |
| `project_role_capabilities` | 能力目录模板 | 写首批映射 | 角色能力无跨平台范围 |
| `platform_staff_positions` | users.role | 按最小职务映射 | 高风险复核清单 |
| `capability_grants` | 无 | 仅建表 | 空表；不得为兼容造全局 grant |
| `workspace_preferences` | currentRole | 幂等回填 | 无效身份回落 personal |
| `permission_audit_events` | 无历史复制 | 仅建表 | A2 迁移自身写摘要事件 |

### 5.1 迁移基础设施表覆盖（3 张，单独统计）

| 迁移基础设施表 | 基线事实 | A2 物理动作 | 验收 |
|---|---|---|---|
| `migration_runs` | 不存在 | 新建 | 每次开始/恢复/重跑均有唯一 run；状态与四类计数闭合 |
| `migration_checkpoints` | 不存在 | 新建 | 每个 phase/entity/shard/range 最多一条；checksum 可验证 |
| `migration_anomalies` | 已有简版：version/entity/code/detail/resolvedAt | 增量加 run/severity/handling/fingerprint/checksum 等字段，回填后收紧非空 | 旧行不丢失；新异常幂等；BLOCKING 可阻断 run |

### 5.2 现有表追加列迁移

| 现有表 | A2 追加 | 历史回填 | 回滚/验证 |
|---|---|---|---|
| `projects` | `authorizationVersion` | 全部 1 | 回滚可删列；验证项目计数/状态不变 |
| `milestones` | assignee/last submitter membership FK + authorizationVersion | assignee 默认不猜测；`project_acceptances.submittedBy` 仅在同项目唯一映射时回填 `lastSubmittedByProjectMembershipId`；version=1 | 验证旧里程碑状态、金额、时间不变 |
| `project_files` | confidentiality/NDA/policy version/disabled audit fields | 历史 INTERNAL、NDA=false、version=1；disabledAt/By NULL | 验证原文件仍按旧成员兼容读且不变公开 |
| `project_acceptances` | reviewer membership/submission version | 只有旧模型明确 reviewer/acceptedBy/approvedBy 才可映射；当前基线没有，故 reviewer 全部 `NULL` 并写 `MIG-REVIEWER-UNKNOWN`；绝不使用 submittedBy | 验收事实行数/结果不变；专项断言提交者不等于 reviewer |
| `stored_files` | accessPolicyVersion | 全部 1 | SHA、storageKey、privacyLevel 不变 |
| `conversations` | status/authorizationVersion + ref index | 全部 active/1；无 ref 的个人会话保留 | 消息/会话计数和参与者不变 |

## 6. A2 执行、回滚与门禁

1. 迁移前：记录 15 个历史 SQL 的 SHA-256、现有表计数、关键行数、孤儿 FK 和角色/状态分布，计算 `sourceChecksum`。
2. 基础设施：先创建 `migration_runs`/`migration_checkpoints`，再增量升级现有 `migration_anomalies`；生成并启动唯一 run。
3. 建表：严格按数据字典 Phase A—D；失败标记当前 checkpoint/run，不改 0000-0014，不关闭外键检查。
4. 种子：只接受本文件冻结 manifest；实际清单 SHA-256 必须匹配，重复运行不得更新已发布代码含义。
5. 回填：按账号 → 身份 → 认证 → 项目成员 → 后台职务 → 工作台偏好；固定 500 行/事务，每批一个 checkpoint 更新。
6. 冲突：写 `migration_anomalies`；权限不确定一律最小权限。BLOCKING 立即回滚当前批、标记 checkpoint/run failed 并停止后续写入。
7. 验证：空库、V3.2.4 样本库、同 run 恢复、新 run 重跑、备份恢复后重跑、并发启动拒绝。
8. 恢复/回滚：只接受显式 `migrationRunId`；按 provenance 与 checkpoint 反序处理。存在 A2 后业务引用时只终结并报告 `MIG-DOWNSTREAM-REFERENCE-PRESENT`，不硬删。
9. A3 切换门禁：consumer 缺失=0、重复开放记录=0、项目孤儿=0、BLOCKING anomaly=0、职务冲突全部人工确认、currentRole 绕过测试通过。

旧字段的最终删除不属于 V3.3-A/A2；需在 V3.3-B 稳定、兼容命中率连续归零且恢复演练通过后另立任务。

## 7. A2 确定性执行契约

### 7.1 版本、runId 与基线

- `migrationVersion` 固定为 `v3.3-a2.0.0`；`sourceBaseline` 固定为 `v3.2.4+migrations-0000-0014`。
- `migrationRunId` 格式固定为 `v33a2-<UTC YYYYMMDDTHHmmssSSSZ>-<12 lowercase hex>`，正则为 `^v33a2-[0-9]{8}T[0-9]{9}Z-[0-9a-f]{12}$`。
- 后缀取 `SHA-256(migrationVersion|sourceBaseline|sourceChecksum|manifestChecksum|startedAt三位毫秒UTC|runSequence)` 前 12 位。`runSequence` 在 `GET_LOCK('v33a2-run-sequence',5)` 内按同 version/baseline 的最大值加一分配；拿不到锁写 `MIG-LOCK-RETRY-EXHAUSTED` 并失败。
- `sourceChecksum` 为 0000—0014 的“相对路径、字节长度、文件 SHA-256”按路径升序、LF 连接后的 SHA-256；`configurationChecksum` 为本节所有固定参数的 canonical JSON SHA-256。任何恢复/重跑都必须复核这三个 checksum。

### 7.2 目录种子 manifest

manifest 采用 UTF-8、无 BOM、LF、键名字典序、无无意义空白的 canonical JSON；种子执行前重新计算源文件 SHA-256，任何不匹配产生 `MIG-SEED-MANIFEST-MISMATCH`（BLOCKING）。冻结 manifest：

```json
{"expectedCounts":{"capabilities":68,"certificationTypes":3,"identityTypes":10,"projectRoles":9},"manifestVersion":"v3.3-a2-seed-1","migrationVersion":"v3.3-a2.0.0","sources":[{"path":"docs/execution/v3.3-a-a1/CAPABILITY_CATALOG.md","sha256":"f28f37f8dfb9a04105766e641e6515cc8036b67b99587e37677889ad9ccd5e50"},{"path":"docs/execution/v3.3-a-a1/DATA_DICTIONARY.md","sha256":"e36a63734ebc03d4cb9ddb3dbffd61785e9413caddaa886c3fd32743831f60d3"}]}
```

`manifestChecksum = 95d0178c6e304247b4ba9d7370f21831026e7b6e08e93aaec7bebd9ecb2fb983`。A2 可以把上述 canonical JSON 复制为实现清单，但不得改变内容后沿用该 checksum；实现清单内容和 checksum 必须同时入 `migration_runs`。

### 7.3 批次、checkpoint、锁与重试

- MySQL 最低实测版本固定为 **MySQL 8.0.34**；CI 与验收报告必须记录精确 patch 版本、字符集和 sql_mode。
- 回填批次固定 500 行；源实体不足 500 行仍生成一个 checkpoint。单批一个事务，按升序整数主键；无整数主键时按冻结复合唯一键字典序。
- checkpoint 粒度固定为 `phase + entityType + shard(000000) + rangeStartExclusive`；事务提交后才把 cursor 推进到 `rangeEndInclusive`。崩溃时未提交批次整体重放。
- session 级 `innodb_lock_wait_timeout=5` 秒；命名锁等待 5 秒。仅 lock timeout/deadlock 可重试 3 次，退避为 200ms、500ms、1000ms；唯一键幂等冲突不计重试，读取赢家；校验/约束错误不重试。
- 锁顺序固定为 migration run → checkpoint → 父聚合（organization/project）→ 稳定关系行 → 审计/anomaly；不得反序。

### 7.4 anomaly 严重度、代码与处理

| 代码 | 严重度 | handling | 精确处理 |
|---|---|---|---|
| `MIG-SOURCE-BASELINE-MISMATCH` | BLOCKING | ABORT_RUN | 不执行任何 A2 DDL/DML |
| `MIG-SEED-MANIFEST-MISMATCH` | BLOCKING | ABORT_RUN | 停止 seed 和后续阶段 |
| `MIG-MISSING-USER` | BLOCKING | ABORT_RUN | 回滚实体批次，禁止生成孤儿身份/成员 |
| `MIG-ORPHAN-DOCUMENT` | BLOCKING | ABORT_RUN | 回滚认证实体批次，禁止伪造文件关系 |
| `MIG-STATE-CONFLICT` | WARNING | MIN_PRIVILEGE | 保留最小权限状态并进入人工复核 |
| `MIG-REVIEWER-UNKNOWN` | WARNING | MANUAL_REVIEW | reviewer 保持 NULL；继续迁移，不生成验收事实 |
| `MIG-UNMAPPED-LEGACY-ROLE` | WARNING | MIN_PRIVILEGE | 不授高权职务；进入人工复核 |
| `MIG-CROSS-SCOPE-RELATION` | BLOCKING | ABORT_RUN | 回滚批次，禁止跨组织/项目关系 |
| `MIG-DUPLICATE-OPEN-RELATION` | BLOCKING | ABORT_RUN | 回滚批次，先消解重复再新 run 重跑 |
| `MIG-CHECKPOINT-CHECKSUM-MISMATCH` | BLOCKING | ABORT_RUN | 禁止从该 cursor 恢复 |
| `MIG-ANOMALY-DETAIL-UNSAFE` | BLOCKING | ABORT_RUN | 丢弃不安全 detail，记录安全摘要后停止 |
| `MIG-DOWNSTREAM-REFERENCE-PRESENT` | BLOCKING | ABORT_RUN | 恢复时拒绝硬删，保留/终结记录 |
| `MIG-INVALID-LEGACY-JSON` | WARNING | SKIP_ENTITY | 不复制损坏字段；最小权限并人工复核 |
| `MIG-LOCK-RETRY-EXHAUSTED` | BLOCKING | ABORT_RUN | 回滚当前批并结束 run |

INFO 只记可观测事实并继续；WARNING 必须采用表中处理且不得抬权；BLOCKING 必须回滚当前事务，将 checkpoint 标为 failed、run 标为 failed，写 `failedAt/failureCode`，停止所有后续 mutation，且绝不允许转 completed。所有迁移异常代码都必须先在本表登记严重度和处理方式；A2 不得临时发明未登记代码。

### 7.5 恢复、重跑与指定批次恢复

- **恢复（resume）**：仅针对仍为 `running` 且 heartbeat 超过 120 秒的同一 runId。取得 run/checkpoint 行锁并核对 migrationVersion/source/manifest/configuration checksum 后，从最后一个 completed checkpoint 的下一批继续；running 批次按未推进 cursor 整批重放。failed/aborted/completed run 不得 resume。
- **重跑（rerun）**：为 failed/aborted/completed 源 run 创建 `runMode=rerun` 的新 runId，并写 `parentMigrationRunId`。新 run 建独立 checkpoint；依靠 legacy source、稳定关系唯一键和 activeDedupeKey 跳过已成功记录，绝不改写原 run/checkpoint/anomaly。BLOCKING 未解决不得重跑为 completed。
- **恢复回滚（recovery）**：创建 `runMode=recovery` 新 run，`parentMigrationRunId` 必须是显式指定目标。只处理业务表中 `migrationRunId=目标 runId` 的记录，按 checkpoint 逆序；先查下游引用并锁行，无引用才物理删除回填记录，有引用则写 `MIG-DOWNSTREAM-REFERENCE-PRESENT` 并只终结。目录种子只验证、不删除；旧表事实永不反向覆盖。
- **指定批次恢复**：额外给出唯一 `checkpointKey`，只能回滚该 checkpoint 的 `(rangeStartExclusive,rangeEndInclusive]`，且必须验证 checksum。禁止“最近一次”“当前批次”之类隐式目标，禁止跨 run 清理。

### 7.6 循环外键分步 DDL

1. Phase A 新建 `migration_runs`；Phase B 新建 `migration_checkpoints` 并增量升级现有 `migration_anomalies`。
2. Phase C 创建全部 24 张业务基础表；循环关系列先可空或暂不挂 FK，但列型、索引先冻结。
3. 写目录种子并回填父记录；执行组合归属、孤儿和重复开放关系验证。
4. Phase D 先加非循环组合 FK，再加 `organization_memberships.sourceInvitationId`、`project_memberships.sourceInvitationId` 两个循环组合 FK，最后加 milestones/project_acceptances 三个项目组合 FK及审核/工作台普通循环 FK。
5. 所有 FK 添加后执行全量 anti-join=0、`SHOW CREATE TABLE` 契约比对，再允许 run completed；全过程禁止关闭 `FOREIGN_KEY_CHECKS`。
