Document Status: ACTIVE
Spec Version: 2.1.0
Updated At: 2026-07-19
Parent Stage: V3.3-A / A1.1

# V3.3-A / A1.1 安全测试矩阵

## 1. 自动化层级

- `MIGRATION_MYSQL`：A2 真实 MySQL 空库/升级/重跑/回滚。
- `AUTH_INTEGRATION`：A3/A4/A5 使用真实授权服务和数据库事务。
- `API_E2E`：A6 从 tRPC/HTTP/文件内容端点验证状态、字段和审计。
- `CONCURRENCY_MYSQL`：双连接、行锁、CAS 和幂等验证。
- `STATIC_CONTRACT`：能力/路由/字段/状态机一致性脚本。

## 2. 测试用例（48）

| 编号 | 类型 | 前置数据 | 操作主体 | 请求/攻击 | 预期结果 | 拒绝代码 | 审计事件 | 自动化层级 | 落实批次 |
|---|---|---|---|---|---|---|---|---|---|
| `SEC-001` | 横向越权 | A 非项目 X 成员 | 账号 A | `projects.detail(X)` | 404/403，不返回存在性或字段 | `PROJECT_MEMBERSHIP_INACTIVE` | deny project.view | API_E2E | A3/A6 |
| `SEC-002` | 纵向越权 | 普通账号无平台职务 | 普通账号 | `admin.menu`/投诉后台 | 403，处理器不执行 | `CAPABILITY_MISSING` | deny platform.workspace.access | AUTH_INTEGRATION | A3/A6 |
| `SEC-003` | 跨组织 | A 是 O1 admin，资源属于 O2 | A | 邀请/修改 O2 | 403 | `ORGANIZATION_MEMBERSHIP_INACTIVE` | deny org capability | API_E2E | A4/A6 |
| `SEC-004` | 跨项目 | A 是 P1 成员，不是 P2 | A | 读 P2 文件/里程碑 | 403/404 | `PROJECT_MEMBERSHIP_INACTIVE` | deny | API_E2E | A3/A6 |
| `SEC-005` | 离职残留 | 成员从 active→left，持旧会话/签名 | 离职成员 | 组织 API、项目文件、消息 | 全部即时拒绝；历史署名保留 | `ORGANIZATION_MEMBERSHIP_INACTIVE` | left + subsequent deny | API_E2E | A4/A6 |
| `SEC-006` | 停职残留 | 成员 active→suspended | 被停职成员 | 读写组织/项目私密数据 | 事务提交后立即拒绝 | `ORGANIZATION_MEMBERSHIP_INACTIVE` | suspended + deny | API_E2E | A4/A6 |
| `SEC-007` | 邀请幂等 | pending 组织邀请 | 被邀请账号 | 同 requestId/令牌连续接受两次 | 一个 membership；两次返回同结果 | - | accepted 仅一次 | CONCURRENCY_MYSQL | A2/A4/A6 |
| `SEC-008` | 邀请过期 | expiresAt 已过 | 被邀请账号 | 接受邀请 | 410；状态 expired；不建成员 | `INVITATION_EXPIRED` | invitation.expired/deny | AUTH_INTEGRATION | A4/A6 |
| `SEC-009` | 撤权缓存 | active grant 被 revoke，存在缓存 | 原被授权人 | 下一次敏感操作 | 立即拒绝；高风险不等 TTL | `GRANT_INACTIVE` | revoked + deny | API_E2E | A3/A6 |
| `SEC-010` | 认证撤销 | engineer cert approved→revoked | 工程师 | 新报价/受限操作 | 拒绝；历史项目仍可按独立关系只读 | `CERTIFICATION_INACTIVE` | certification.revoked + deny | API_E2E | A4/A6 |
| `SEC-011` | 客户端参数绕过 | A 仅 consumer | A | 修改 workspace/identity 为 engineer | 服务端解析失败，不增权 | `IDENTITY_INACTIVE` | deny identity/capability | API_E2E | A3/A5/A6 |
| `SEC-012` | 伪造组织 ID | A 有 O1 工作台 | A | 请求头/参数改为 O2 | 403 | `DATA_SCOPE_MISMATCH` | deny | API_E2E | A3/A6 |
| `SEC-013` | 伪造项目 ID | A 有 P1 capability | A | 参数换成 P2 | 403/404 | `DATA_SCOPE_MISMATCH` | deny | API_E2E | A3/A6 |
| `SEC-014` | 报价隔离 | 供应商 A/B 同 RFQ/需求 | A | 猜 B quoteId | B 报价和底价均不返回 | `RESOURCE_RELATION_REQUIRED` | high-risk deny | API_E2E | A3/A6（V4.1复验） |
| `SEC-015` | 图纸越权 | A 无 project/邀请/NDA | A | 文件元数据、签名、content 端点 | 全部拒绝；文件名也不泄露 | `PROJECT_MEMBERSHIP_INACTIVE` | file deny | API_E2E | A3/A6 |
| `SEC-016` | 自验收 | 交付 submittedBy=A | A | `projects.acceptMilestone` | 409，不触发结算 | `SELF_APPROVAL_FORBIDDEN` | high-risk deny | AUTH_INTEGRATION | A3/A6 |
| `SEC-017` | 财务职责分离 | A 已审核退款/结算 | A | 执行同一退款/资金释放 | 409；Provider 不调用 | `SEPARATION_OF_DUTIES` | deny funds.execute | AUTH_INTEGRATION | A3/A6 |
| `SEC-018` | 并发邀请接受 | 同一邀请，两连接并发 | 被邀请账号 | 同时 accept | 一个成员/角色；另一请求幂等成功或 CAS 冲突 | -/`CONCURRENT_MODIFICATION` | accepted 仅一次 | CONCURRENCY_MYSQL | A2/A4/A6 |
| `SEC-019` | 并发成员权限 | 管理员撤岗与成员写操作并发 | 两账号 | 锁定顺序下同时执行 | 提交顺序决定；撤岗提交后不再放行 | `CONCURRENT_MODIFICATION`/`CAPABILITY_MISSING` | 两事件顺序可解释 | CONCURRENCY_MYSQL | A4/A6 |
| `SEC-020` | 组织关闭前置 | 组织有 active 项目/未结资金 | owner | close organization | 409，组织不关闭 | `RESOURCE_STATE_FORBIDDEN` | deny close | AUTH_INTEGRATION | A4/A6 |
| `SEC-021` | 旧角色绕过 | `users.role=admin` 但无有效新职务 | 旧 admin | 高风险后台 API | A3 切换后拒绝；兼容命中可观测 | `STAFF_POSITION_INACTIVE` | deny + legacy-hit | API_E2E | A3/A6 |
| `SEC-022` | 自我提权 | permission admin A | A | 给自己 super admin/PLATFORM_ALL | 409，无 grant/position | `SEPARATION_OF_DUTIES` | high-risk deny | AUTH_INTEGRATION | A4/A6 |
| `SEC-023` | 身份非法迁移 | identity=closed | 本人/平台 | restore/switch | 409/403；closed 不原地恢复 | `RESOURCE_STATE_FORBIDDEN`/`IDENTITY_INACTIVE` | illegal transition | AUTH_INTEGRATION | A4/A6 |
| `SEC-024` | 认证非法迁移 | certification=rejected | 审核员 | 原记录直接 approve | 409；必须新申请 | `RESOURCE_STATE_FORBIDDEN` | illegal transition | AUTH_INTEGRATION | A4/A6 |
| `SEC-025` | 项目邀请非法迁移 | invitation=revoked/expired | 被邀请账号 | accept | 409/410；不建项目成员 | `INVITATION_INVALID`/`INVITATION_EXPIRED` | deny | AUTH_INTEGRATION | A5/A6 |
| `SEC-026` | grant 非法恢复 | grant=revoked | 管理员 | 将同记录改 active | 409；需创建新 grant | `RESOURCE_STATE_FORBIDDEN` | illegal transition | AUTH_INTEGRATION | A4/A6 |
| `SEC-027` | 认证初/复审 | initial reviewer=A | A | final review 同申请 | 409 | `SEPARATION_OF_DUTIES` | deny final review | AUTH_INTEGRATION | A4/A6 |
| `SEC-028` | 投诉调查/裁定 | investigator=A | A | decide 同一投诉 | 默认 409 | `SEPARATION_OF_DUTIES` | deny complaint.decide | AUTH_INTEGRATION | A3/A6 |
| `SEC-029` | identity 工作台失效 | identity suspended | 本人 | switch/调用身份能力 | 偏好可回落 personal；能力拒绝 | `IDENTITY_INACTIVE` | deny/switch fallback | API_E2E | A5/A6 |
| `SEC-030` | 安全审计只读 | A 仅 security_auditor | A | 修改投诉/认证/资金记录 | 403 | `CAPABILITY_MISSING` | deny | API_E2E | A3/A6 |
| `SEC-031` | 敏感字段日志 | 构造含手机号/证件/银行/token 请求 | 任意 | 触发成功、拒绝和异常日志 | 日志/审计 detail 无原值，仅 hash/last4/规则名 | - | sanitized event | STATIC_CONTRACT + API_E2E | A3/A6 |
| `SEC-032` | 列表泄露 | 多账号、认证、报价、文件数据 | 无权/低权主体 | 所有相关 list/feed/search | 无手机号、邮箱、证件、底价、文件名等禁返字段 | `FIELD_ACCESS_DENIED` 或字段 OMIT | 敏感拒绝按规则 | API_E2E | A3/A6 |
| `SEC-033` | 回收隐私 | 回收完成，存在历史 owner | 回收商 | 查看物品/回收详情 | 仅履约摘要；历史 owner 联系信息永不返回 | `FIELD_ACCESS_DENIED` | high-risk allow/deny | API_E2E | A6（V4.3复验） |
| `SEC-034` | 冻结设计 | design version frozen | 生产商 | 修改/禁用/覆盖设计文件 | 409；只能发工程变更 | `RESOURCE_STATE_FORBIDDEN` | deny | AUTH_INTEGRATION | A6（V4.1复验） |
| `SEC-035` | 保密级别 | viewer clearance=INTERNAL，文件=CONFIDENTIAL | viewer | metadata/sign/content/download | 全链路拒绝；无文件名 | `CONFIDENTIALITY_TOO_HIGH` | file deny | API_E2E | A3/A6 |
| `SEC-036` | owner 转让双确认 | transfer 只有单方确认 | owner | complete transfer | 409；owner 不变 | `OWNER_TRANSFER_CONFIRMATION_REQUIRED` | deny transfer | AUTH_INTEGRATION | A4/A6 |
| `SEC-037` | 最后 owner 保护 | 组织仅一名 active owner | owner/admin | leave/remove/revoke owner position | 409 | `LAST_OWNER_CANNOT_LEAVE` | high-risk deny | CONCURRENCY_MYSQL | A4/A6 |
| `SEC-038` | 迁移最小权限 | 旧 active profile 与认证表矛盾 | A2 runner | 重跑回填 | 不造 approved；写 anomaly；重复运行计数不变 | - | migration summary | MIGRATION_MYSQL | A2/A6 |
| `SEC-039` | 迁移基础设施 | V3.2.4 样本库含简版 anomaly 表 | A2 runner | 应用基础设施 DDL | 新建 runs/checkpoints、增量升级 anomaly；24+3+6 口径一致；旧 anomaly 不丢 | - | migration run | MIGRATION_MYSQL + STATIC_CONTRACT | A2 |
| `SEC-040` | 开放记录并发去重 | ADK-01—06 各准备同一业务键，两连接 | 两个合法 actor | 并发创建认证/组织邀请/项目邀请/owner transfer/平台职务/grant | 每类仅一条开放记录；输家读取赢家；终态清空 key 后可新建历史行 | -/`CONCURRENT_MODIFICATION` | 每类 created 一次 | CONCURRENCY_MYSQL | A2/A4 |
| `SEC-041` | 稳定成员关系复活 | org/project membership 已 left/removed | 新邀请受邀人 | 直接恢复；再接受有效新邀请；重放旧 requestId | 直接恢复 409；新邀请复用同一行、version+1、动作审计唯一；重放幂等 | `RESOURCE_STATE_FORBIDDEN` | member.reactivated 一次 | CONCURRENCY_MYSQL | A2/A4 |
| `SEC-042` | 稳定分配关系复活 | 成员岗位/项目角色/两类 capability 映射已 revoked | 合法分配者 | 直接恢复与带新 requestId 的重新分配并发 | 仅新命令可复用稳定行；lastRequestId/version/audit 完整；无重复行 | `RESOURCE_STATE_FORBIDDEN` | *.reactivated 一次 | CONCURRENCY_MYSQL | A2/A4 |
| `SEC-043` | 历史验收人防伪 | acceptance.submittedBy=A，旧模型无 reviewer/acceptedBy/approvedBy | A2 runner | 回填 acceptance 与 milestone | `reviewerProjectMembershipId=NULL`；A 仅可成为 `lastSubmittedByProjectMembershipId`；写 `MIG-REVIEWER-UNKNOWN` | - | warning anomaly | MIGRATION_MYSQL + STATIC_CONTRACT | A2 |
| `SEC-044` | 组织组合 FK | O1 membership/position 与 O2 invitation/assignment/transfer | A2/合法服务账号 | 直接插入跨组织 inviter、岗位、capability、from/to owner | 数据库 FK 拒绝，事务无部分写；服务层检查关闭时仍拒绝 | `DATA_SCOPE_MISMATCH` | deny/cross-scope anomaly | MIGRATION_MYSQL + CONCURRENCY_MYSQL | A2/A4 |
| `SEC-045` | 项目组合 FK与多态替代 | P1 membership 与 P2 invitation/role/milestone/acceptance；伪造 grant resource | A2/合法服务账号 | 直接插入跨项目关系或错误多态主体 | 组合 FK 拒绝所有跨项目行；多态 grant 被 CHECK+注册表+行锁拒绝 | `DATA_SCOPE_MISMATCH` | deny/cross-scope anomaly | MIGRATION_MYSQL + CONCURRENCY_MYSQL | A2/A3 |
| `SEC-046` | BLOCKING anomaly | 构造孤儿文档/跨 scope/不安全 detail | A2 runner | 执行含该实体的批次 | 当前事务回滚；checkpoint/run=failed 且 failedAt/code 有值；后续阶段不写；绝不 completed | - | BLOCKING anomaly | MIGRATION_MYSQL | A2 |
| `SEC-047` | checkpoint 恢复与重跑 | 第 2 个 500 行批次提交前/后分别崩溃 | A2 runner | 同 run resume、新 run rerun、指定 checkpoint recovery | cursor 只在提交后推进；未提交批整批重放；计数闭合；只处理显式 run/range；checksum 不匹配阻断 | - | recovery summary | MIGRATION_MYSQL | A2 |
| `SEC-048` | manifest/建表顺序 | 修改种子源一字节；空库记录 DDL 顺序 | A2 runner | 执行 seed/DDL 契约检查 | hash 变化产生 `MIG-SEED-MANIFEST-MISMATCH`；27 张契约表全在顺序中；循环 FK 仅 Phase D 追加 | - | BLOCKING anomaly/DDL report | STATIC_CONTRACT + MIGRATION_MYSQL | A2 |

## 3. A2 迁移专项断言

1. 在 MySQL 8.0.34 或更高 8.0.x 上，空库连续应用 0000-0014 + A2；24 张业务基础表、3 张迁移基础设施表存在，6 张现有表追加字段完成；第二次执行不重复种子或回填。
2. V3.2.4 样本库每个账号恰有一个 consumer；project owner=engineer 时只建一个成员、两个角色。
3. 三套认证每条可通过 legacy source 追溯；孤儿材料、状态矛盾和缺用户全部进入 `migration_anomalies`。
4. 恢复脚本只处理显式 migrationRunId 和可选 checkpointKey；存在 A2 后业务引用时拒绝硬删并报告。
5. 迁移失败点 resume、新 run rerun、备份恢复重跑和并发执行均不产生重复开放申请、职务、成员或邀请。
6. `submittedBy -> reviewerProjectMembershipId = FORBIDDEN`；当前基线所有历史 reviewer 均 NULL，且每条未知事实产生去重后的 `MIG-REVIEWER-UNKNOWN`。
7. ADK-01—06 全部验证并发唯一和终态清空；六张模式 A 关系表全部验证受控重新激活与追加审计。
8. CFK-01—13 均以直接 SQL 负向夹具验证；多态例外必须同时通过 CHECK、注册表、行锁和 `SEC-045`。
9. 所有 anomaly code 都能解析到严重度/handling；任何 BLOCKING 都使 run failed 并阻止 completed。

## 4. 阻断规则

任一越权、职责分离、敏感字段、迁移幂等或撤权即时性用例失败，均阻断对应批次。A1 只冻结用例；未实现不等于通过。
